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
                          ├─ launch gate + WIP cap    (agent_launch_gate.md)
                          ├─ assigns 1 sub-agent per ticket/theme (own worktree)
                          ├─ audits results (+ optional auditor agent) → opens PRs
                          ├─ owner_decision_queue.md  (needs a human call)
                          └─ recovery_board.md        (branches/worktrees/residue)
```

## The files

| File | Goes where | What it does |
| --- | --- | --- |
| `AGENTS.md` | your repo **root** | House rules every agent follows: one-task-one-branch, commit-only-your-files, **branch & merge safety** (verify a PR isn't already merged before pushing — they merge out-of-band), worktree completion protocol, and your project's migration/check conventions. |
| `clickfix_rootcause_bugs.md` | `.clickfix/` | The shared ledger. `/clickfix-doc` appends a diagnosis per ticket; the orchestrator reads it each cycle. |
| `integrator_role.md` | `.clickfix/` | The orchestrator's standing instructions — how to assign, audit, report, reconcile state from tools, and never silently close a diagnosis-only ticket. |
| `agent_launch_gate.md` | `.clickfix/` | Pre-launch checklist + WIP cap (max 3 impl + 1 audit agent). The guardrail that stops the fleet ballooning into dozens of un-audited agents. |
| `owner_decision_queue.md` | `.clickfix/` | Tickets that need *your* product call before code is written. Keeps decisions from getting lost. |
| `recovery_board.md` | `.clickfix/` | Live state: active agents, PRs awaiting checks, audit blockers, and leftover branches/worktrees/stashes to clean up. |

## Setup

**One command** (recommended) — from your project root:

```bash
clickfix orchestrate
```

That copies `AGENTS.md` to your repo root and the coordination docs into `.clickfix/`
(never overwriting files you've already edited), and gitignores `.clickfix/`. It also
**auto-fills what it can detect**, so you're not left staring at placeholders:

- **`AGENTS.md`** — detects your stack from lockfiles/config (pnpm/npm/yarn/bun, TypeScript,
  Python/pytest, Go, Rust, Supabase migrations) and pre-fills the "checks that must pass
  before a PR" commands.
- **`integrator_role.md`** — fills the owner (from `git config user.name`), the shared-checkout
  path, and the GitHub repo (from `origin`) so PR links come out clickable.

Then, in a Claude Code session rooted in the project, run **`/clickfix-orchestrate`**. On its
**first run it finishes setup *with you*** — confirms the auto-detected check commands, fixes
the owner/repo if wrong, and asks the one thing it can't detect (**where tickets come from** —
toolbar, `BACKLOG.md`, GitHub issues, …) — then runs the loop. (`/clickfix-orchestrate` ships
with `clickfix install`, alongside `/clickfix` and `/clickfix-doc`.)

**By hand**, if you prefer: copy `AGENTS.md` to your repo root, copy the other files into
`.clickfix/`, `echo ".clickfix/" >> .gitignore`, fill the check commands + owner/checkout path
yourself, and point your orchestrator agent at `.clickfix/integrator_role.md`.

### Running it continuously (optional)

The loop runs on demand each time you invoke `/clickfix-orchestrate`. For hands-off operation
you can schedule two recurring checks — a ~10-min **backlog poll** and a ~30-min **boss check**
(reconcile + launch gate) — with whatever scheduler you have (Claude Code scheduled tasks, cron,
or a `/loop` runner). `clickfix orchestrate` doesn't create these; `/clickfix-orchestrate` offers
to set them up on first run. See "Scheduling the loop" in `integrator_role.md`.

These are **starting points** — read them, delete what you don't want, and tune the rules
(audit strictness, WIP cap, reporting cadence, PR conventions) to how you actually work.
