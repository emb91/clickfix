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

## 3. Resolve

When a note is done and I'm happy with it, mark it resolved: in `.feedback/inbox.jsonl`,
change that note's `"status":"open"` to `"status":"done"` (match on its `id`; leave the
other notes untouched). The toolbar badge drops the count on its next refresh.

## Rules

- Don't manage git / branches / commits unless I ask — I'll handle version control.
- Process `ui` and `behavior` notes as separate passes; don't conflate a CSS tweak with
  a logic fix.
