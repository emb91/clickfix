#!/usr/bin/env node
import { startServer } from "../server.mjs"

const args = process.argv.slice(2)
function opt(name, def) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

if (args.includes("-h") || args.includes("--help")) {
  console.log(`clickfix — in-browser feedback toolbar → local mailbox for AI coding agents

Usage:
  npx clickfix [--port 7331] [--dir .]

Then add this to your site (development only):
  <script src="http://localhost:7331/toolbar.js"></script>

Notes land in <dir>/.feedback/inbox.jsonl for your agent to read.`)
  process.exit(0)
}

const port = parseInt(opt("--port", process.env.CLICKFIX_PORT || "7331"), 10)
const dir = opt("--dir", process.cwd())

startServer({ port, dir }).catch((err) => {
  console.error("clickfix failed to start:", err)
  process.exit(1)
})
