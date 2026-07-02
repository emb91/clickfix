# Clickfix — Questions Log

> Template — copy to your project's `.clickfix/clickfix_questions.md`. Keep `.clickfix/`
> gitignored. This is the **questions lane's own ledger — SEPARATE from the root-cause bug
> ledger**. `/clickfix-questions` owns it; the orchestrator never reads it.

`❓ Ask` tickets (`kind: question`, from the toolbar or written directly) are *questions about
the code*, not change requests. `/clickfix-questions` logs each here, spawns a research subagent
to answer it, gives you an ELI5 answer, and closes it. **A question that gets a satisfying answer
never touches the orchestrator — there's nothing to build.** Only if you reject the answer ("no,
this is a problem because…") does it escalate: a new ticket is appended to
`clickfix_rootcause_bugs.md` for the orchestrator to pick up.

## Update rule

- Append a new entry per question, keyed by the ticket id; never rewrite a closed one.
- Record page:line, the question, the ELI5 answer, and the outcome (answered-closed, or escalated
  to a `clickfix_rootcause_bugs.md` ticket with its id + the reason).

## Entry template

```
## Q <id> — <route>:<line> (<date>)
**Question** — <the owner's question, quoted>.
**Answer (ELI5)** — <plain-English answer, with the file:line that backs it>.
**Outcome** — answered-closed  /  escalated → `clickfix_rootcause_bugs.md` ticket <id> (<reason>).
```

---

<!-- New question entries get appended below this line. -->
