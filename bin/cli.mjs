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
  npx clickfix install                   install the /clickfix Claude Code command

Then add this to your site (development only):
  <script src="http://localhost:7331/toolbar.js"></script>

Click an element, type your feedback — it lands in <dir>/.feedback/inbox.jsonl.
Work the notes in a Claude Code session in the same project with:  /clickfix`)
  process.exit(0)
}

// `clickfix install` — drop the /clickfix slash command into ~/.claude/commands so
// it's available in Claude Code from any project.
if (args[0] === "install") {
  const src = path.join(here, "..", "commands", "clickfix.md")
  const destDir = path.join(os.homedir(), ".claude", "commands")
  const dest = path.join(destDir, "clickfix.md")
  try {
    await fs.mkdir(destDir, { recursive: true })
    await fs.copyFile(src, dest)
    console.log(`clickfix: installed /clickfix command → ${dest}`)
    console.log(`  Run /clickfix in a Claude Code session in your project to work captured notes.`)
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
