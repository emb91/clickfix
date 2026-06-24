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
  // sessionId + lastMessage power the clarification loop: after a run we keep the
  // agent's Claude Code session id so a follow-up reply can `--resume` it with full
  // context, and its last text so the toolbar can show what it said / asked.
  let lastRun = { running: false, startedAt: null, finishedAt: null, dispatched: 0, ok: null, log: "", sessionId: null, lastMessage: null }

  function agentArgs(prompt, resume) {
    // Bin overridable via CLICKFIX_AGENT_BIN. stream-json (requires --verbose) lets us
    // surface each step live to the terminal + widget instead of waiting for the end.
    // resume (a session id) continues a prior conversation instead of starting fresh.
    const bin = process.env.CLICKFIX_AGENT_BIN || "claude"
    const args = ["-p", prompt, "--permission-mode", "acceptEdits", "--output-format", "stream-json", "--verbose"]
    if (resume) args.push("--resume", resume)
    return { bin, args }
  }

  function shortPath(p) {
    if (!p) return ""
    const m = String(p).match(/((?:app|components|lib|src|pages|context|hooks)\/.*)/)
    return m ? m[1] : String(p).split("/").slice(-2).join("/")
  }

  // Turn one stream-json event into human-readable activity line(s).
  function formatEvent(evt) {
    const out = []
    if (!evt || typeof evt !== "object") return out
    if (evt.type === "assistant" && evt.message && Array.isArray(evt.message.content)) {
      for (const b of evt.message.content) {
        if (b.type === "text" && b.text && b.text.trim()) {
          out.push(b.text.trim().replace(/\s+/g, " ").slice(0, 160))
        } else if (b.type === "tool_use") {
          const i = b.input || {}
          const hint = i.file_path
            ? shortPath(i.file_path)
            : i.path
            ? shortPath(i.path)
            : i.pattern
            ? String(i.pattern).slice(0, 60)
            : i.command
            ? String(i.command).slice(0, 60)
            : ""
          out.push("↳ " + (b.name || "tool") + (hint ? " " + hint : ""))
        }
      }
    }
    return out
  }

  function noteLines(notes) {
    return notes.map((n, i) => {
      const where = n.source_file
        ? `${n.source_file}${n.line ? ":" + n.line : ""}`
        : `component ${n.component || "?"}${n.component_chain ? " (" + n.component_chain.join(" › ") + ")" : ""}, selector ${n.selector || "?"}`
      return `${i + 1}. [${n.id}] route ${n.route || "?"} — ${where}\n   text: ${n.text || "(none)"}\n   DO: ${n.instruction}`
    })
  }

  // Two kinds of note get two mindsets, run in separate passes (never bundled):
  //  • ui       — surgical visual edit at the clicked location.
  //  • behavior — the clicked element is a SYMPTOM; trace upstream to the root
  //               cause, then DIAGNOSE first (propose a fix, edit nothing) and
  //               wait for the user to approve via a follow-up reply.
  function buildPrompt(notes, kind) {
    if (kind === "behavior") {
      return [
        `You are triaging a batch of BEHAVIOUR / bug reports left via the clickfix toolbar.`,
        `Each note points at the place in the UI where a problem SHOWED UP, but the clicked element is usually just the symptom — not the cause (e.g. wrong data on screen, a nonsensical agent reply).`,
        `For each note: treat the location/selector/text only as a starting point. Investigate the data flow and logic UPSTREAM — where the value is fetched, computed, prompted, or passed in — and find the ROOT CAUSE. Do NOT fix it by changing the UI to hide the symptom.`,
        ``,
        `IMPORTANT — this is a DIAGNOSIS pass. Do NOT edit any files yet. For each note, report:`,
        `  - root cause (the file:line where the real problem lives)`,
        `  - the specific fix you propose`,
        `  - anything you're unsure about`,
        `Then STOP. The user will reply to approve or redirect; only after that should you make changes.`,
        ``,
        `Notes:`,
        ...noteLines(notes),
      ].join("\n")
    }
    return [
      `You are working a batch of UI feedback notes left in this project via the clickfix toolbar.`,
      `For each note: open the indicated source location (or locate it via component + selector + on-screen text), make the edit described in DO, keeping the surrounding code style. Edit files only; do not run servers or commit.`,
      `If a note is ambiguous or you cannot safely make the change, skip it and say why at the end.`,
      ``,
      `Notes:`,
      ...noteLines(notes),
      ``,
      `When done, give a one-line summary per note id (done / skipped + reason).`,
    ].join("\n")
  }

  // Wire one child process's stream-json output → live activity, captured session
  // id, and the agent's last text. ids/kind drive how note statuses settle on
  // exit; a reply pass (ids null) leaves statuses alone.
  function streamChild(child, ids, kind) {
    let buf = ""
    let errOut = ""
    child.stdout?.on("data", (chunk) => {
      buf += chunk.toString()
      let nl
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (!line.trim()) continue
        let evt
        try {
          evt = JSON.parse(line)
        } catch {
          continue
        }
        if (evt.session_id) lastRun.sessionId = evt.session_id // resume target for replies
        if (evt.type === "assistant" && evt.message && Array.isArray(evt.message.content)) {
          for (const b of evt.message.content) {
            if (b.type === "text" && b.text && b.text.trim()) lastRun.lastMessage = b.text.trim()
          }
        }
        for (const msg of formatEvent(evt)) {
          lastRun.activity = msg
          lastRun.recent.push(msg)
          if (lastRun.recent.length > 50) lastRun.recent.shift()
          console.log("  " + msg)
        }
      }
    })
    child.stderr?.on("data", (d) => ((errOut += d), process.stderr.write(d)))
    child.on("error", async (err) => {
      if (ids) await setStatus(ids, "open")
      lastRun = { ...lastRun, running: false, finishedAt: new Date().toISOString(), ok: false, activity: "error", log: String(err) }
    })
    child.on("close", async (code) => {
      if (ids) {
        // ui: clean exit means the edit is done. behavior: the diagnosis pass is
        // done but the fix isn't applied yet — keep notes in_progress (awaiting the
        // user's approval) so they aren't marked resolved prematurely.
        if (code !== 0) await setStatus(ids, "open")
        else if (kind === "ui") await setStatus(ids, "done")
      }
      lastRun = {
        ...lastRun,
        running: false,
        finishedAt: new Date().toISOString(),
        ok: code === 0,
        activity: code === 0 ? (kind === "behavior" ? "diagnosed — awaiting your reply" : "done") : "finished with issues",
        log: errOut.slice(-2000),
      }
      console.log(`clickfix: agent finished (exit ${code})${ids ? `; ${ids.length} ${kind} note(s)` : " (reply)"}`)
    })
  }

  async function runAgent(kind = "ui") {
    if (lastRun.running) return { error: "busy" }
    const open = (await readAll()).filter((e) => e.status === "open" && (e.kind || "ui") === kind)
    if (!open.length) return { dispatched: 0 }
    const ids = open.map((e) => e.id)
    await setStatus(ids, "in_progress")

    const { bin, args } = agentArgs(buildPrompt(open, kind))
    lastRun = {
      running: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      dispatched: ids.length,
      ok: null,
      activity: "starting…",
      recent: [],
      log: "",
      sessionId: null, // a new batch starts a fresh conversation
      lastMessage: null,
      kind,
      pendingIds: kind === "behavior" ? ids : [], // behavior notes await an approval reply
    }

    let child
    try {
      // stdin ignored so headless `claude` doesn't wait on a pipe for input.
      child = spawn(bin, args, { cwd: dir, env: process.env, stdio: ["ignore", "pipe", "pipe"] })
    } catch (err) {
      await setStatus(ids, "open")
      lastRun = { ...lastRun, running: false, finishedAt: new Date().toISOString(), ok: false, activity: "couldn't start", log: String(err) }
      return { error: "spawn_failed", detail: String(err) }
    }
    streamChild(child, ids, kind)
    console.log(`clickfix: dispatched ${ids.length} ${kind} note(s) to "${bin}" — streaming progress below`)
    return { dispatched: ids.length }
  }

  // A follow-up message in the same conversation: resumes the captured session so
  // the agent keeps full context ("yes, go ahead" / "no — the real issue is X").
  async function runReply(text) {
    if (lastRun.running) return { error: "busy" }
    if (!lastRun.sessionId) return { error: "no_session" }
    const { bin, args } = agentArgs(text, lastRun.sessionId)
    lastRun = { ...lastRun, running: true, startedAt: new Date().toISOString(), finishedAt: null, ok: null, activity: "thinking…", recent: [], log: "", lastMessage: null }

    let child
    try {
      child = spawn(bin, args, { cwd: dir, env: process.env, stdio: ["ignore", "pipe", "pipe"] })
    } catch (err) {
      lastRun = { ...lastRun, running: false, finishedAt: new Date().toISOString(), ok: false, activity: "couldn't start", log: String(err) }
      return { error: "spawn_failed", detail: String(err) }
    }
    streamChild(child, null, lastRun.kind)
    console.log(`clickfix: reply dispatched to "${bin}" (resume ${String(lastRun.sessionId).slice(0, 8)}…)`)
    return { ok: true }
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
          kind: body.kind === "behavior" ? "behavior" : "ui",
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
        const body = await readBody(req)
        const kind = body && body.kind === "behavior" ? "behavior" : "ui"
        const result = await runAgent(kind)
        if (result.error === "busy") return json(res, 409, { error: "agent is already working" })
        if (result.error) return json(res, 500, result)
        return json(res, 200, { ok: true, dispatched: result.dispatched })
      }
      if (req.method === "GET") {
        return json(res, 200, {
          running: lastRun.running,
          dispatched: lastRun.dispatched,
          ok: lastRun.ok,
          activity: lastRun.activity || null,
          recent: lastRun.recent || [],
          startedAt: lastRun.startedAt,
          finishedAt: lastRun.finishedAt,
          // clarification loop
          kind: lastRun.kind || null,
          canReply: !!lastRun.sessionId,
          lastMessage: lastRun.lastMessage || null,
          pendingIds: lastRun.pendingIds || [],
        })
      }
    }

    // Follow-up message that resumes the agent's session (clarify / approve / redirect).
    if (url.pathname === "/reply" && req.method === "POST") {
      const body = await readBody(req)
      if (!body || typeof body.text !== "string" || !body.text.trim()) {
        return json(res, 400, { error: "text is required" })
      }
      const result = await runReply(body.text.trim())
      if (result.error === "busy") return json(res, 409, { error: "agent is already working" })
      if (result.error === "no_session") return json(res, 409, { error: "no conversation to reply to yet" })
      if (result.error) return json(res, 500, result)
      return json(res, 200, { ok: true })
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
