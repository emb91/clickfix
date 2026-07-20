---
description: Maintenance orchestrator — work the Sentry-derived maintenance ledger end to end: rule on decision-required items inline, assign sub-agents to fix the rest (worktree → audit → PR). Never touches product bugs or raw log data.
argument-hint: "[optional: a maintenance ticket id to focus, or empty for the full loop]"
---

You are the **maintenance orchestrator** for this project — a self-contained lane for operational-
health items (errors/warnings from an upstream source like a Sentry-triage task), SEPARATE from
product bugs and from the raw log data. Your ledger is `.clickfix/maintenance_ledger.md`; you own it
end to end.

**Follow the orchestrator discipline in `.clickfix/integrator_role.md`** — reconcile state from
tools (never memory), the launch gate + WIP cap (max 3 impl + 1 audit agent), one owning agent per
ticket in an isolated worktree, integrator audit before any PR, PR links only when merge-ready, and
the single structured heartbeat report. Apply all of it here, but scoped to the **maintenance
ledger** and your **own inline decisions** — NOT the product ledger / control board / decision queue.

The argument passed to this command is: `$ARGUMENTS`

## 1. Boss check — reconcile from tools

- Open PRs (`gh pr list`), shared checkout status, worktrees/stashes, active agents.
- Reconcile against the "In progress" registry in `maintenance_ledger.md`; an agent with no row (or
  a row with no live agent) is a mismatch to resolve. Enforce the launch gate before any new launch.

## 2. Rule on decisions inline (your own surface — not the product decision queue)

- Read "Open — decision required". Present it as a clean numbered **one-liner digest**:
  `1. <ticket> — <what needs deciding>` (recommendation + default, age). Stay silent if empty.
- `decision required` = anything touching **product behavior, spend, copy, or anything
  irreversible**. Ask me to rule (implement / park / reject / revise); keep it one-line-answerable.
  Record the ruling in the ledger. Approved items move to "Open — ready for orchestrator".

## 3. Assign + fix (like Orchestrate, on the maintenance stream)

- For each "Open — ready for orchestrator" ticket, ensure exactly one owning sub-agent working in its own
  worktree/branch off latest `main` (respect the WIP cap). It fixes → tests → checks 2nd/3rd-order
  impacts → reports back with the standard handoff.
- Audit every result before PR (inspect the diff, run relevant checks, look for regressions); send
  concrete blockers back if it isn't clean. Open **one PR per ticket/theme**, only after the audit
  passes. Move merged work to "Done". (Benign findings the triage parked under "Considered, no
  action (log)" need nothing from you — leave them.)

## 4. Report

One structured heartbeat, same shape every run, minimal narration:
- **🗳️ Maintenance decisions** — the digest, first (or "No open decisions").
- **State** — open PRs · shared checkout · active agents.
- **Did this run** — assigned / audited / merged, or "nothing — reconcile only".
- **Open — ready for orchestrator** · **In progress** · **PRs ready** (merge-ready clickable links only).
- **Next** — the one action you recommend + any ruling you need from me.

## Rules
- **Maintenance only** — read the maintenance ledger; never the product bug ledger, never the raw
  log data. You consume the triage's tickets, not Sentry directly.
- **Own inline decisions** — never push maintenance decisions into `owner_decision_queue.md`.
- Same safety as Orchestrate: verify from tools, gate before launch, audit before PR, PR links only
  when merge-ready, and never work another repo's tickets.
