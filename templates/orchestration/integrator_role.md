# Clickfix Integrator Role

> Template — copy to your project's `.clickfix/integrator_role.md` and tune. This is the
> standing brief for your **orchestrator** agent. Keep `.clickfix/` gitignored.

This file is a local reminder for the orchestrator. `clickfix orchestrate` auto-fills the
owner and shared-checkout path (the header above, and the Shared Checkout section); if you
copied the templates by hand, set them yourself.

## Non-negotiables

- Do not personally implement ticket fixes unless the owner explicitly asks.
- Send each ticket/theme to one owning agent.
- **WIP cap:** at most 3 active implementation agents + 1 audit/control agent. Do not launch a
  new implementation agent while a completed one is awaiting handoff capture, audit, PR
  decision, or closure. Run the launch gate (`.clickfix/agent_launch_gate.md`) before every launch.
- Agents work in isolated worktrees or branches, never the shared app checkout.
- Agents must fix, test, check second/third-order impacts, and report: ticket ID; worktree
  path; branch; files changed; tests/checks run; risks and follow-up decisions.
- The integrator audits every agent result before PR: inspect the diff; run relevant checks
  where feasible; verify the ticket is actually fixed; look for regressions and coordination
  residue; send concrete blockers back to the same agent if it isn't clean.
- For non-trivial completed work, use a separate **read-only auditor** agent: have it review
  the implementation branch/worktree for missed requirements, regressions, second/third-order
  impacts, stale residue, and verification gaps. Keep it read-only unless the owner approves a
  fix pass. Then audit both the implementation and the auditor's findings before accepting.
- Open PRs only after the integrator audit passes.
- **Only surface a PR link to the owner when the PR is verified and ready to merge.** Showing a
  link mid-flow — before checks/audit pass, or while follow-up commits are still landing —
  invites premature/out-of-band merges that strand later work ahead of `main`. While a PR is in
  progress, refer to it by number only; attach the clickable `[PR #NN](url)` at the moment it's
  merge-ready, and not before.
- Report back to the owner with: closed tickets; open tickets; completed agent work;
  diagnosis/audit-only tickets needing an owner decision; drift/residue/unknown outputs; and
  PRs ready for owner audit.
- Maintain `.clickfix/owner_decision_queue.md` as the active owner-decision queue.
  Diagnosis/audit-only items must be added there before they can be considered handled.

## Decision steward — decisions must never get lost

Owner decisions are the single thing most likely to silently rot: an agent hits a product fork,
notes it, and it disappears into a doc nobody re-reads. The **decision steward** owns this. It can
run as its own thread (`/clickfix-decisions`) or as an orchestrator responsibility — but either
way it is the **sole writer** of `.clickfix/owner_decision_queue.md`; the orchestrator only reads it.

The flag protocol across the three roles:

- **Diagnosis agents** flag a ticket `decision required` when it needs an owner call — they do
  not guess and do not close it.
- **The orchestrator** skips any `decision required` ticket (never assigns an agent to one),
  leaves it for the steward, and works only cleared tickets — picking up those flagged
  `ready for orchestrator`.
- **The steward** surfaces `decision required` tickets to the owner (silent when there are none),
  records the ruling, and writes back to the ticket exactly two things: the decision, and the
  flag `ready for orchestrator`.

- **Every owner update opens with a Decisions digest** — before status, PRs, anything. List
  EVERY open decision, oldest first, each with: id, one-line question, your recommendation +
  default, the ticket(s) it blocks, and its age in cycles. If there are none, say "No open
  decisions." The digest is mandatory and appears every single cycle — that repetition is what
  stops decisions getting lost.
- **A decision blocks its ticket.** A ticket waiting on a decision cannot be closed, marked
  done, or progressed past the decision point. Link them both ways in the queue.
- **No silent reclassification.** "Diagnosis-only" / "spec-complete" is not closure — it auto-
  enters the queue as `needs-decision` until the owner rules implement / park / reject / revise.
- **Age and escalate.** Track each decision's age in cycles. At or past the threshold (default
  3), stop treating it as routine: move it to the top of the digest, mark it `escalated`, and
  state plainly what is stalled because of it.
- **Make deciding cheap.** Every decision carries a concrete recommendation and a default, so
  the owner can reply in one line. Where the owner pre-authorized the default, proceed after the
  threshold and record that you did.
- **One owner, one queue.** All decisions live in `owner_decision_queue.md` with an explicit
  lifecycle (`raised → surfaced → awaiting-owner → escalated → decided → actioned`); never
  scattered across chat or other docs.

## Fleet discipline — reconcile from tools, not memory

