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
  npx clickfix install                   install the /clickfix + /clickfix-doc Claude Code commands

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

const port = parseInt(opt("--port", process.env.CLICKFIX_PORT || "7331"), 10)
const dir = opt("--dir", process.cwd())

startServer({ port, dir }).catch((err) => {
  console.error("clickfix failed to start:", err)
  process.exit(1)
})
