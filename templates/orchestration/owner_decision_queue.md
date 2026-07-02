# Owner Decision Queue

> Template — copy to your project's `.clickfix/owner_decision_queue.md`. Keep `.clickfix/`
> gitignored.

This is the **decision steward's** log — the single home for everything that needs the owner's
call before code proceeds. It exists because owner decisions are the thing most likely to
silently rot: an agent hits a product fork, notes it, and it disappears into a doc nobody
re-reads. See the "Decision steward" section of `integrator_role.md` for the role; this file
is its ledger.

## How the steward uses this file

- **Every owner update opens with a Decisions digest built from the "Awaiting owner" table
  below** — oldest first, each with its question, recommendation, blocked ticket(s), and age.
  If the table is empty, the digest says "No open decisions." That repetition every cycle is
  what stops decisions getting lost.
- **A decision blocks its ticket.** A ticket listed under "Blocks" cannot be closed, marked
  done, or progressed past the decision point until the decision lands.
- **No silent reclassification.** "Diagnosis-only" / "spec-complete" is not closure — a ticket
  flagged `decision required` enters "Awaiting owner" until the owner rules implement / park /
  reject / revise.
- **Age and escalate.** Bump `Age` (in boss cycles) each cycle. At or past the escalation
  threshold (default 3), move the row to the top, mark it `escalated`, and state plainly in the
  digest what is stalled because of it.
- **Make deciding cheap.** Every row carries a concrete recommendation + default so the owner
  can reply in one line. If the owner has pre-authorized the default, proceed after the
  threshold and record it under "Decided".
- **Lifecycle:** `raised → surfaced → awaiting-owner → escalated → decided → actioned`. A row
  leaves "Awaiting owner" only when the owner rules; then it moves to "Decided", and to
  "Actioned/closed" once the resulting work is merged or deliberately parked.
- **Sole writer + handoff.** This file has exactly one writer — the decision steward
  (`/clickfix-decisions`); the orchestrator only reads it. When the owner rules, the steward
  writes the decision back onto the ticket and flips its flag to `ready for orchestrator`. That
  flag — not this queue — is how the orchestrator learns the work is cleared to assign.

## Awaiting owner  (source for the digest — oldest first)

| ID | Area | Decision needed | Recommendation + default | Blocks | Age (cycles) | State |
| --- | --- | --- | --- | --- | --- | --- |
| _(example)_ `a1b2c3d4` | `/some-page` | What should happen when X? | Recommend Y (default: do Y) | ticket `t42` | 1 | awaiting-owner |

## Decided — agent-ready or in-flight

| ID | Area | Owner decision | Next owner/theme | State |
| --- | --- | --- | --- | --- |
| _(example)_ `e5f6a7b8` | `/some-page` | Do it this way. | one agent, after Z | decided |

## Actioned / closed

| ID | Area | Resolution |
| --- | --- | --- |
| _(example)_ `e5f6a7b8` | `/some-page` | Shipped via PR #123. |
