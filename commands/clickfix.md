---
description: Work the clickfix feedback notes captured from this project's in-browser toolbar
---

You are working UI / behaviour feedback captured via the **clickfix** toolbar. The
notes live in `.feedback/inbox.jsonl` in this project — one JSON object per line.

## 1. Read the open notes

Read `.feedback/inbox.jsonl`. Each note looks like:

`{ "id", "status", "route", "source_file", "line", "component", "component_chain", "selector", "text", "kind", "instruction" }`

Work only notes with `"status": "open"`. If there are none (or the file doesn't exist),
say so and stop. Otherwise list the open notes grouped by `kind` so I can see what
you're about to do before you touch anything.

## 2. Work each note by its kind

- **kind: "ui"** — a visual / copy tweak. Open `source_file:line`; if that's missing,
  locate the element via `component` + `component_chain` + `selector` + the on-screen
  `text`. Make the change described in `instruction`, matching the surrounding style.
  These are usually safe to just do.

- **kind: "behavior"** — a bug. The clicked element (`selector` / `source_file`) is
  where the problem SHOWED UP, not necessarily its cause. Trace UPSTREAM — where the
  data is fetched / computed / prompted / passed in — to the ROOT CAUSE. Do NOT paper
  over it by changing the UI. **Diagnose first:** tell me the root cause (file:line) and
  the fix you propose, then wait for my go-ahead before editing.

`route` is the page/URL the note was left on — navigate the code accordingly.

## 3. Save the fix (commit it so it can't get lost)

As soon as a fix is settled — a UI tweak made, or a behaviour fix I've approved —
**commit it** before moving on. Uncommitted edits can be wiped by a later branch
switch or another tool working in the same repo, so don't let fixes pile up unsaved.

- Stage ONLY the files you changed for that note, by explicit path — never `git add -A`.
- Commit on the **current branch** with a clear message, e.g. `clickfix: <instruction>`.
- Do NOT create branches, switch branches, or push — just a plain local commit.
- One commit per note (or per approved batch) keeps it traceable.

If I say I'd rather review everything first, hold off and just leave the edits in the
working tree — but tell me clearly that they're uncommitted.

## 4. Resolve

Once a note's fix is committed, mark it resolved: in `.feedback/inbox.jsonl`, change that
note's `"status":"open"` to `"status":"done"` (match on its `id`; leave the other notes
untouched). The toolbar badge drops the count on its next refresh.

## Rules

- Commit on whatever branch I'm currently on. If I want the clickfix fixes isolated,
  I'll switch you to a fresh branch first — don't switch branches yourself.
- Process `ui` and `behavior` notes as separate passes; don't conflate a CSS tweak with
  a logic fix.
