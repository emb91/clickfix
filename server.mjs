import http from "node:http"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { spawn, execFile } from "node:child_process"

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

  // --- git "boxing" -------------------------------------------------------
  // Each conversation's edits get isolated onto their own clickfix/* branch and
  // opened as a PR, so the agent's work is a reviewable unit instead of loose
  // changes mixed into your working tree. We commit ONLY the files that changed
  // during the run (diff of `git status` before/after), leaving your own
  // uncommitted work alone. Modes via CLICKFIX_GIT: "pr" (default, branch+commit
  // +push+PR), "commit" (branch+commit only), "0"/"off" (disabled).
  const gitMode = (process.env.CLICKFIX_GIT || "pr").toLowerCase()
  const GIT_ENABLED = !["0", "off", "false", "no"].includes(gitMode)
  const AUTO_PUSH = GIT_ENABLED && !["commit", "local"].includes(gitMode)
  let gitRepo = null // cached: is `dir` inside a git work tree?

  function run(cmd, args) {
    return new Promise((resolve) => {
      execFile(cmd, args, { cwd: dir, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) =>
        resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: (stdout || "").trim(), err: (stderr || "").trim() })
      )
    })
  }
  const git = (args) => run("git", args)

  async function isGitRepo() {
    if (gitRepo !== null) return gitRepo
    const r = await git(["rev-parse", "--is-inside-work-tree"])
    gitRepo = r.code === 0 && r.out === "true"
    return gitRepo
  }
  async function modifiedPaths() {
    // Use plumbing that emits bare, NUL-separated, repo-root-relative paths — no
    // status prefixes to mis-slice (staged "M " vs unstaged " M" differ by a char)
    // and no quoting of odd filenames. Covers staged + unstaged tracked changes...
    const set = new Set()
    const tracked = await git(["diff", "--name-only", "-z", "HEAD"])
    if (tracked.code === 0) for (const p of tracked.out.split("\0").filter(Boolean)) set.add(p)
    // ...plus brand-new untracked files the agent may have created.
    const untracked = await git(["ls-files", "--others", "--exclude-standard", "-z"])
    if (untracked.code === 0) for (const p of untracked.out.split("\0").filter(Boolean)) set.add(p)
    return set
  }
  async function gitSnapshot() {
    if (!GIT_ENABLED || !(await isGitRepo())) return new Set()
    return modifiedPaths()
  }
  async function branchOnRemote(b) {
    const r = await git(["ls-remote", "--heads", "origin", b])
    return r.code === 0 && r.out.length > 0
  }
  function ghAvailable() {
    return new Promise((resolve) => execFile("gh", ["--version"], { cwd: dir }, (e) => resolve(!e)))
  }
  function stamp() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  }
  function truncate(s, n) {
    s = String(s || "")
    return s.length > n ? s.slice(0, n - 1) + "…" : s
  }
  function commitMessage(notes, kind) {
    const head = kind === "behavior" ? "clickfix: fix behaviour" : "clickfix: UI changes"
    const lines = notes.map((n) => `- ${n.instruction}${n.route ? ` (${n.route})` : ""}`)
    return [head, "", ...lines, "", "Made via the clickfix feedback toolbar."].join("\n")
  }
  function prText(notes, kind) {
    const route = (notes[0] && notes[0].route) || ""
    const verb = kind === "behavior" ? "fix" : "tweak"
    const title =
      notes.length === 1
        ? `clickfix: ${truncate(notes[0].instruction, 60)}`
        : `clickfix: ${notes.length} ${verb}${notes.length > 1 ? "s" : ""}${route ? ` on ${route}` : ""}`
    const rows = notes.map((n) => {
      const where = n.source_file ? `\`${n.source_file}${n.line ? ":" + n.line : ""}\`` : n.selector ? `\`${n.selector}\`` : ""
      return `- ${n.instruction}${where ? ` — ${where}` : ""}${n.route ? ` _(at ${n.route})_` : ""}`
    })
    const body = [
      `Changes captured via the **clickfix** feedback toolbar (${kind === "behavior" ? "behaviour fix" : "UI"}).`,
      "",
      ...rows,
      "",
      "🤖 Generated with clickfix",
    ].join("\n")
    return { title, body }
  }

  // Commit (and optionally push + PR) the agent's edits from the just-finished run.
  // Returns { prUrl?, message? } and updates the conversation's git state on lastRun.
  async function boxUp(kind) {
    if (!GIT_ENABLED || !(await isGitRepo())) return {}
    const before = lastRun.beforePaths || new Set()
    const after = await modifiedPaths()
    const changed = [...after].filter((p) => !before.has(p))
    if (!changed.length) return {} // nothing new (e.g. a diagnosis-only pass)

    const notes = lastRun.notes || []
    // Lazily create the conversation's branch the first time there's something to
    // commit — `switch -c` carries the uncommitted edits onto the new branch.
    if (!lastRun.gitBranch) {
      const baseRef = await git(["rev-parse", "--abbrev-ref", "HEAD"])
      lastRun.gitBase = baseRef.code === 0 && baseRef.out !== "HEAD" ? baseRef.out : null
      const suffix = (notes[0] && notes[0].id ? notes[0].id : "").slice(0, 4)
      const branch = `clickfix/${kind === "behavior" ? "fix" : "ui"}-${stamp()}${suffix ? "-" + suffix : ""}`
      const sw = await git(["switch", "-c", branch])
      if (sw.code !== 0) return { message: "couldn't create branch: " + (sw.err || sw.out) }
      lastRun.gitBranch = branch
      console.log(`clickfix: branched ${branch} off ${lastRun.gitBase || "HEAD"}`)
    }

    const add = await git(["add", "--", ...changed])
    if (add.code !== 0) return { message: "git add failed: " + add.err }
    const commit = await git(["commit", "-m", commitMessage(notes, kind), "--", ...changed])
    if (commit.code !== 0) return { message: "git commit failed: " + (commit.err || commit.out) }
    console.log(`clickfix: committed ${changed.length} file(s) to ${lastRun.gitBranch}`)
    if (!AUTO_PUSH) return { message: `committed to ${lastRun.gitBranch}` }

    const r = await git(["remote"])
    const hasRemote = r.code === 0 && r.out.length > 0
    if (!hasRemote || !(await ghAvailable())) {
      return { message: `committed to ${lastRun.gitBranch} (no remote/gh — PR skipped)` }
    }
    const push = await git(["push", "-u", "origin", lastRun.gitBranch])
    if (push.code !== 0) return { message: "git push failed: " + push.err }
    if (lastRun.prUrl) {
      console.log(`clickfix: pushed to existing PR ${lastRun.prUrl}`)
      return { prUrl: lastRun.prUrl, message: `updated PR ${lastRun.prUrl}` }
    }
    const { title, body } = prText(notes, kind)
    const prArgs = ["pr", "create", "--title", title, "--body", body]
    if (lastRun.gitBase && (await branchOnRemote(lastRun.gitBase))) prArgs.push("--base", lastRun.gitBase)
    const pr = await gh(prArgs)
    if (pr.code !== 0) return { message: "gh pr create failed: " + (pr.err || pr.out) }
    const url = (pr.out.match(/https?:\/\/\S+/) || [])[0] || pr.out
    lastRun.prUrl = url
    console.log(`clickfix: opened PR ${url}`)
    return { prUrl: url, message: `opened PR ${url}` }
  }
  const gh = (args) => run("gh", args)

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
      // Box up any edits this run produced onto the conversation's branch / PR.
      let gitMsg = ""
      if (code === 0) {
        try {
          const r = await boxUp(kind)
          gitMsg = r.message || ""
        } catch (e) {
          gitMsg = "git step failed: " + e
          console.log("clickfix: " + gitMsg)
        }
      }
      lastRun = {
        ...lastRun,
        running: false,
        finishedAt: new Date().toISOString(),
        ok: code === 0,
        activity: code === 0 ? (kind === "behavior" ? "diagnosed — awaiting your reply" : "done") : "finished with issues",
        log: errOut.slice(-2000),
        gitMessage: gitMsg || lastRun.gitMessage || null,
      }
      console.log(`clickfix: agent finished (exit ${code})${ids ? `; ${ids.length} ${kind} note(s)` : " (reply)"}${gitMsg ? " — " + gitMsg : ""}`)
    })
  }

  async function runAgent(kind = "ui") {
    if (lastRun.running) return { error: "busy" }
    const open = (await readAll()).filter((e) => e.status === "open" && (e.kind || "ui") === kind)
    if (!open.length) return { dispatched: 0 }
    const ids = open.map((e) => e.id)
    await setStatus(ids, "in_progress")

    const { bin, args } = agentArgs(buildPrompt(open, kind))
    const before = await gitSnapshot() // files already dirty — excluded from the commit
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
      // git "boxing" state — fresh per conversation
      notes: open,
      beforePaths: before,
      gitBranch: null,
      gitBase: null,
      prUrl: null,
      gitMessage: null,
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
    const before = await gitSnapshot() // re-snapshot so this turn's fix is what gets committed
    lastRun = { ...lastRun, running: true, startedAt: new Date().toISOString(), finishedAt: null, ok: null, activity: "thinking…", recent: [], log: "", lastMessage: null, beforePaths: before }

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
          // git boxing
          branch: lastRun.gitBranch || null,
          prUrl: lastRun.prUrl || null,
          gitMessage: lastRun.gitMessage || null,
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
  if (GIT_ENABLED) {
    const top = await git(["rev-parse", "--show-toplevel"])
    const target = top.code === 0 ? top.out : null
    if (target) {
      console.log(`  git: ${AUTO_PUSH ? "branch + commit + PR" : "branch + commit (no push)"} per conversation`)
      console.log(`  git target repo: ${target}`) // commits land HERE — the project you're editing, never clickfix
    } else {
      console.log(`  git: enabled but ${dir} is not a git repo — will no-op`)
    }
  } else {
    console.log(`  git: disabled (CLICKFIX_GIT=${gitMode})`)
  }
  console.log(`  add to your site (dev only):`)
  console.log(`    <script src="http://localhost:${port}/toolbar.js"></script>`)
  return server
}
