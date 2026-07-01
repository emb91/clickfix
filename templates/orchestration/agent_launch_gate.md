# Agent Launch Gate

> Template — copy to your project's `.clickfix/agent_launch_gate.md`. Keep `.clickfix/`
> gitignored. Run this checklist before launching any implementation agent, audit agent,
> or PR. State is not stored here — read it live via the reconcile routine in
> `integrator_role.md`.

This gate exists to stop the classic failure mode: launching is cheap, so an orchestrator
keeps spawning agents while old ones pile up un-audited, until dozens are open and nobody can
account for them. The gate turns "should I launch another?" into a rule with hard stops.

## Stop conditions — do NOT launch if any is true

- Shared checkout is not clean on latest `origin/main`.
- An open PR is awaiting integrator audit, has failing checks, needs conflict resolution, or
  needs an owner-facing status.
- A completed agent's handoff hasn't been captured in the live board.
- A completed agent hasn't been accepted / sent-back / parked / superseded / closed.
- The WIP cap would be exceeded: more than 3 active implementation agents, or more than 1
  active audit/control agent.
- The agent task list shows agents with no matching registry row (unexplained agents).
- A required owner decision for this work is still unresolved in `owner_decision_queue.md`.

If any stop condition is true: reconcile first. Product work waits.

## Before launching — record in the live board registry

real task id (+ nickname); ticket/theme; expected branch/worktree; exact scope; tests/checks
expected; whether a sub-auditor/control agent is required; next checkpoint.

## Give every agent

latest-`main` worktree requirement; branch-naming requirement; no shared-checkout edits; one
owner/theme only; expected handoff format; instruction to check second/third-order impacts;
instruction not to open a PR / mark clean unless integrator audit passes.

## Handoff required before an agent is "complete"

ticket/theme; worktree path; branch; `git status --short --branch`; latest commit SHA; pushed
or local-only; PR URL if any; changed files; tests/checks run; known risks; follow-up
decisions; whether uncommitted or stashed work remains.

## Integrator audit required before opening / advancing a PR

inspect the diff directly; run relevant tests/checks where feasible; check second/third-order
impacts; check for shared-checkout residue; check migration/version mismatches for DB work;
send concrete blockers back to the same agent if not clean; use a sub-auditor for non-trivial
work.

## Boss heartbeat

If you run a recurring boss check, it must verify state from tools/files, not memory: open
PRs, shared checkout status, the live board, the ledger, known active/completed/unknown
agents, and worktree residue. If it finds drift, it notifies the owner and forces
reconciliation before more product work starts.
