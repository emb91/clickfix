import http from "node:http"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"

const here = path.dirname(fileURLToPath(import.meta.url))

// Standalone "page feedback" sidecar.
// Serves the toolbar script and a tiny JSON mailbox. Notes from the in-browser
// toolbar are appended to `<dir>/.feedback/inbox.jsonl`, which a coding agent
// (Claude Code, Cursor, etc.) reads to make edits. No host-app backend required.

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

  async function setStatus(ids, status) {
    const set = new Set(ids)
    const items = await readAll()
    await writeAll(items.map((e) => (set.has(e.id) ? { ...e, status } : e)))
  }

  // --- agent runner --------------------------------------------------------
  // "Work now" spawns ONE headless coding-agent process that works every open
  // note. Notes are marked in_progress on dispatch and done when the agent exits
  // cleanly (so the agent only needs to edit files — no callback permissions).
  let lastRun = { running: false, startedAt: null, finishedAt: null, dispatched: 0, ok: null, log: "" }

  function agentArgs(prompt) {
    // Override the whole command with CLICKFIX_RUN_CMD (placeholders: {prompt} {port}),
    // else default to Claude Code headless. Bin overridable via CLICKFIX_AGENT_BIN.
    const bin = process.env.CLICKFIX_AGENT_BIN || "claude"
    return {
      bin,
      args: ["-p", prompt, "--permission-mode", "acceptEdits"],
    }
  }

  function buildPrompt(notes) {
    const lines = notes.map((n, i) => {
      const where = n.source_file
        ? `${n.source_file}${n.line ? ":" + n.line : ""}`
        : `component ${n.component || "?"}${n.component_chain ? " (" + n.component_chain.join(" › ") + ")" : ""}, selector ${n.selector || "?"}`
      return `${i + 1}. [${n.id}] route ${n.route || "?"} — ${where}\n   text: ${n.text || "(none)"}\n   DO: ${n.instruction}`
    })
    return [
      `You are working a batch of UI feedback notes left in this project via the clickfix toolbar.`,
      `For each note: open the indicated source location (or locate it via component + selector + on-screen text), make the edit described in DO, keeping the surrounding code style. Edit files only; do not run servers or commit.`,
      `If a note is ambiguous or you cannot safely make the change, skip it and say why at the end.`,
      ``,
      `Notes:`,
      ...lines,
      ``,
      `When done, give a one-line summary per note id (done / skipped + reason).`,
    ].join("\n")
  }

  async function runAgent() {
    if (lastRun.running) return { error: "busy" }
    const open = (await readAll()).filter((e) => e.status === "open")
    if (!open.length) return { dispatched: 0 }
    const ids = open.map((e) => e.id)
    await setStatus(ids, "in_progress")

    const prompt = buildPrompt(open)
    const { bin, args } = agentArgs(prompt)
    lastRun = { running: true, startedAt: new Date().toISOString(), finishedAt: null, dispatched: ids.length, ok: null, log: "" }

    let child
    try {
      // stdin ignored so headless `claude` doesn't wait on a pipe for input.
      child = spawn(bin, args, { cwd: dir, env: process.env, stdio: ["ignore", "pipe", "pipe"] })
    } catch (err) {
      await setStatus(ids, "open")
      lastRun = { ...lastRun, running: false, finishedAt: new Date().toISOString(), ok: false, log: String(err) }
      return { error: "spawn_failed", detail: String(err) }
    }

    let out = ""
    child.stdout?.on("data", (d) => ((out += d), process.stdout.write(d)))
    child.stderr?.on("data", (d) => ((out += d), process.stderr.write(d)))
    child.on("error", async (err) => {
      await setStatus(ids, "open")
      lastRun = { ...lastRun, running: false, finishedAt: new Date().toISOString(), ok: false, log: String(err) }
    })
    child.on("close", async (code) => {
      if (code === 0) await setStatus(ids, "done")
      else await setStatus(ids, "open") // failed → re-open so they show again
      lastRun = { ...lastRun, running: false, finishedAt: new Date().toISOString(), ok: code === 0, log: out.slice(-4000) }
      console.log(`clickfix: agent finished (exit ${code}); ${ids.length} note(s) ${code === 0 ? "done" : "re-opened"}`)
    })

    console.log(`clickfix: dispatched ${ids.length} note(s) to "${bin}"`)
    return { dispatched: ids.length }
  }

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
          instruction: body.instruction.trim(),
        }
        await fs.appendFile(FILE, JSON.stringify(entry) + "\n", "utf8")
        return json(res, 200, { ok: true, id: entry.id })
      }
      if (req.method === "PATCH") {
        const body = await readBody(req)
        if (!body || typeof body.id !== "string") return json(res, 400, { error: "id is required" })
        const next = body.status === "open" ? "open" : "done"
        const items = await readAll()
        let found = false
        const updated = items.map((e) => (e.id === body.id ? ((found = true), { ...e, status: next }) : e))
        if (!found) return json(res, 404, { error: "not found" })
        await fs.writeFile(FILE, updated.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8")
        return json(res, 200, { ok: true })
      }
    }

    if (url.pathname === "/run") {
      if (req.method === "POST") {
        const result = await runAgent()
        if (result.error === "busy") return json(res, 409, { error: "agent is already working" })
        if (result.error) return json(res, 500, result)
        return json(res, 200, { ok: true, dispatched: result.dispatched })
      }
      if (req.method === "GET") {
        return json(res, 200, {
          running: lastRun.running,
          dispatched: lastRun.dispatched,
          ok: lastRun.ok,
          startedAt: lastRun.startedAt,
          finishedAt: lastRun.finishedAt,
        })
      }
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
  return server
}
