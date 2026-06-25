# clickfix

Click an element on your running site, type the edit you want, and your AI coding
agent gets the **exact page, component, source line, selector, text, and your
instruction** — instead of you screenshotting and describing it.

It's a tiny local **sidecar**: one process serves the toolbar and a JSONL mailbox.
Your site loads one `<script>` in dev. No backend changes, no framework lock-in.

```
 browser (your site)                 sidecar (localhost:7331)        your agent
 ┌──────────────────┐   POST /feedback   ┌────────────────────┐   reads   ┌──────────┐
 │ ✦ click + type   │ ─────────────────▶ │ .feedback/inbox    │ ────────▶ │ edits    │
 │ (toolbar.js)     │                    │   .jsonl           │           │ the code │
 └──────────────────┘                    └────────────────────┘           └──────────┘
```

## Quick start

In your project directory:

```bash
npx clickfix          # starts on http://localhost:7331
```

Add this to your site **in development only** (e.g. behind a `NODE_ENV` check):

```html
<script src="http://localhost:7331/toolbar.js"></script>
```

A **✦ Feedback** button appears bottom-right. Click it → click any element →
type what should change → **Send**. Notes append to `.feedback/inbox.jsonl`.

Options: `npx clickfix --port 7331 --dir .`

### One-time: authenticate the agent

