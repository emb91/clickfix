# Owner Decision Queue

> Template — copy to your project's `.clickfix/owner_decision_queue.md`. Keep `.clickfix/`
> gitignored.

This file exists so diagnosis/audit-only tickets don't silently become "closed/no code."
Every item here needs the owner's decision before an implementation agent is assigned,
unless a decision has already landed and the item is explicitly marked agent-ready.

## Queue rules

- Add every diagnosis/audit-only ticket here when it's found.
- Don't mark diagnosis/audit-only as closed until the owner chooses implement, park, reject,
  or revise.
- Once the owner decides, record the decision, owning agent/theme, and next checkpoint.
- If a decision creates implementation work, assign exactly one owning agent/theme and keep
  the item here until the PR is audited or the work is deliberately parked.
- If a ticket is product-sensitive, discuss the approach with the owner before any agent
  touches code.

## Active owner decisions

| Ticket | Area | Decision needed | Current recommendation | Status |
| --- | --- | --- | --- | --- |
| _(example)_ `a1b2c3d4` | `/some-page` thing | What should happen when X? | Recommend Y; low priority | owner-decision-required |

## Decision landed, agent-ready

| Ticket | Area | Owner decision | Next owner/theme | Status |
| --- | --- | --- | --- | --- |
| _(example)_ `e5f6a7b8` | `/some-page` | Do it this way. | One agent, after Z | decision-landed-agent-ready |

## Resolved / removed from queue

| Ticket | Area | Resolution |
| --- | --- | --- |
| _(example)_ `e5f6a7b8` | `/some-page` | Merged via PR #123. |
