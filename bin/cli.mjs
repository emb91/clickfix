#!/usr/bin/env node
import { startServer } from "../server.mjs"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
function opt(name, def) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

async function pathExists(p) {
  try { await fs.access(p); return true } catch { return false }
}
async function readText(p) {
  try { return await fs.readFile(p, "utf8") } catch { return null }
}

// Best-effort stack detection from lockfiles/config, so `clickfix orchestrate` can pre-fill
// AGENTS.md's check commands instead of leaving the user an "EDIT THIS" placeholder.
async function detectStack(dir) {
  const has = (f) => pathExists(path.join(dir, f))
  const stack = []   // human-readable stack bits for the summary line
  const checks = []  // { cmd, why } — commands that should pass before a PR
  const notes = []   // freeform guidance (migrations, monorepo caveats, …)

  // Node / JS / TS
  const pkgRaw = await readText(path.join(dir, "package.json"))
  if (pkgRaw) {
    let pkg = {}
    try { pkg = JSON.parse(pkgRaw) } catch {}
    let pm = "npm"
    if (await has("pnpm-lock.yaml")) pm = "pnpm"
    else if (await has("yarn.lock")) pm = "yarn"
    else if (await has("bun.lockb")) pm = "bun"
    const isMono = !!pkg.workspaces || (await has("pnpm-workspace.yaml"))
    const ts = await has("tsconfig.json")
    stack.push(`${ts ? "TypeScript" : "JS"}/${pm}${isMono ? " (monorepo)" : ""}`)
    const scripts = pkg.scripts || {}
    const run = pm === "npm" ? "npm run" : `${pm} run`
    for (const s of ["typecheck", "lint", "test", "build"]) {
      if (scripts[s]) checks.push({ cmd: `${run} ${s}`, why: `package.json script "${s}"` })
    }
    if (!scripts.typecheck && ts) {
      checks.push({ cmd: `npx tsc --noEmit`, why: `tsconfig.json present, no typecheck script` })
    }
    if (isMono) {
      notes.push("Monorepo detected — root scripts may need a package filter " +
        `(e.g. \`${pm} --filter <pkg> test\`); adjust per package.`)
    }
  }

  // Python
  const pyproject = await readText(path.join(dir, "pyproject.toml"))
  if (pyproject !== null || (await has("setup.py")) || (await has("requirements.txt"))) {
    stack.push("Python")
    let pytest = (await has("pytest.ini")) || (await has("tests"))
    if (!pytest && pyproject) pytest = /\[tool\.pytest/.test(pyproject)
    if (pytest) checks.push({ cmd: `pytest`, why: `pytest config / tests dir` })
  }

  // Go / Rust
  if (await has("go.mod")) { stack.push("Go"); checks.push({ cmd: `go test ./...`, why: `go.mod` }) }
  if (await has("Cargo.toml")) { stack.push("Rust"); checks.push({ cmd: `cargo test`, why: `Cargo.toml` }) }

  // Supabase
  if (await has("supabase/migrations")) {
    notes.push("Supabase migrations under `supabase/migrations/` — add forward migrations; " +
      "never rewrite an applied one. Supabase MCP can run remote SQL/history if the CLI is missing.")
  } else if (await has("supabase")) {
    notes.push("Supabase project detected (`supabase/`).")
  }

  return { stack, checks, notes }
}

// Render a detected-stack section and splice it into AGENTS.md just after the H1.
function agentsWithDetected(tpl, d) {
  const out = ["## Detected stack — auto-filled by `clickfix orchestrate` (verify, then trim)", ""]
  out.push(d.stack.length
    ? `Detected: ${d.stack.join(" · ")}.`
    : "No common stack markers found — fill in your check commands below.")
  out.push("")
  if (d.checks.length) {
    out.push("Checks that should pass before a PR (confirm these match how you actually run them):")
    for (const c of d.checks) out.push(`- \`${c.cmd}\`  — ${c.why}`)
    out.push("")
  }
  for (const n of d.notes) out.push(`- ${n}`)
  if (d.notes.length) out.push("")
  out.push("> Auto-detected from lockfiles/config. Verify the commands, then delete this note.")

  const lines = tpl.split("\n")
  const h1 = lines.findIndex((l) => /^#\s/.test(l))
  const at = h1 >= 0 ? h1 + 1 : 0
  lines.splice(at, 0, "", ...out)
  return lines.join("\n")
}

// Read a git config value from the project, or null if git/config isn't available.
function gitConfig(dir, key) {
  try {
    return execFileSync("git", ["-C", dir, "config", "--get", key], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null
  } catch { return null }
}
// "owner/repo" from a github remote URL (ssh or https), or null.
function parseRepo(url) {
  const m = url && url.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)
  return m ? m[1] : null
}
// Fill integrator_role.md with what we can know from git: owner, shared-checkout path, repo.
function fillIntegratorRole(tpl, { owner, checkout, repo }) {
  const t = tpl.split("<shared checkout path>").join(checkout)
  const hdr = ["> Auto-filled by `clickfix orchestrate` (adjust if wrong):",
    `> - Owner: ${owner || "set your name"}`,
    `> - Shared checkout: ${checkout}`]
  if (repo) {
    hdr.push(`> - GitHub repo: ${repo} — write PR links as ` +
      `[PR #NN](https://github.com/${repo}/pull/NN) so they're clickable.`)
  }
  const lines = t.split("\n")
  const h1 = lines.findIndex((l) => /^#\s/.test(l))
  const at = h1 >= 0 ? h1 + 1 : 0
  lines.splice(at, 0, "", ...hdr)
  return lines.join("\n")
}

if (args.includes("-h") || args.includes("--help")) {
  console.log(`clickfix — in-browser feedback toolbar → local mailbox, worked in Claude Code

Usage:
  npx clickfix [--port 7331] [--dir .]   start the sidecar (serves the toolbar + mailbox)
  npx clickfix install                   install the /clickfix Claude Code commands
  npx clickfix orchestrate [--dir .]     scaffold the multi-agent orchestrator setup into a project

Setup (one time):
  1. npx clickfix install                # adds the slash commands to ~/.claude/commands
  2. add to your site, DEV ONLY:
       <script src="http://localhost:7331/toolbar.js"></script>

Each session:
  - npx clickfix                         # run the sidecar in your project
  - click an element, type feedback → it lands in <dir>/.feedback/inbox.jsonl
  - in Claude Code (session rooted in your project):
       /clickfix       fix each ticket and commit it
       /clickfix-doc   diagnose each ticket into a review doc, no code changes

Requires Claude Code (the work happens via the slash commands).`)
  process.exit(0)
}

// `clickfix install` — drop the clickfix slash commands into ~/.claude/commands so
// they're available in Claude Code from any project. Installs every command shipped
// in the package's commands/ dir (/clickfix, /clickfix-doc, /clickfix-orchestrate).
if (args[0] === "install") {
  const srcDir = path.join(here, "..", "commands")
  const destDir = path.join(os.homedir(), ".claude", "commands")
  try {
    await fs.mkdir(destDir, { recursive: true })
    const files = (await fs.readdir(srcDir)).filter((f) => f.endsWith(".md"))
    for (const f of files) {
      await fs.copyFile(path.join(srcDir, f), path.join(destDir, f))
      console.log(`clickfix: installed /${f.replace(/\.md$/, "")} → ${path.join(destDir, f)}`)
    }
    console.log(`  In a Claude Code session in your project:`)
    console.log(`    /clickfix              — fix each ticket and commit it`)
    console.log(`    /clickfix-doc          — diagnose each ticket into .clickfix/clickfix_rootcause_bugs.md (no code changes)`)
    console.log(`    /clickfix-orchestrate  — run the multi-agent orchestrator loop (after \`clickfix orchestrate\`)`)
    console.log(`    /clickfix-decisions    — surface tickets needing an owner decision, record your rulings`)
  } catch (err) {
    console.error("clickfix: install failed:", err)
    process.exit(1)
  }
  process.exit(0)
}

// `clickfix orchestrate` — scaffold the multi-agent orchestration setup into a project:
// copy templates/orchestration/*.md into <dir> (AGENTS.md to the repo root, the rest into
// .clickfix/), gitignore .clickfix/, and print the kickoff. Never clobbers existing files,
// so it's safe to re-run after the repo's templates are updated.
if (args[0] === "orchestrate") {
  const srcDir = path.join(here, "..", "templates", "orchestration")
  const projectDir = path.resolve(opt("--dir", process.cwd()))
  const clickfixDir = path.join(projectDir, ".clickfix")
  try {
    await fs.mkdir(clickfixDir, { recursive: true })
    // What we can know without asking: stack (for AGENTS.md checks) + owner/repo (for integrator_role.md).
    const detected = await detectStack(projectDir)
    const owner = gitConfig(projectDir, "user.name")
    const repo = parseRepo(gitConfig(projectDir, "remote.origin.url"))
    const files = (await fs.readdir(srcDir)).filter((f) => f.endsWith(".md"))
    let created = 0
    let kept = 0
    let filledAgents = false
    let filledRole = false
    for (const f of files) {
      if (f === "README.md") continue // the templates README is docs, not a project file
      // AGENTS.md is house rules read from the repo root; the rest are coordination docs.
      const dest = f === "AGENTS.md" ? path.join(projectDir, f) : path.join(clickfixDir, f)
      const rel = path.relative(projectDir, dest)
      if (await pathExists(dest)) {
        console.log(`clickfix: kept (already exists) ${rel}`)
        kept++
        continue
      }
      const srcPath = path.join(srcDir, f)
      if (f === "AGENTS.md") {
        await fs.writeFile(dest, agentsWithDetected(await fs.readFile(srcPath, "utf8"), detected))
        filledAgents = true
      } else if (f === "integrator_role.md") {
        await fs.writeFile(dest, fillIntegratorRole(await fs.readFile(srcPath, "utf8"), {
          owner, checkout: projectDir, repo,
        }))
        filledRole = true
      } else {
        await fs.copyFile(srcPath, dest)
      }
      console.log(`clickfix: created ${rel}`)
      created++
    }
    if (filledAgents && detected.stack.length) {
      console.log(`clickfix: detected ${detected.stack.join(" · ")} — pre-filled AGENTS.md checks`)
    }
    if (filledRole && (owner || repo)) {
      console.log(`clickfix: pre-filled integrator_role.md (` +
        [owner && `owner ${owner}`, repo && `repo ${repo}`].filter(Boolean).join(", ") + `)`)
    }
    // Ensure .clickfix/ is gitignored (idempotent — matches ".clickfix" or ".clickfix/").
    const giPath = path.join(projectDir, ".gitignore")
    let gi = ""
    try { gi = await fs.readFile(giPath, "utf8") } catch {}
    const alreadyIgnored = gi
      .split(/\r?\n/)
      .some((l) => l.trim().replace(/\/$/, "") === ".clickfix")
    if (!alreadyIgnored) {
      const prefix = gi.length && !gi.endsWith("\n") ? "\n" : ""
      await fs.appendFile(
        giPath,
        `${prefix}\n# clickfix orchestration working docs (local coordination, not source)\n.clickfix/\n`
      )
      console.log(`clickfix: added .clickfix/ to .gitignore`)
    }
    console.log(`\nclickfix: orchestration scaffolded (${created} created, ${kept} kept) in ${projectDir}`)
    console.log(`Next:`)
    console.log(`  1. Skim AGENTS.md — check commands were auto-detected; verify/trim and add don't-touch zones.`)
    console.log(`  2. In a Claude Code session rooted here, run:  /clickfix-orchestrate`)
    console.log(`     (it confirms setup with you — ticket source + any gaps — then runs the loop).`)
  } catch (err) {
    console.error("clickfix: orchestrate failed:", err)
    process.exit(1)
  }
  process.exit(0)
}

const port = parseInt(opt("--port", process.env.CLICKFIX_PORT || "7331"), 10)
const dir = opt("--dir", process.cwd())

startServer({ port, dir }).catch((err) => {
  console.error("clickfix failed to start:", err)
  process.exit(1)
})
