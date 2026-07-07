---
description: clickfix — diagnose each ticket and write findings to the project's root-cause doc, then close it. No code changes.
argument-hint: "[note id/prefix, or empty for the next ticket]"
---

clickfix **diagnose-and-document** mode. Your job per ticket is to **investigate and
write up your findings only — do NOT implement the fix**. Claim a ticket, work out the
root cause, write your full working into the review doc, then close the ticket. A
separate review agent (or a later `/clickfix` run) reads the doc and implements.

Use this in the project whose clickfix sidecar is running. Paths are relative to the
current session's project:
- Sidecar base URL: **`http://localhost:7331`** (default port; use your `--port` if different).
- Review doc: **`.clickfix/clickfix_rootcause_bugs.md`** — if it has an "Agent update
  rule" near the top, follow it. If the file doesn't exist, create it with a short header.

The argument passed to this command is: `$ARGUMENTS`

## 0. Talk to THIS project's sidecar (never diagnose another repo's tickets)

clickfix is **per-project** — each repo runs its own sidecar, and this command is global, so it must
target the right one. Before claiming anything:

1. **Find this project's port:** read `.feedback/sidecar.json` in the project root and use its
   `port`; if that file is missing, fall back to `7331`. Base URL = `http://localhost:<port>`.
2. **Verify identity:** `curl -s http://localhost:<port>/health` and compare its `dir` (resolve
   symlinks) to this project's root (`git rev-parse --show-toplevel`, else the cwd, via `realpath`).
   If they **don't match** — or nothing responds — **STOP** and tell me: *"the clickfix sidecar on
   :<port> is serving `<its dir>`, not this project. Start `clickfix` in this project first, then
   re-run me."* Never diagnose a ticket from a sidecar serving a different repo.

Use that resolved base URL for the sidecar calls below (written with the default `:7331`).

## 1. Claim a ticket

- **If the argument is non-empty**, claim that specific note (id or short prefix):
  ```
  curl -s -X POST http://localhost:7331/claim -H 'Content-Type: application/json' -d '{"id":"$ARGUMENTS"}'
  ```
- **If empty**, claim the next available ticket:
  ```
  curl -s -X POST http://localhost:7331/claim -H 'Content-Type: application/json' -d '{}'
  ```

`{"note": {...}}` → it's yours (`in_progress`), no other thread will get it. `{"note": null,
"reason": "..."}` → nothing to claim; report the reason and stop. If `curl` can't connect,
the sidecar isn't running in this project — say so and stop. Tell me which ticket you
claimed before digging in.

## 2. Investigate — diagnosis ONLY (do NOT edit application code)

Find the real cause and the fix, but **do not apply it**:
- Read the source, trace the data/logic UPSTREAM from the clicked element to the root cause.
- Use whatever read-only tools help (grep, the DB via MCP, render the preview) — just don't
  change app code or run migrations.
- Work out a concrete recommended fix (file:line + the exact change), and note any other
  bugs / risks / decisions you spot along the way.

## 3. Write ALL your working into the doc

Append a **new section at the bottom** of `.clickfix/clickfix_rootcause_bugs.md`, with a
heading keyed by the **ticket id** (unique + stable) — never edit existing sections. Match
the structure and depth of entries already in the doc. Include:

- **Ticket** — id, route, and the note's `instruction` (quoted).
- **What I investigated** — files/queries/tools, with the key findings and any evidence.
- **Root cause** — file:line and why.
- **Recommended solution(s)** — concrete, with file:line; flag clearly if a product
  decision is needed (A vs B) rather than a mechanical fix.
- **Other issues noticed** — anything out of scope worth the reviewer's eyes.

This doc is the **only deliverable** — the reviewer acts solely from it, so make sure
everything you found and concluded is captured here. You will NOT implement the fix.

## 4. Close the ticket

Once your working is fully in the doc, close the ticket via the sidecar (the server owns the
mailbox — don't hand-edit it):
```
curl -s -X PATCH http://localhost:7331/feedback -H 'Content-Type: application/json' -d '{"id":"<id>","status":"done"}'
```
In this mode, **documented = done** (no code changed); the doc is the handoff.

## 5. Next ticket

- If an argument was given, you handled that one specific ticket — **stop**.
- If no argument, claim the **next** ticket and repeat until claim returns `{"note": null}`.
  One ticket at a time, so parallel threads divide the queue.

## Rules
- NEVER edit application code or apply a fix in this mode — diagnosis + documentation only.
- Append-only to the doc, heading keyed by ticket id; don't rewrite other sections.
- The doc lives under `.clickfix/` (gitignore it in the target project) — no commit needed.
