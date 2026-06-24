# page-feedback

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
npx page-feedback          # starts on http://localhost:7331
```

Add this to your site **in development only** (e.g. behind a `NODE_ENV` check):

```html
<script src="http://localhost:7331/toolbar.js"></script>
```

A **✦ Feedback** button appears bottom-right. Click it → click any element →
type what should change → **Send**. Notes append to `.feedback/inbox.jsonl`.

Options: `npx page-feedback --port 7331 --dir .`

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

## Letting your agent consume it

The mailbox is just a file — point any agent at it. For Claude Code, drop this
into the consuming project's `CLAUDE.md`:

```md
## Page feedback
When I say "check feedback", read `.feedback/inbox.jsonl`. For each note with
`status: "open"`: open `source_file:line` (or locate via `component` + `selector`
+ `text`), make the edit in `instruction`, then mark it done:
`curl -X PATCH http://localhost:7331/feedback -H 'Content-Type: application/json' -d '{"id":"<id>","status":"done"}'`
```

## API

- `GET /toolbar.js` — the injected toolbar
- `POST /feedback` — append a note (`{ instruction, route, source_file, line, component, component_chain, selector, text }`)
- `GET /feedback?status=open` — list notes
- `PATCH /feedback` — `{ id, status: "open" | "done" }`

## Notes

- Dev-only by design. Don't ship the `<script>` tag to production.
- CORS is open (`*`) so the toolbar can POST from your site's origin to the sidecar.
- The toolbar is vanilla JS and injects its own DOM; it reads the host page's
  React fibers when present but does not depend on the host's framework.

## License

MIT