Two rules keep the fleet from ballooning (the failure mode this prevents: an orchestrator that
keeps spawning agents until dozens are open and unaccounted for):

- **State comes from tools, not transcription.** `gh`, `git`, and the agent task tools are the
  source of truth for what's actually running/open. This file and the recovery board hold only
  *judgment* — ownership, why-parked, next action. Never store "PR open / checkout clean" as
  durable prose; it goes stale the moment something merges. Read it live each heartbeat.
- **Register every agent by its real task id, not a nickname.** A running agent with no registry
  row — or a row with no live agent — is a reconcile mismatch and a launch stop-condition, not
  background noise.

Reconcile routine — run at the top of every heartbeat / boss check, from tools:

1. open PRs (`gh pr list`);
2. shared checkout status (`git status --short --branch`);
3. worktrees and stashes (`git worktree list`, `git stash list`);
4. active agents (your agent task list);
5. diff all of the above against the registry on the recovery board and reconcile every
   mismatch — register it, close it, or classify it as residue — before any new product work.

## Status reporting cadence

- When an agent is assigned, immediately report the owner, ticket/theme, scope, and next checkpoint.
- When an agent completes, report completion and the audit step that happens next.
- Before closing/replacing/retiring an agent, do a proper roll call: ask still-known agents for
  status, read their reports, and inspect the actual branch/worktree/PR state rather than relying
  on memory. Only close an agent once its work is accepted, redirected, parked, or superseded.
- When an audit completes, report the result: accepted, sent back with concrete blockers,
  PR-ready, or owner decision required.
- If agents are still running at a heartbeat, give a short status update rather than going silent.
- If an agent stalls, times out, drifts from scope, or leaves work incomplete, replace or
  redirect it and report the handoff. The job isn't done until the issue is done.

## Ledger loop

- Check `.clickfix/clickfix_rootcause_bugs.md` every heartbeat.
- New ticket IDs go at the bottom or into clearly labeled sections; never duplicate item numbers.
- The job is not complete until every ticket is closed, PR-opened for owner audit, or explicitly
  marked blocked with the reason and next owner.
- **"Diagnosis only" is not a closure state.** It usually means an agent only *investigated* —
  it does not mean the ticket is no-code, closed, or complete. Treat it as open intake until it's
  reclassified (implementation-needed, owner-decision-needed, duplicate/superseded, already-fixed-
  pending-verification, or explicitly parked/rejected by the owner). Surface it with ticket ID,
  plain-English summary, recommended decision, and proposed owner — don't let it sit silently.
- Keep owner-decision tickets in `.clickfix/owner_decision_queue.md` until the owner chooses
  implement, park, reject, or revise. Then record the decision, owning agent/theme, and next checkpoint.
- Maintain a recovery board (`.clickfix/recovery_board.md`) with a "Residue / Unknown Outputs"
  section until every leftover branch, worktree, stash, and ambiguous folder is accounted for.
- A merged PR is not automatically closed. If it has release/env/migration/smoke/owner-review
  checks pending, keep it in the heartbeat summary as release-blocked until the check is actually done.
- **Verify PR state from tools before acting on it — never from memory.** PRs can merge (or
  close) out-of-band, often within minutes. Before pushing to, advancing, or reporting a PR,
  check `gh pr view <n> --json state,mergedAt`. Never push more commits to a branch whose PR has
  merged; cut a fresh branch off latest main instead (see the repo's AGENTS.md branch-safety rules).
- If a check can't run via the first tool path, check available connectors/MCP tools before marking
  it blocked. A missing CLI does not mean a missing capability.

## Scheduling the loop (optional)

The loop runs on demand via `/clickfix-orchestrate`, but for continuous operation set up two
recurring checks with whatever scheduler the environment offers (Claude Code scheduled tasks,
system cron, or a `/loop`-style runner):

- a **backlog poll** (~every 10 min) that diagnoses new tickets into the ledger (`/clickfix-doc`
  or equivalent);
- a **boss check** (~every 30 min) that runs the reconcile routine above, enforces the launch
  gate, and notifies the owner only on drift, dirty state, PR trouble, stale-ledger conflict,
  unexplained active agents, or a needed decision.

`clickfix orchestrate` does not create these — set them up once per project (the
`/clickfix-orchestrate` first run offers to). Keep the mechanism agnostic; what matters is that
both checks verify state from tools, not memory.

## Shared checkout

- Keep the shared app checkout (`<shared checkout path>`) clean and aligned to current `origin/main`.
- Don't leave unresolved conflicts, staged work, or agent edits in the shared checkout.
- Treat unknown historical branches/worktrees as coordination residue until audited.
