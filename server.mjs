import http from "node:http"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"

const here = path.dirname(fileURLToPath(import.meta.url))

// Standalone "page feedback" sidecar.
// Serves the in-browser toolbar and a tiny JSON mailbox. Notes captured from the
// toolbar are appended to `<dir>/.feedback/inbox.jsonl`; you then work them in a
// Claude Code session running in the same project via the `/clickfix` command
// (`clickfix install` drops it in). No host-app backend, no headless agent.

export async function startServer({ port = 7331, dir = process.cwd() } = {}) {
  const mailboxDir = path.join(dir, ".feedback")
  const FILE = path.join(mailboxDir, "inbox.jsonl")
  await fs.mkdir(mailboxDir, { recursive: true })
  const toolbarPath = path.join(here, "toolbar.js")

  function cors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  }

  function json(res, code, obj) {
    res.writeHead(code, { "Content-Type": "application/json" })
    res.end(JSON.stringify(obj))
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let raw = ""
      req.on("data", (c) => (raw += c))
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {})
        } catch {
          resolve(null)
        }
      })
    })
  }

  async function readAll() {
    let raw = ""
    try {
      raw = await fs.readFile(FILE, "utf8")
    } catch {
      return []
    }
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  }

  async function writeAll(items) {
    await fs.writeFile(FILE, items.map((e) => JSON.stringify(e)).join("\n") + (items.length ? "\n" : ""), "utf8")
  }

  // All mailbox mutations (append, claim, status change) run through this lock so a
  // claim's read-modify-write can't interleave with another claim or an append —
  // that's what makes ticket allocation atomic across parallel /clickfix threads.
  let mailboxLock = Promise.resolve()
  function withLock(fn) {
    const next = mailboxLock.then(fn, fn)
    mailboxLock = next.then(
      () => {},
      () => {}
    )
    return next
  }

  // Atomically hand a single ticket to a worker: pick a matching open note, flip it
  // to in_progress, persist, and return it. Concurrent claims get different notes
  // (or null when the queue is drained), so threads never double-work a ticket.
  function claim({ id, kind } = {}) {
    return withLock(async () => {
      const items = await readAll()
      let target = null
      if (id) {
        target = items.find((e) => e.status === "open" && (e.id === id || e.id.startsWith(id)))
        if (!target) {
          const taken = items.find((e) => e.id === id || e.id.startsWith(id))
          return { note: null, reason: taken ? `already ${taken.status}` : "not found" }
        }
      } else {
        target = items.find((e) => e.status === "open" && (!kind || (e.kind || "ui") === kind))
        if (!target) return { note: null, reason: "no open tickets" }
      }
      const claimed = { ...target, status: "in_progress", claimed_at: new Date().toISOString() }
      await writeAll(items.map((e) => (e.id === target.id ? claimed : e)))
      console.log(`clickfix: claimed ${claimed.id.slice(0, 8)} (${claimed.kind}) — ${String(claimed.instruction).slice(0, 50)}`)
      return { note: claimed }
    })
  }

  const STATUSES = ["open", "in_progress", "done"]

  const server = http.createServer(async (req, res) => {
    cors(res)
    const url = new URL(req.url, `http://localhost:${port}`)

    if (req.method === "OPTIONS") {
      res.writeHead(204)
      return res.end()
    }

    if (url.pathname === "/toolbar.js") {
      const js = await fs.readFile(toolbarPath)
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      })
      return res.end(js)
    }

    if (url.pathname === "/feedback") {
      if (req.method === "GET") {
        const status = url.searchParams.get("status")
        const items = await readAll()
        return json(res, 200, { items: status ? items.filter((e) => e.status === status) : items })
      }
      if (req.method === "POST") {
        const body = await readBody(req)
        if (!body || typeof body.instruction !== "string" || !body.instruction.trim()) {
          return json(res, 400, { error: "instruction is required" })
        }
        const entry = {
          id: randomUUID(),
          status: "open",
          created_at: new Date().toISOString(),
          route: typeof body.route === "string" ? body.route : null,
          origin: typeof body.origin === "string" ? body.origin : null,
          framework: typeof body.framework === "string" ? body.framework : null,
          source_file: typeof body.source_file === "string" ? body.source_file : null,
          line: typeof body.line === "number" ? body.line : null,
          column: typeof body.column === "number" ? body.column : null,
          component: typeof body.component === "string" ? body.component : null,
          component_chain: Array.isArray(body.component_chain)
            ? body.component_chain.filter((c) => typeof c === "string").slice(0, 6)
            : null,
          selector: typeof body.selector === "string" ? body.selector : null,
          text: typeof body.text === "string" ? body.text.slice(0, 280) : null,
          kind: body.kind === "behavior" ? "behavior" : "ui",
          instruction: body.instruction.trim(),
        }
        await withLock(() => fs.appendFile(FILE, JSON.stringify(entry) + "\n", "utf8"))
        console.log(`clickfix: + ${entry.kind} note on ${entry.route || "?"} — ${entry.instruction.slice(0, 60)}`)
        return json(res, 200, { ok: true, id: entry.id })
      }
      if (req.method === "PATCH") {
        const body = await readBody(req)
        if (!body || typeof body.id !== "string") return json(res, 400, { error: "id is required" })
        const next = STATUSES.includes(body.status) ? body.status : "done"
        const result = await withLock(async () => {
          const items = await readAll()
          let found = false
          const updated = items.map((e) => (e.id === body.id ? ((found = true), { ...e, status: next }) : e))
          if (!found) return { found: false }
          await writeAll(updated)
          return { found: true }
        })
        if (!result.found) return json(res, 404, { error: "not found" })
        return json(res, 200, { ok: true, status: next })
      }
    }

    // Atomically claim a ticket: body { id?, kind? }. Returns { note } (now
    // in_progress) or { note: null, reason }. This is how parallel /clickfix
    // threads divide work without grabbing the same note.
    if (url.pathname === "/claim" && req.method === "POST") {
      const body = (await readBody(req)) || {}
      const result = await claim({
        id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined,
        kind: body.kind === "behavior" || body.kind === "ui" ? body.kind : undefined,
      })
      return json(res, 200, result)
    }

    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" })
      return res.end(`clickfix running.\nmailbox: ${FILE}\nscript:  <script src="http://localhost:${port}/toolbar.js"></script>\n`)
    }

    res.writeHead(404)
    res.end("Not found")
  })

  await new Promise((resolve) => server.listen(port, resolve))
  console.log(`clickfix  →  http://localhost:${port}`)
  console.log(`  mailbox: ${FILE}`)
  console.log(`  add to your site (dev only):`)
  console.log(`    <script src="http://localhost:${port}/toolbar.js"></script>`)
  console.log(`  then work the notes in Claude Code with:  /clickfix  (one ticket per thread)`)
  return server
}
