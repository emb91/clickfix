# Clickfix — Maintenance Ledger

> Template — copy to your project's `.clickfix/maintenance_ledger.md`. Keep `.clickfix/`
> gitignored. This is the **maintenance lane's own ledger — SEPARATE from the product bug ledger
> and from your error-logging (Sentry) data.** `/clickfix-maintenance` owns it.

Maintenance tickets come from an **upstream source** (e.g. a scheduled Sentry-triage task), not the
browser toolbar. They're operational-health items — errors, warnings, dependency/version nits — not
product feedback. `/clickfix-maintenance` is a **self-contained orchestrator** for this stream: it
rules on what needs your call, assigns sub-agents to fix the rest (worktree → audit → PR), and
records everything here. It never touches the product bug ledger or the raw log data.

## How this ledger is used

- The **triage source appends** new tickets under "Awaiting your ruling" (flagged
  `decision required`) or "Ready to assign" (flagged `ready for orchestrator`).
- `/clickfix-maintenance` **rules on decision-required items with you inline** — this ledger is the
  decision surface; maintenance decisions do **not** go to the product `owner_decision_queue.md`.
- It then assigns approved/ready tickets to sub-agents and moves rows through the lifecycle:
  `logged → awaiting-ruling → approved → assigned → in-audit → merged` (or `parked`).

## Awaiting your ruling  (decision-required — source for the maintenance decisions digest)

| # | Ticket / Sentry issue | What needs deciding | Recommendation + default | Age (runs) | State |
| --- | --- | --- | --- | --- | --- |
| _(none)_ | - | - | - | - | - |

## Ready to assign  (approved / no ruling needed)

| # | Ticket / Sentry issue | Fix summary | Files / area | State |
| --- | --- | --- | --- | --- |
| _(none)_ | - | - | - | - |

## In progress  (agent registry — keyed to real Task IDs)

| Task ID | Ticket | Branch / worktree | State | Next checkpoint |
| --- | --- | --- | --- | --- |
| _(none)_ | - | - | No agents launched. | - |

## Done / merged

| Ticket | Resolution |
| --- | --- |
| _(none yet)_ | - |

## Residue / unknowns

| Item | Type | Next action |
| --- | --- | --- |
| _(none)_ | - | - |
