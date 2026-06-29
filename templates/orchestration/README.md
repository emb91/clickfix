# clickfix orchestration templates (advanced, optional)

clickfix's core loop is simple: capture tickets in the browser, work them in Claude
Code with `/clickfix` or `/clickfix-doc`. You do **not** need anything in this folder to
use clickfix.

These templates are for a heavier setup: **running a fleet of agents off the clickfix
backlog**, with one "orchestrator" agent that hands tickets to sub-agents, audits their
work, and opens PRs — while a human owner makes the product calls. If you're a solo
dev clicking through `/clickfix`, skip this. If you want a managed multi-agent pipeline,
these files are the scaffolding.

## The pattern

1. **`/clickfix-doc`** (or a polling agent running it) diagnoses each captured ticket into
   `clickfix_rootcause_bugs.md` — the shared **ledger** of root causes and proposed fixes.
2. An **orchestrator / integrator** agent reads the ledger every so often, and for each
   ticket (or theme) assigns **one owning sub-agent**, working in its own git worktree/branch.
3. Sub-agents fix → test → check second-order impacts → report back.
4. The orchestrator **audits** each result (diff review, checks, regressions), optionally with
   a separate read-only **auditor** agent, then opens **one PR per agent/theme**.
5. Anything that needs a human product decision goes to the **owner decision queue** instead of
   being silently "done." Loose branches/worktrees/stashes are tracked on the **recovery board**.

```
toolbar → tickets → /clickfix-doc → clickfix_rootcause_bugs.md (ledger)
                                          │
                          orchestrator (integrator_role.md)
                          ├─ assigns 1 sub-agent per ticket/theme (own worktree)
                          ├─ audits results (+ optional auditor agent) → opens PRs
                          ├─ owner_decision_queue.md  (needs a human call)
                          └─ recovery_board.md        (branches/worktrees/residue)
```

## The files

| File | Goes where | What it does |
| --- | --- | --- |
| `AGENTS.md` | your repo **root** | House rules every agent follows: one-PR-per-theme, worktree completion protocol, your project's migration/check conventions. |
| `clickfix_rootcause_bugs.md` | `.clickfix/` | The shared ledger. `/clickfix-doc` appends a diagnosis per ticket; the orchestrator reads it each cycle. |
| `integrator_role.md` | `.clickfix/` | The orchestrator's standing instructions — how to assign, audit, report, and never silently close a diagnosis-only ticket. |
| `owner_decision_queue.md` | `.clickfix/` | Tickets that need *your* product call before code is written. Keeps decisions from getting lost. |
| `recovery_board.md` | `.clickfix/` | Live state: active agents, PRs awaiting checks, audit blockers, and leftover branches/worktrees/stashes to clean up. |

## Setup

1. Copy `AGENTS.md` to your repo root and edit it for your stack (it's read by Claude Code
   and most coding agents automatically).
2. Copy the other four files into your project's `.clickfix/` folder.
3. **Gitignore `.clickfix/`** — these are local working/coordination docs, not source:
   ```
   echo ".clickfix/" >> .gitignore
   ```
4. Point your orchestrator agent at `.clickfix/integrator_role.md` as its standing brief
   (e.g. paste it in, or tell the agent to read and follow it), and let it run the loop.

These are **starting points** — read them, delete what you don't want, and tune the rules
(audit strictness, reporting cadence, PR conventions) to how you actually work.
