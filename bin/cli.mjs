#!/usr/bin/env node
import { startServer } from "../server.mjs"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
function opt(name, def) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
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
// in the package's commands/ dir (currently /clickfix and /clickfix-doc).
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
    console.log(`    /clickfix      — fix each ticket and commit it`)
    console.log(`    /clickfix-doc  — diagnose each ticket into .clickfix/clickfix_rootcause_bugs.md (no code changes)`)
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
    const files = (await fs.readdir(srcDir)).filter((f) => f.endsWith(".md"))
    let created = 0
    let kept = 0
    for (const f of files) {
      if (f === "README.md") continue // the templates README is docs, not a project file
      // AGENTS.md is house rules read from the repo root; the rest are coordination docs.
      const dest = f === "AGENTS.md" ? path.join(projectDir, f) : path.join(clickfixDir, f)
      const rel = path.relative(projectDir, dest)
      try {
        await fs.access(dest)
        console.log(`clickfix: kept (already exists) ${rel}`)
        kept++
      } catch {
        await fs.copyFile(path.join(srcDir, f), dest)
        console.log(`clickfix: created ${rel}`)
        created++
      }
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
    console.log(`  1. Edit AGENTS.md for your stack (check commands, migrations, don't-touch zones).`)
    console.log(`  2. Skim .clickfix/integrator_role.md and set the owner name + shared checkout path.`)
    console.log(`  3. In a Claude Code session rooted here, run:  /clickfix-orchestrate`)
    console.log(`     (the agent reads .clickfix/integrator_role.md and runs the loop).`)
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
