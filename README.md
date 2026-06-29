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

## How it works (the mental model)

clickfix is **two halves**:

1. A **browser toolbar** that captures feedback — you click an element on your running app,
   type what's wrong, and it saves a precise "ticket" (page + element + source file:line +
   your note) to a local file (`.feedback/inbox.jsonl`).
2. Two **[Claude Code](https://docs.anthropic.com/en/docs/claude-code) commands** that work
   those tickets — `/clickfix` (fix them) and `/clickfix-doc` (diagnose them into a doc).

So when you're using it, **three things run at once** in your project: your **dev server**,
the **clickfix sidecar** (serves the toolbar + holds the tickets), and a **Claude Code**
session (does the actual work). The capture and the fixing are deliberately separate — leave
a pile of feedback while you click around, then action it all in Claude Code when ready.

> **`/clickfix` and `/clickfix-doc` are Claude Code commands (a.k.a. skills).** They're just
> markdown files in `~/.claude/commands/`; in current Claude Code, slash commands and skills
> are the same thing. `clickfix install` is what puts them on your machine — after that you
> just type `/clickfix` in any Claude Code session.

## What you need

- **Node 18+**
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — the fixing happens here.
  (No Claude Code? You can still capture tickets; they're just a JSONL file you could read
  with any agent.)

## Setup — once per machine

```bash
npm i -g github:emb91/clickfix     # installs the `clickfix` command (not on npm yet — from GitHub)
clickfix install                    # adds the /clickfix and /clickfix-doc commands to ~/.claude/commands
```

`clickfix install` only needs running once — the commands then work in **every** project.
(Prefer a local checkout? `git clone` the repo, then `npm link`, then `clickfix install`.)

## Setup — once per project

Load the toolbar in your app, **development only** (so it never ships to production):

```html
<script src="http://localhost:7331/toolbar.js"></script>
```

Put it in whatever file renders on every page (your root layout / template) — see
[Where the script goes](#where-the-script-goes) for per-framework placement.

## Daily use

> **Run everything from your project folder.** clickfix stores tickets relative to where you
> launch it (in `<that folder>/.feedback/`), and `/clickfix` reads them relative to where
> Claude Code is rooted. So the sidecar **and** the Claude Code session must both be started
> from your project's root directory — otherwise they won't see the same tickets.

1. **Start the sidecar from your project root** and leave it running:
   ```bash
   cd /path/to/your/project && clickfix     # serves http://localhost:7331
   ```
   The `cd` matters — clickfix stores tickets in `<that folder>/.feedback/`. (Override the
   port/dir with `clickfix --port 7331 --dir /path/to/your/project` to run from anywhere.)
   Your dev server runs as normal alongside it.
2. **Leave feedback in the browser.** A **✦ Feedback** button appears bottom-right (drag it
   anywhere — it remembers). Click it → click any element → choose **✦ UI tweak** or
   **🪲 Fix behaviour** → type what should change → **Send**. The button shows a
   **`N notes → /clickfix`** badge of how many are waiting.
3. **Work the tickets in Claude Code.** Open a Claude Code session **from that same project
   folder** (`cd /path/to/your/project && claude`) and run one of:
   - **`/clickfix`** — works each ticket: makes UI tweaks directly, diagnoses behaviour bugs
     first (and checks with you before changing logic), commits each fix, and resolves it.
     You clarify by just chatting.
   - **`/clickfix-doc`** — *diagnoses only*: writes findings to a doc and closes the ticket
     **without touching code** (see [below](#diagnose-only-mode-clickfix-doc)).

   Run several Claude Code sessions at once and they split the queue automatically (tickets
   are claimed atomically — no two sessions grab the same one). `/clickfix <id>` targets one
   specific ticket.

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

## Diagnose-only mode (/clickfix-doc)

`/clickfix` fixes things on the spot. `/clickfix-doc` is its **diagnose-don't-touch**
sibling: it works out the root cause of each ticket and writes it up, but **never changes
code**. It exists for the times when "just fix it" isn't what you want:

- **Triage before you trust it.** Read the agent's root-cause analysis and proposed fix
  *before* any edit lands — good for unfamiliar or risky areas of the codebase.
- **Turn feedback into a backlog.** Convert a pile of clicked-in tickets into one structured
  doc a teammate — or another agent — can pick up and implement later.
- **Separate "find" from "fix."** Run a diagnosis sweep across the whole queue in one go,
  then decide what to implement, in what order, and by whom. (This is the building block if
  you want to orchestrate: one pass diagnoses into the doc, others implement from it.)
- **Surface decisions, not guesses.** When a fix needs a product call (A vs B), you get the
  options written down instead of a guess committed to your branch.

```
/clickfix-doc
```

For each ticket it claims, it:

1. **Investigates only** — traces the root cause, works out the concrete fix, notes related
   issues — but **changes no code**.
2. **Writes its findings** to `.clickfix/clickfix_rootcause_bugs.md` — appending a section
   per ticket (what it investigated, root cause + `file:line`, the recommended fix, anything
   else worth a look). It creates the doc if it doesn't exist.
3. **Closes the ticket** (so the toolbar badge drops) — in this mode *documented = done*.

It uses the same atomic ticket queue, so the parallel-threads and `/clickfix-doc <id>`
targeting above work identically. The output is one growing markdown file you can read,
hand to a teammate, or feed to `/clickfix` later to implement.

**When to use which:**

| | `/clickfix` | `/clickfix-doc` |
|---|---|---|
| Changes code? | ✅ fixes + commits | ❌ never |
| Output | edits on your branch | a section in `.clickfix/clickfix_rootcause_bugs.md` |
| Use it when | you trust it to just fix things | you want to review root causes first, or batch up a backlog for a reviewer |

Tip: add `.clickfix/` to your project's `.gitignore` — it's a working doc, not source.

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
