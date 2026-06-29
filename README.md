# clickfix

Click an element on your running site, type the edit you want, and your AI coding
agent gets the **exact page, component, source line, selector, text, and your
instruction** — instead of you screenshotting and describing it.

It's a tiny local **sidecar**: one process serves the toolbar and a JSONL mailbox.
Your site loads one `<script>` in dev. You work the captured notes in a **Claude
Code** session in the same project with the `/clickfix` command. No backend changes,
no framework lock-in, no second agent to babysit.

```
 browser (your site)                 sidecar (localhost:7331)          you, in Claude Code
 ┌──────────────────┐   POST /feedback   ┌────────────────────┐   /clickfix   ┌──────────┐
 │ ✦ click + type   │ ─────────────────▶ │ .feedback/inbox    │ ◀──reads───── │ edits +  │
 │ (toolbar.js)     │                    │   .jsonl           │ ──notes────▶  │ you chat │
 └──────────────────┘                    └────────────────────┘               └──────────┘
```

## Requirements

clickfix captures feedback in the browser; the *fixing* happens in **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** via a slash command. So you need:

- **Node 18+**
- **Claude Code** (the work runs through `/clickfix` / `/clickfix-doc`). No Claude Code? You can still capture notes — they're just a JSONL file you read yourself.

## Install

Not on npm yet — install from GitHub (the repo is public):

```bash
npm i -g github:emb91/clickfix        # gives you the `clickfix` command
clickfix install                       # adds /clickfix + /clickfix-doc to ~/.claude/commands
```

(Or clone the repo and `npm link`.) `clickfix install` only needs running once per machine — the slash commands then work in any project.

## Quick start

1. **Run the sidecar** in your project (leave it running):
   ```bash
   clickfix          # http://localhost:7331  (use --port / --dir to change)
   ```
2. **Add the toolbar** to your site, **development only** (e.g. behind a `NODE_ENV` check):
   ```html
   <script src="http://localhost:7331/toolbar.js"></script>
   ```
3. **Leave feedback:** a **✦ Feedback** button appears bottom-right (drag it anywhere — it
   remembers). Click it → click any element → pick **✦ UI tweak** or **🪲 Fix behaviour** →
   type what should change → **Send**. Notes append to `.feedback/inbox.jsonl`.
4. **Work the notes in Claude Code** — open a session **rooted in the same project** and run:
   - `/clickfix` — fixes each ticket (UI tweaks directly; behaviour bugs diagnosed-first),
     commits each fix, and resolves it. Clarify by chatting normally.
   - `/clickfix-doc` — *diagnoses* each ticket into `.clickfix/clickfix_rootcause_bugs.md`
     and closes it **without changing code** — a handoff doc for a reviewer to implement later.

Both claim tickets atomically, so you can run several Claude Code threads and they divide
the queue without colliding (`/clickfix <id>` targets a specific one).

## Where the script goes

clickfix can't inject itself — your app has to load the script. Put it in
**whatever file renders on every page** (your global layout / template), inside
`<body>`, so the toolbar shows on every route. Then it's the same one line
everywhere — **always gate it to development** so it never ships to production.

| Stack | File | Where |
|-------|------|-------|
| Next.js App Router | `app/layout.tsx` | in `<body>` |
| Next.js Pages Router | `pages/_app.tsx` or `pages/_document.tsx` | in the document body |
| Vite / CRA / plain HTML | `index.html` | just before `</body>` |
| Astro | base layout `.astro` | in `<body>` |
| Remix | `app/root.tsx` | in `<body>` |
| Rails / Django / etc. | base template (`application.html.erb`, `base.html`) | before `</body>` |

**Next.js (App Router)** — dev-gated, so production builds tree-shake it out:

```tsx
// app/layout.tsx, inside <body>
{process.env.NODE_ENV !== "production" && (
  // eslint-disable-next-line @next/next/no-sync-scripts
  <script src="http://localhost:7331/toolbar.js" async />
)}
```

**Plain HTML** — only add the tag to your local/dev build:

```html
<!-- before </body> -->
<script src="http://localhost:7331/toolbar.js" async></script>
```

The toolbar derives the sidecar address from its own `src`, so if you run
clickfix on a different `--port` for another project, just change the port in
that project's script tag to match.

## What gets captured

Every note is one JSON line:

