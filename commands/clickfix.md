---
description: Work clickfix feedback notes as tickets — claim one at a time so parallel threads don't collide
argument-hint: "[note id/prefix, or empty for the next ticket]"
---

You work clickfix feedback as **tickets**, claiming them one at a time from the local
clickfix sidecar. Claiming flips a note to `in_progress` atomically, so other Claude
Code threads running `/clickfix` never grab the same note — open N threads and they
divide the queue between them.

Sidecar base URL: **`http://localhost:7331`** (default port — if you started `clickfix`
with a different `--port`, use that).

The argument passed to this command is: `$ARGUMENTS`

## 1. Claim a ticket

- **If the argument above is non-empty**, claim that specific note (id or short prefix):
  ```
  curl -s -X POST http://localhost:7331/claim -H 'Content-Type: application/json' -d '{"id":"$ARGUMENTS"}'
  ```
- **If the argument is empty**, claim the next available ticket:
  ```
  curl -s -X POST http://localhost:7331/claim -H 'Content-Type: application/json' -d '{}'
  ```

Read the JSON response:
- `{"note": { ... }}` → that note is now **yours** (`in_progress`); no other thread can
  take it. Proceed to work it.
- `{"note": null, "reason": "..."}` → nothing to claim (queue empty, or the targeted note
  is already `in_progress`/`done`). Report the reason and **stop**.
- If `curl` can't connect, the sidecar isn't running — tell me to start `clickfix` in
  this project, then stop.

Tell me which ticket you claimed (id + instruction) before touching code.

## 2. Work the ticket (by its kind)

- **kind: "ui"** — a visual/copy tweak. Open `source_file:line`; if missing, locate via
  `component` + `component_chain` + `selector` + on-screen `text`. Make the change in
  `instruction`, matching surrounding style. Safe to just do.
- **kind: "behavior"** — a bug. The clicked element is where it SHOWED UP, not the cause.
  Trace UPSTREAM to the ROOT CAUSE; don't paper over it in the UI. **Diagnose first:**
  show me the root cause (file:line) + proposed fix, and wait for my go-ahead.
  - If I **defer or reject**, release the ticket so it's not stuck, then stop:
    ```
    curl -s -X PATCH http://localhost:7331/feedback -H 'Content-Type: application/json' -d '{"id":"<id>","status":"open"}'
    ```

## 3. Commit the fix

Once the fix is settled, **commit it immediately** so it can't be lost:
- Stage ONLY the files you changed, by explicit path — never `git add -A`.
- Commit on the **current branch**, message `clickfix: <instruction>`.
- No branch creation, no switching, no push.

## 4. Resolve the ticket

Mark it done **through the sidecar** (the server owns the mailbox file — don't hand-edit it):
```
curl -s -X PATCH http://localhost:7331/feedback -H 'Content-Type: application/json' -d '{"id":"<id>","status":"done"}'
```

## 5. Next ticket

- If an argument was given, you handled that one specific ticket — **stop**.
- If no argument, return to step 1 and claim the **next** ticket. Repeat until claim
  returns `{"note": null}`. You only ever hold ONE ticket at a time, so other threads
  keep draining the queue alongside you.

## Rules
- One ticket `in_progress` at a time: claim → finish (or release) → claim next.
- Commit on whatever branch I'm on; if I want isolation I'll put you on a branch first.
- Handle `ui` and `behavior` on their own terms — never conflate a CSS tweak with a logic fix.
