---
description: Answer ❓ Ask tickets — spawn a research subagent, give an ELI5 answer, log to .clickfix/clickfix_questions.md. Escalates to the bug ledger only if you reject the answer.
argument-hint: "[optional: a question ticket id, or empty for the next]"
---

You work **`❓ Ask` (kind `question`) tickets** — *questions about the code*, not change requests
("is this button tied to monthly or annual credits?"). You **answer** them; you never edit code,
open PRs, or assign implementation agents. Your ledger is `.clickfix/clickfix_questions.md`
(separate from the root-cause bug ledger — the orchestrator never reads it).

Sidecar base URL: **`http://localhost:7331`** (default; use your `--port` if different).

The argument passed to this command is: `$ARGUMENTS`

## 0. Talk to THIS project's sidecar (never answer from another repo's tickets)

clickfix is **per-project** — each repo runs its own sidecar, and this command is global, so it must
target the right one. Before claiming anything:

1. **Find this project's port:** read `.clickfix/sidecar.json` in the project root and use its
   `port`; if that file is missing, fall back to `7331`. Base URL = `http://localhost:<port>`.
2. **Verify identity:** `curl -s http://localhost:<port>/health` and compare its `dir` (resolve
   symlinks) to this project's root (`git rev-parse --show-toplevel`, else the cwd, via `realpath`).
   If they **don't match** — or nothing responds — **STOP** and tell me: *"the clickfix sidecar on
   :<port> is serving `<its dir>`, not this project. Start `clickfix` in this project first, then
   re-run me."* Never answer from a sidecar serving a different repo.

Use that resolved base URL for the sidecar calls below (written with the default `:7331`).

## 1. Claim a question ticket

- If the argument is non-empty, claim that id:
  ```
  curl -s -X POST http://localhost:7331/claim -H 'Content-Type: application/json' -d '{"id":"$ARGUMENTS"}'
  ```
- If empty, claim the next **question**:
  ```
  curl -s -X POST http://localhost:7331/claim -H 'Content-Type: application/json' -d '{"kind":"question"}'
  ```
- `{"note":{...}}` → it's yours. `{"note":null, "reason":"..."}` → nothing to answer; stop. If
  `curl` can't connect, the sidecar isn't running in this project — say so and stop.
- Show it to me as a clean one-liner before you dig in: `ticket <id> · <route>:<line> · "<question>"`.

## 2. Research the answer (spawn a subagent)

- Spin up a **read-only research subagent** to answer the question from the codebase — trace the
  relevant `source_file` / `component` / data + logic to the actual source of truth. It
  investigates only; it changes nothing.
- Wait for its findings.

## 3. Answer + log + close

- Give me an **ELI5 answer** — plain English, with the `file:line` that backs it.
- Append the Q&A to `.clickfix/clickfix_questions.md` per its update rule.
- Close the ticket via the sidecar:
  ```
  curl -s -X PATCH http://localhost:7331/feedback -H 'Content-Type: application/json' -d '{"id":"<id>","status":"done"}'
  ```
- **Answered = done.** If I'm happy, we're finished — the orchestrator is never involved.

## 4. Escalate ONLY if I reject the answer

- If I say the answer reveals a real problem ("no, this is a problem because…"), append a **new
  ticket to `.clickfix/clickfix_rootcause_bugs.md`** (keyed by a fresh id) capturing the issue, the
  page:line, and enough context for the orchestrator to act. Then note in `clickfix_questions.md`
  that this question escalated → bug ticket `<id>`.
- That is the **only** path from a question to orchestrator work. Don't open a bug ticket otherwise.

## 5. Next

- If an argument was given, you handled that one — stop.
- Otherwise claim the next question and repeat until claim returns `{"note": null}`.

## Rules
- **Read-only** — research and answer, never edit code / open PRs / assign impl agents.
- Log every question to `clickfix_questions.md`; escalate to the bug ledger only on my rejection.
- One question at a time: claim → answer → close → next.
