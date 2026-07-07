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
 │ ✦ click + type   │ ─────────────────▶ │ .clickfix/inbox    │ ◀──reads───── │ edits +  │
 │ (toolbar.js)     │                    │   .jsonl           │ ──notes────▶  │ you chat │
 └──────────────────┘                    └────────────────────┘               └──────────┘
```

## How it works (the mental model)

clickfix is **two halves**:

1. A **browser toolbar** that captures feedback — you click an element on your running app,
   type what's wrong, and it saves a precise "ticket" (page + element + source file:line +
   your note) to a local file (`.clickfix/inbox.jsonl`).
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
clickfix install                    # adds /clickfix, /clickfix-doc, /clickfix-orchestrate, /clickfix-decisions, /clickfix-questions
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
> launch it (in `<that folder>/.clickfix/`), and `/clickfix` reads them relative to where
> Claude Code is rooted. So the sidecar **and** the Claude Code session must both be started
> from your project's root directory — otherwise they won't see the same tickets.

1. **Start the sidecar from your project root** and leave it running:
   ```bash
   cd /path/to/your/project && clickfix     # serves http://localhost:7331
   ```
   The `cd` matters — clickfix stores tickets in `<that folder>/.clickfix/`. (Override the
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

## Multiple projects at once (per-project sidecars)

clickfix is **per-project** — run `clickfix` in each repo and each gets its own instance:

- **No port juggling.** If `7331` is already taken (another project's sidecar), clickfix
  **auto-picks the next free port** and prints it — no more `EADDRINUSE` crash. It records the
  chosen port in that project's `.clickfix/sidecar.json`.
- **Commands find the right one.** The `/clickfix*` commands read `.clickfix/sidecar.json` to
  target *this* project's sidecar, and check its `/health` identity before claiming — so a
  command **refuses to work another repo's tickets** (it won't diagnose a lifey ticket while
  you're in biosignals). Tickets stay in their own project.
- **Toolbar:** set that project's `<script>` port to its sidecar port (the one clickfix printed).

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

## Three kinds of feedback: Tweak · Bug · Ask

When you compose a note, a toggle tags it so `/clickfix` treats it the right way:

- **✦ Tweak** (default, `ui`) — a surgical visual/copy edit at the clicked location. The
  clicked element *is* the edit target.
- **🪲 Bug** (`behavior`) — for when the symptom you clicked (wrong data, a daft reply) has
  its cause somewhere upstream. `/clickfix` treats the clicked element only as a starting
  point, traces the data/logic to the **root cause**, **diagnoses first** and checks with
  you before changing logic — instead of papering over it in the UI.
- **❓ Ask** (`question`) — a query or note, *not* a change request ("what's the $ cap on
  this?"). `/clickfix` **answers it from the code — no edits.** If the answer surfaces a real
  bug or needed change, it tells you and asks before turning it into a Tweak/Bug.

`/clickfix` works the kinds as separate passes, so a CSS tweak, a logic fix, and a question
are never conflated.

## Working the notes with /clickfix

Notes captured by the toolbar just sit in `.clickfix/inbox.jsonl`. To act on them, open a
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
`.clickfix/inbox.jsonl` and act on `status: "open"` notes.

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

## Advanced: multi-agent orchestration

If you want to go beyond "click → `/clickfix`" and run a **fleet of agents off the
backlog** — an orchestrator that hands each ticket to a sub-agent, audits the work, and
opens PRs, with a human owner making product calls — set it up in three steps:

**Step 1 — install (once per machine).** Same `clickfix install` as above; it also adds the
`/clickfix-orchestrate` command alongside `/clickfix` and `/clickfix-doc`.

**Step 2 — scaffold (once per project).** From the project root:

```bash
clickfix orchestrate
```

Drops `AGENTS.md` at the repo root and the `.clickfix/` coordination docs, gitignores
`.clickfix/`, and **auto-fills what it can detect** — your check commands (from lockfiles:
pnpm/npm/yarn/bun, TypeScript, Python/pytest, Go, Rust, Supabase) into `AGENTS.md`, and the
owner + repo + checkout path (from git) into `integrator_role.md`. Idempotent and never
overwrites files you've edited, so it's safe to re-run. (Already hand-set up `.clickfix/`?
It keeps every existing file and only adds what's missing.)

**Step 3 — run the loop.** In a Claude Code session rooted in the project:

```
/clickfix-orchestrate
```

On first run it **finishes setup with you** — confirms the detected checks and asks where
tickets come from — then runs the loop: reconcile from tools → launch gate + WIP cap → assign
one agent per ticket → audit → PR → owner-decision queue → recovery board.

**Decisions that need you (optional dedicated thread).** When a ticket needs a product call, a
diagnosis agent flags it `decision required`. The orchestrator **skips** those. Run
**`/clickfix-decisions`** — its own thread, the sole writer of `owner_decision_queue.md` — to
surface them to you (silent when there are none); once you rule, it flags the ticket
`ready for orchestrator` and the orchestrator picks it up. This keeps owner decisions from
getting lost without stalling the build loop.

**Questions you ask (`❓ Ask` tickets, separate lane).** An `❓ Ask` note is a *question about the
code*, not a change. The orchestrator **skips** those too. Run **`/clickfix-questions`** — it
claims the question, spawns a read-only research subagent, gives you an **ELI5 answer**, logs the
Q&A to its own `.clickfix/clickfix_questions.md`, and closes it. A satisfying answer never touches
the orchestrator. Only if you reject the answer ("no, this is a real problem because…") does it
append a ticket to `clickfix_rootcause_bugs.md` — opening new work for the orchestrator. (Decisions
*wait* on you; questions *resolve on answer* — hence separate threads.)

The starter templates live in [`templates/orchestration/`](templates/orchestration/); see its
[README](templates/orchestration/README.md) for the pattern. Entirely optional — the core
`/clickfix` loop needs none of it.

## API

- `GET /toolbar.js` — the injected toolbar
- `POST /feedback` — append a note (`{ instruction, kind, route, source_file, line, component, component_chain, selector, text }`); `kind` is `"ui"` (default), `"behavior"`, or `"question"`
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
