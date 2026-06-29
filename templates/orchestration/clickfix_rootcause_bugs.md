# Clickfix — Root-Cause Ledger

> Template — copy to your project's `.clickfix/clickfix_rootcause_bugs.md`. Keep `.clickfix/`
> gitignored. This is the shared ledger that `/clickfix-doc` appends to and the orchestrator
> reads each cycle.

Diagnosis-only by default: entries describe a ticket's symptom → root cause (file:line) →
proposed fix. Writing a diagnosis here does **not** mean the ticket is fixed or closed — it's
intake for the orchestrator / owner to act on.

## Agent update rule

- Do **not** edit or renumber existing entries — they're audit history.
- For a new finding, **append a new section at the bottom** with a heading keyed by a unique
  stable id: the clickfix ticket id (preferred), or a PR number / commit SHA / short slug if
  there's no ticket. This avoids parallel agents colliding on the same "item N" heading.
- Keep each entry self-contained enough that a reviewer can act from it alone.

## Entry template

```
## Ticket <id> — <route> "<short instruction>" (<date>)

**What I investigated** — files/queries/tools, with key findings + evidence.
**Root cause** — file:line, and why.
**Recommended solution(s)** — concrete, file:line; flag if a product decision is needed (A vs B).
**Other issues noticed** — anything out of scope worth a reviewer's eyes.
**Status** — diagnosis-only / implemented (PR #) / blocked (reason) / owner-decision-required.
```

---

<!-- New diagnosis sections get appended below this line. -->
