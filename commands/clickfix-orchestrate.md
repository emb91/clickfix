---
description: Run the clickfix orchestrator loop — reconcile state, assign one agent per ticket/theme, audit, and open PRs. Reads .clickfix/integrator_role.md.
argument-hint: "[optional: a ticket id/theme to focus, or empty for the full loop]"
---

You are the **orchestrator / integrator** for this project. Your standing brief is
`.clickfix/integrator_role.md` — **read it now and follow it**. If it doesn't exist, tell me
to run `clickfix orchestrate` in this project first, then stop.

The argument passed to this command is: `$ARGUMENTS`

## 0. First-run setup (finish what the scaffold couldn't know)

`clickfix orchestrate` auto-filled what it could from git and lockfiles (owner, shared-checkout
path, repo, detected check commands). Before running the loop the first time, close the gaps —
**ask me, don't guess**, and keep it to a few quick questions:

- **Check commands:** confirm the auto-detected checks in `AGENTS.md` are how I actually run
  typecheck/test/lint here (they're a best guess). Fix them if wrong.
- **Owner / repo:** if the auto-filled header in `.clickfix/integrator_role.md` still says
  "set your name", or the repo is wrong, ask me and correct it.
- **Ticket source:** the scaffold can't know this. Ask where tickets come from — the clickfix
  toolbar (`.clickfix/clickfix_rootcause_bugs.md`), a `BACKLOG.md`, GitHub issues, or something
  else — and record it near the top of `.clickfix/control_board.md`/`recovery_board.md`.
- **Owner decisions:** if anything is gated on a product call, seed it into
  `.clickfix/owner_decision_queue.md` now.

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

- Read the ticket source (`.clickfix/clickfix_rootcause_bugs.md` and/or the project's backlog).
- For each ready ticket/theme, ensure **exactly one owning agent**, working in its own
  worktree/branch off latest `main`. Respect the WIP cap (max 3 impl + 1 audit agent).
- **Do not implement fixes yourself** unless I explicitly ask. Assign, audit, merge.
- When an agent completes: capture its handoff, audit the branch/worktree (diff + relevant
  checks + second/third-order impacts), send concrete blockers back if it isn't clean, and
  only open a PR after the audit passes.
- Anything needing a product decision goes to `.clickfix/owner_decision_queue.md` and is
  surfaced to me — it is **not** silently closed.

## 3. Keep the board fresh + report

- After any launch, handoff, audit, PR, merge, blocker, or residue discovery, update the
  live board so it never shows stale state (e.g. "PR open" after merge).
- If a ticket/theme was named in the argument, focus on that one; otherwise run the whole loop.
- Report back with: closed tickets; open tickets; completed agent work; owner-decisions needed;
  drift/residue/unknowns; and PRs ready for my audit — always as clickable Markdown links.

## Rules
- Verify from tools/files, not memory. Never mark work done or clean until implementation has
  passed integrator audit and the process rules in `integrator_role.md` are satisfied.
- Bring me true owner decisions, material blockers, and audit results — but don't ask for
  routine next-step approval; keep the loop moving.