```json
{
  "id": "…", "status": "open", "created_at": "…",
  "route": "/today", "framework": "react",
  "component": "BriefingPage", "component_chain": ["SignalRow", "BriefingPage"],
  "source_file": "app/today/page.tsx", "line": 1254, "column": 12,
  "selector": "ul.bt-sig-list > li:nth-of-type(1) > button.bt-sig-row",
  "text": "This FDA source lists ALKEM LABS LTD…",
  "kind": "ui",
  "instruction": "wrap this so it doesn't truncate"
}
```

How much you get depends on the page:

| Site | route + selector + text | component + chain | `source_file:line` |
|------|:-:|:-:|:-:|
| **React, webpack dev** | ✅ | ✅ | ✅ exact |
| **React, Turbopack dev** (Next 15/16 default) | ✅ | ✅ | ❌ chunk-only* |
| **Any other site** (Vue, Svelte, Astro, static, server-rendered) | ✅ | ❌ | ❌ |

\* React 19 replaced `_debugSource` with `_debugStack`; under Turbopack those
frames point at compiled chunks, so only the component name survives. For literal
`file:line` on a Next app, run dev with `next dev --webpack`. The component name +
selector + text already pin down the code in one grep, so the line is a bonus, not
a requirement.

## Two kinds of feedback: UI tweak vs Fix behaviour

When you compose a note, a toggle tags it so `/clickfix` treats it the right way:

- **✦ UI tweak** (default) — a surgical visual/copy edit at the clicked location. The
  clicked element *is* the edit target.
- **🪲 Fix behaviour** — for when the symptom you clicked (wrong data, a daft reply) has
  its cause somewhere upstream. `/clickfix` treats the clicked element only as a starting
  point, traces the data/logic to the **root cause**, **diagnoses first** and checks with
  you before changing logic — instead of papering over it in the UI.

`/clickfix` works the two kinds as separate passes, so a CSS tweak is never conflated
with a logic fix.

## Working the notes with /clickfix

Notes captured by the toolbar just sit in `.feedback/inbox.jsonl`. To act on them, open a
**Claude Code session in the same project** and run:

```
/clickfix
```

Each run **claims one ticket at a time** from the sidecar, works it, commits the fix,
and resolves it — then claims the next, until the queue's empty. Per ticket:

- **UI tweaks** — makes the edit at the captured `source_file:line` (or via
  `component` + `selector` + on-screen `text`), matching surrounding style.
- **Behaviour bugs** — traces the root cause, **shows you its diagnosis + proposed fix
  first**, and waits for your go-ahead before editing.

Because it's just your Claude Code session, **clarifying is normal chat** — *"yes, go
ahead"*, *"no, the real issue is the API filter"* — with full context and no
terminal-vs-popup juggling. Each fix is committed on your current branch as it's
finished, then the ticket is resolved and the toolbar badge drops.

### Parallel threads & targeting

Claiming a ticket flips it to `in_progress` **atomically** (the sidecar is a single
process, so two threads can't grab the same note). That means:

- **Open several Claude Code threads, run `/clickfix` in each** → they divide the open
  tickets between them, no double-work. Each thread holds one ticket at a time, so the
  queue keeps draining across all of them.
- **Point a thread at a specific ticket:** `/clickfix <id>` (full id or short prefix)
  claims just that one and stops.

> The toolbar shows a passive **`N notes → /clickfix`** badge of how many are still
> `open` (claimed/in-progress ones drop off). clickfix runs no agent of its own —
> *you* (in Claude Code) are the agent, so git, branches, and commits stay in your hands.

Prefer to drive it yourself without the command? The mailbox is just a file — read
`.feedback/inbox.jsonl` and act on `status: "open"` notes.

## API

- `GET /toolbar.js` — the injected toolbar
- `POST /feedback` — append a note (`{ instruction, kind, route, source_file, line, component, component_chain, selector, text }`); `kind` is `"ui"` (default) or `"behavior"`
- `GET /feedback?status=open` — list notes (`status` ∈ `open` | `in_progress` | `done`)
- `POST /claim` — atomically claim a ticket (`{ id? , kind? }`) → `{ note }` (now `in_progress`) or `{ note: null, reason }`. How parallel `/clickfix` threads divide work.
- `PATCH /feedback` — `{ id, status: "open" | "in_progress" | "done" }` — resolve (`done`), or release a claim back to `open`

## Notes

- Dev-only by design. Don't ship the `<script>` tag to production.
- CORS is open (`*`) so the toolbar can POST from your site's origin to the sidecar.
- The toolbar is vanilla JS and injects its own DOM; it reads the host page's
  React fibers when present but does not depend on the host's framework.

## License

MIT