The **Work now** button runs the `claude` CLI, which needs to be signed in **in a
terminal** (a desktop-app login doesn't carry over). Do this once per machine:

```bash
claude auth login      # sign in to your Claude subscription
claude auth status     # verify — should show you're logged in
```

This persists, so you don't repeat it each session — only the dev server and
`npx clickfix` need restarting when you spin the app back up. If clickfix ever
reports `Not logged in`, run `claude auth login` again.

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

When you compose a note, a toggle picks how the agent should treat it:

- **✦ UI tweak** (default) — a surgical visual edit at the clicked location. The clicked
  element *is* the edit target.
- **🪲 Fix behaviour** — for when the symptom you clicked (wrong data, a daft agent reply)
  has its cause somewhere upstream. The agent treats the clicked element only as a
  starting point, traces the data/logic to the **root cause**, and is told *not* to paper
  over it by editing the UI.

The two kinds never get bundled into one prompt — they run as separate passes with
separate mindsets, so a CSS tweak is never conflated with a logic fix.

## Make the agent work immediately (the "Work" buttons)

The toolbar shows **▶ Work N UI** and/or **🪲 Fix N** whenever there are open notes of
each kind. Click one and the sidecar spawns **one headless Claude Code session** for
that kind.

- **UI** notes are edited and marked `done` when the agent exits cleanly (re-opened if
  it fails) — no callbacks, the agent only edits files.
- **Behaviour** notes get a **diagnose-first** pass: the agent investigates, reports the
  root cause + proposed fix, and **changes nothing yet**. The notes stay `in_progress`
  and its diagnosis appears in a **✦ Claude** card in the toolbar.

While it runs you see **⟳ Claude is working…**; when it finishes, your dev server
hot-reloads with any changes.

### Replying / clarifying (the chat loop)

Because the agent runs headless, the terminal is read-only — so when it asks a question
or proposes a fix, you answer in the toolbar's reply box. Sending a reply **resumes the
same Claude Code session** (`--resume`), so it keeps full context:

> *"yes, go ahead"* &nbsp;·&nbsp; *"no — the real issue is the API filter, fix that"*

This is the loop for behaviour fixes: **Fix N → read the diagnosis → reply to approve or
redirect → it applies the fix → Resolve ✓** (marks the notes done). It also works any
time the agent says *"I'm not sure what you meant"* — just reply and it continues.

Under the hood it runs:

```bash
claude -p "<all open notes>" --permission-mode acceptEdits   # cwd = your project
```

`acceptEdits` auto-applies edits with no prompts; the agent batches all notes in one
session (one click = one session = predictable cost).

**Prerequisite:** the `claude` CLI must be on PATH **and signed in for headless use**.
The desktop app's login doesn't carry into a plain terminal, so run this once:

```bash
claude auth login     # uses your Claude subscription; `claude auth status` to verify
```

Without it the agent exits with `Not logged in` and the notes are re-opened.

**Live progress.** The agent runs in streaming mode, so you see each step as it
happens — the toolbar pill shows the current action (e.g. `↳ Edit app/today/page.tsx`)
and the sidecar terminal prints the same readable log — instead of a frozen "working…".

Configure via env:

- `CLICKFIX_AGENT_BIN` — agent binary (default `claude`)
- `CLICKFIX_GIT` — git boxing mode (see below): `commit` (default), `pr`, or `0`/`off`

Prefer pulling notes yourself instead? The mailbox is just a file. For Claude Code,
drop this into the project's `CLAUDE.md`:

```md
## clickfix feedback
When I say "check feedback", read `.feedback/inbox.jsonl`. For each note with
`status: "open"`: open `source_file:line` (or locate via `component` + `selector`
+ `text`), make the edit in `instruction`, then mark it done:
`curl -X PATCH http://localhost:7331/feedback -H 'Content-Type: application/json' -d '{"id":"<id>","status":"done"}'`
```

## Boxing the agent's work into a branch

By default, instead of leaving the agent's edits as loose changes in your working
tree, clickfix **isolates each conversation's edits onto their own
`clickfix/<kind>-<timestamp>` branch** — so its work is a reviewable unit, not
something that gets lost alongside whatever else you're doing.

How it stays clean and **safe**:

- **The commit is built entirely out-of-band.** clickfix never runs `git switch`,
  `add`, `commit`, or `reset` against your live repo. It builds the commit in a
  throwaway index (`read-tree` → `add` → `write-tree` → `commit-tree`) and moves a
  branch ref. **Your working tree, index, and current branch are never touched** —
  so the agent's view stays stable and untracked files can't be wiped by a branch
  switch. The changes stay in your tree, uncommitted, for live preview; the branch
  is a parallel snapshot.
- **Only the agent's edits are committed.** clickfix snapshots your dirty files when
  the conversation starts and commits only what changed *after* that — your own
  pre-existing WIP is never swept in. New untracked files the agent creates **are**
  captured.
- **The agent does no git itself.** It's told explicitly not to branch/commit/push
  (clickfix handles that), so it doesn't fight git-workflow hooks or your global
  "one branch per task" rule, and won't panic that committed work was "lost."
- **One branch per conversation.** A Work/Fix click starts it; replies update the
  same branch (the commit is rebuilt each turn = HEAD + all the agent's changes). A
  behaviour *diagnosis* (which edits nothing) makes no commit.
- **It commits to the project you're editing**, i.e. the `--dir` you launched
  clickfix in (`process.cwd()` by default) — never the clickfix package. The startup
  banner prints `git target repo: <path>` so you can confirm.

Modes via `CLICKFIX_GIT`:

| Value | Behaviour |
|-------|-----------|
| `commit` *(default)* | branch + commit only — no push, no PR |
| `pr` | also push the branch and open a PR via `gh` |
| `0` / `off` | disabled — edits stay as working-tree changes |

`commit` is the default because the PR push is outward-facing: on a repo you're
mid-feature on, it can open a PR against the *wrong* base. Opt into `pr` per repo
once you trust it; in `pr` mode the PR targets the branch you're on (clean diff =
just the agent's changes) and clickfix **warns** if that isn't your default branch.
Push/PR needs a git remote and the `gh` CLI authenticated (`gh auth status`); without
them clickfix keeps the local commit and logs that it skipped the PR.

## API

- `GET /toolbar.js` — the injected toolbar
- `POST /feedback` — append a note (`{ instruction, kind, route, source_file, line, component, component_chain, selector, text }`); `kind` is `"ui"` (default) or `"behavior"`
- `GET /feedback?status=open` — list notes
- `PATCH /feedback` — `{ id, status: "open" | "done" }`
- `POST /run` — dispatch one agent over open notes of one kind (`{ kind }`, default `"ui"`) → `{ dispatched }`, or `409` if already running
- `POST /reply` — `{ text }` — resume the current agent session with a follow-up message (clarify / approve / redirect)
- `GET /run` — run status + conversation (`{ running, dispatched, ok, activity, kind, canReply, lastMessage, pendingIds, branch, prUrl, gitMessage, startedAt, finishedAt }`)

## Notes

- Dev-only by design. Don't ship the `<script>` tag to production.
- CORS is open (`*`) so the toolbar can POST from your site's origin to the sidecar.
- The toolbar is vanilla JS and injects its own DOM; it reads the host page's
  React fibers when present but does not depend on the host's framework.

## License

MIT
