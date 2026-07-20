# Clickfix — Maintenance Ledger

> Template — copy to your project's `.clickfix/maintenance_ledger.md`. Keep `.clickfix/`
> gitignored. This is the **maintenance lane's own ledger — SEPARATE from the product bug ledger
> and from your error-logging (Sentry) data.** `/clickfix-maintenance` owns it.

Maintenance tickets come from an **upstream source** (e.g. a scheduled Sentry-triage task), not the
browser toolbar — operational-health items (errors, warnings, version nits), not product feedback.
This is a **self-contained** thread: the triage task appends new tickets here (plain-English,
flagged `decision required` or `ready for orchestrator`); `/clickfix-maintenance` records your
rulings and then **assigns approved tickets to its own sub-agents to fix** (worktree → audit → PR),
the same discipline the orchestrator uses but on the maintenance stream. It does **not** promote to
`open_ticket_list.md` or hand work to the product orchestrator, and never touches the product bug
ledger or the raw log data.

## Open — decision required

Anything touching product behavior, spend, copy, or anything irreversible — needs your ruling first.

| Ticket | Finding / impact / proposed action | Effort | Sentry | Filed | State |
| --- | --- | --- | --- | --- | --- |

## Open — ready for orchestrator

Unambiguous fixes needing no ruling — `/clickfix-maintenance` assigns a sub-agent directly.

| Ticket | Finding / impact / proposed action | Effort | Sentry | Filed | State |
| --- | --- | --- | --- | --- | --- |

## In progress  (agent registry — keyed to real Task IDs)

| Task ID | Ticket | Branch / worktree | Status | Next checkpoint |
| --- | --- | --- | --- | --- |

## Done

| Ticket | Title | Outcome |
| --- | --- | --- |

## Considered, no action (log)

One line per benign finding with the date, so repeated noise is provably considered without re-triage.

| Date | Finding (Sentry shortId) | Why no action |
| --- | --- | --- |

## Ledger notes

- The triage source appends only to the two "Open" sections and the no-action log.
- `/clickfix-maintenance` is the only thread that records rulings, assigns sub-agents, and moves
  rows through `logged → ruled → in-progress → done`. Nothing else writes here.
- A ticket carries: stable id `maint-YYYYMMDD-<slug>`, 2-3 plain-English lines (what it is, whether
  it actually affects users/data or is internal noise, proposed action), effort S/M/L, Sentry
  shortId(s) + link, filed date.
- Decisions are ruled **here**, inline — never in the product `owner_decision_queue.md`.
- Keep done tickets as short history rather than deleting them.
