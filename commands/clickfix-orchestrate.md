---
description: Run the clickfix orchestrator loop — reconcile state, assign one agent per ticket/theme, audit, and open PRs. Reads .clickfix/integrator_role.md.
argument-hint: "[optional: a ticket id/theme to focus, or empty for the full loop]"
---

You are the **orchestrator / integrator** for this project. Your standing brief is
`.clickfix/integrator_role.md` — **read it now and follow it**. If it doesn't exist, tell me
to run `clickfix orchestrate` in this project first, then stop.

The argument passed to this command is: `$ARGUMENTS`

## Output discipline (read first)

Do §0–§2 with **minimal narration** — no step-by-step "let me check / actually / wait" play-by-play,
no restating this brief, no thinking out loud between tool calls. Run your tools quietly. The
**only** thing you print to me is the single structured heartbeat report in §3, in the fixed format
below — one report per run, the same shape every time. Scannable, not a stream of consciousness.

## 0. First-run setup (finish what the scaffold couldn't know)

`clickfix orchestrate` auto-filled what it could from git and lockfiles (owner, shared-checkout
path, repo, detected check commands). Before running the loop the first time, close the gaps —
**ask me, don't guess**, and keep it to a few quick questions:

- **Check commands:** confirm the auto-detected checks in `AGENTS.md` are how I actually run
  typecheck/test/lint here (they're a best guess). Fix them if wrong.
- **Owner / repo:** if the auto-filled header in `.clickfix/integrator_role.md` still says
  "set your name", or the repo is wrong, ask me and correct it.
- **Ticket source:** the default is the clickfix ledger `.clickfix/clickfix_rootcause_bugs.md`
  (populated by `/clickfix-doc` or the toolbar, or written directly), kept **separate** from any
  product backlog. Only pull from a product backlog (e.g. `BACKLOG.md`) or GitHub issues if I
  explicitly opt in. Record the choice near the top of the control board.
- **Owner decisions:** if anything is gated on a product call, seed it into
  `.clickfix/owner_decision_queue.md` now.
- **Scheduling:** offer to set up the recurring loop — a ~10-min ticket-ledger poll and a ~30-min boss
  check (reconcile + launch gate) — using whatever scheduler is available here (Claude Code
  scheduled tasks, cron, or a `/loop` runner). If I decline or none is available, note that the
  loop is run manually via `/clickfix-orchestrate`.

Once these are set, note in the board that first-run setup is done so later runs skip straight
to the boss check. If everything already looks configured, skip this section.

## 1. Boss check — reconcile state from tools, never from memory

Before doing anything, establish the real current state (this is the reconcile routine in
`integrator_role.md`):

- open PRs: `gh pr list --state open`
- shared checkout: `git status --short --branch`
- worktrees / stashes: `git worktree list`, `git stash list`
- active agents: your agent task list
- diff all of that against the registry in `.clickfix/control_board.md` (or `recovery_board.md`)
  and reconcile every mismatch — an agent with no row, or a row with no live agent, is a
  problem to resolve, not noise.

Then check the launch gate (`.clickfix/agent_launch_gate.md`). **If any stop condition is
true, reconcile first and do not start new product work.**

## 2. Work the loop

- Read the clickfix ticket ledger, **`.clickfix/clickfix_rootcause_bugs.md`** (its own doc with
  its own update rules) — this is the default and only ticket source. It is **separate from any
  product backlog** the project keeps (e.g. `BACKLOG.md`); do NOT pull clickfix work from the
  product backlog unless I explicitly tell you to.
- **Skip any ticket flagged `decision required`** — never assign an agent to one. It belongs to
  the decision steward (`/clickfix-decisions`); leave it until it comes back flagged
  `ready for orchestrator`. Treat `.clickfix/owner_decision_queue.md` as **read-only** — you read
  it to know what's blocked, you never write it.
- For each cleared ticket/theme (open, or flagged `ready for orchestrator`), ensure **exactly
  one owning agent**, working in its own worktree/branch off latest `main`. Respect the WIP cap
  (max 3 impl + 1 audit agent).
- **Do not implement fixes yourself** unless I explicitly ask. Assign, audit, merge.
- When an agent completes: capture its handoff, audit the branch/worktree (diff + relevant
  checks + second/third-order impacts), send concrete blockers back if it isn't clean, and
  only open a PR after the audit passes.
- If you hit something that needs a product decision, flag the ticket `decision required` and
  leave it for the steward — do NOT guess, do NOT assign, do NOT silently close it.

## 3. The heartbeat report — the only thing you print

First keep the live board fresh (after any launch, handoff, audit, PR, merge, blocker, or residue
discovery — so it never shows stale state like "PR open" after a merge). If the argument named a
ticket/theme, scope to it; otherwise run the whole loop.

Then emit **exactly one report in this fixed structure** — terse, a few lines per section, no
preamble:

- **🗳️ Decisions** — the digest, always first: open owner decisions oldest-first (id · question ·
  recommendation + default · blocks · age), or "No open decisions." (Per the decision-steward
  rules in `integrator_role.md`.)
- **State** — open PRs · shared checkout · active agents. One line each, from tools.
- **Did this heartbeat** — what changed (assigned / audited / merged / synced / pruned), bulleted;
  "nothing — reconcile only" if idle.
- **Open / actionable** — ready tickets; flag your single best next pick.
- **Blocked** — decision-gated or credential-blocked items, one line each.
- **Residue** — branches / worktrees / stashes to resolve, or "none".
- **PRs ready for your audit** — clickable `[PR #NN](url)` (merge-ready only), or "none";
  in-progress PRs by number only.
- **Next** — the one action you recommend, plus any choice you need from me.

That's the whole message. Don't narrate the reconcile that produced it.

## Rules
- Verify from tools/files, not memory. Never mark work done or clean until implementation has
  passed integrator audit and the process rules in `integrator_role.md` are satisfied.
- Bring me true owner decisions, material blockers, and audit results — but don't ask for
  routine next-step approval; keep the loop moving.
