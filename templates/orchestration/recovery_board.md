# Clickfix Recovery Board

> Template — copy to your project's `.clickfix/recovery_board.md`. Keep `.clickfix/`
> gitignored.

Tracks current recovery state so tickets, agent work, residue, and owner decisions don't
disappear into chat history.

## Active agents / themes

| Agent | Theme | Tickets | State | Next checkpoint |
| --- | --- | --- | --- | --- |
| none | - | - | No active implementation agents. | - |

## PRs awaiting checks / owner audit

| PR | Theme | State | Integrator notes |
| --- | --- | --- | --- |
| _(example)_ #123 | theme name | Open after audit; awaiting CI/owner. | What it covers; any risks. |

## Audit blockers sent back

| Agent | Theme | Blockers | Sent back |
| --- | --- | --- | --- |
| _(example)_ name | theme | P1/P2: concrete blocker | date/time |

## Owner decision queue

See `.clickfix/owner_decision_queue.md`.

## Recently closed / accounted for

| Item | State | Notes |
| --- | --- | --- |
| _(example)_ ticket/theme | Merged/accounted for | PR #NN merged into `origin/main`. |

## Residue / unknown outputs

Keep this section until every leftover branch, worktree, stash, old agent output, and
ambiguous local folder is accounted for as shipped, superseded, parked, deleted, or
owner-decision required.

| Item | Type | Current understanding | Next action |
| --- | --- | --- | --- |
| _(example)_ stray branch/worktree | branch/worktree residue | Unknown origin | Classify: active PR / merged-safe-remove / needs audit / owner decision |
