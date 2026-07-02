/* clickfix toolbar — vanilla, framework-agnostic.
 * Loaded via <script src="http://localhost:PORT/toolbar.js"></script> in dev.
 * Click an element, type an edit; it captures route + selector + text always,
 * and (on React pages) the component chain + source file:line, then POSTs to the
 * sidecar mailbox. You then work the notes in a Claude Code session with /clickfix.
 * Reads the HOST page's React fibers directly from the DOM — the toolbar itself
 * needs no framework. */
;(function () {
  if (window.__clickfixLoaded) return
  window.__clickfixLoaded = true

  var ORIGIN = (function () {
    try {
      return new URL(document.currentScript.src).origin
    } catch (e) {
      return "http://localhost:7331"
    }
  })()
  var Z = 2147483000

  // ---------------------------------------------------------------- introspect
  function getFiber(node) {
    for (var k in node) {
      if (k.indexOf("__reactFiber$") === 0 || k.indexOf("__reactInternalInstance$") === 0) return node[k]
    }
    return null
  }
  function nameOfType(t) {
    if (!t) return null
    if (typeof t === "function") return t.displayName || t.name || null
    if (typeof t === "object") return t.displayName || (t.render && (t.render.displayName || t.render.name)) || null
    return null
  }
  // React 19 `_debugStack` (or React 18 `_debugSource`) → source file:line + component chain.
  var SOURCE_FRAME = /\b((?:app|components|lib|context|hooks|src|pages)\/[^\s:)?]+\.(?:tsx|ts|jsx|js)):(\d+):(\d+)/
  var INTERNAL_FRAME = /(?:node_modules|_next\/static|react-stack|react-dom|react-server|jsxDEV)/
  function parseDebugStack(stack) {
    var out = { source: null, components: [] }
    if (!stack) return out
    var lines = stack.split("\n")
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i]
      var at = ln.match(/^\s*at\s+([A-Za-z0-9_$.]+)\s*\(/)
      if (at) {
        var name = at[1]
        if (/^[A-Z]/.test(name) && !/^(Object|Module|Function)\b/.test(name) && out.components.indexOf(name) === -1) {
          out.components.push(name)
        }
      }
      if (!out.source && !INTERNAL_FRAME.test(ln)) {
        var m = ln.match(SOURCE_FRAME)
        if (m) out.source = { file: m[1], line: parseInt(m[2], 10), column: parseInt(m[3], 10) }
      }
    }
    return out
  }
  function introspect(node) {
    var fiber = getFiber(node)
    if (!fiber) return { source_file: null, line: null, column: null, component: null, component_chain: null, framework: null }
    var ds =
      (fiber._debugStack && fiber._debugStack.stack) ||
      (fiber._debugOwner && fiber._debugOwner._debugStack && fiber._debugOwner._debugStack.stack) ||
      null
    var parsed = parseDebugStack(ds)
    var legacy = null,
      owner = null,
      f = fiber
    while (f) {
      if (!legacy && f._debugSource) legacy = f._debugSource
      if (!owner && f._debugOwner) owner = nameOfType(f._debugOwner.type)
      if (legacy && owner) break
      f = f.return
    }
    var component = parsed.components[0] || owner || null
    var chain = parsed.components.length ? parsed.components.slice(0, 4) : owner ? [owner] : null
    return {
      source_file: (parsed.source && parsed.source.file) || (legacy && legacy.fileName) || null,
      line: (parsed.source && parsed.source.line) || (legacy && legacy.lineNumber) || null,
      column: (parsed.source && parsed.source.column) || (legacy && legacy.columnNumber) || null,
      component: component,
      component_chain: chain,
      framework: "react",
    }
  }
  function cssEsc(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&")
  }
  function cssPath(el) {
    var parts = [],
      node = el
    while (node && node.nodeType === 1 && parts.length < 5) {
      var sel = node.nodeName.toLowerCase()
      if (node.id) {
        parts.unshift(sel + "#" + cssEsc(node.id))
        break
      }
      var cn = typeof node.className === "string" ? node.className.trim() : ""
      if (cn)
        sel += cn
          .split(/\s+/)
          .slice(0, 2)
          .map(function (c) {
            return "." + cssEsc(c)
          })
          .join("")
      var parent = node.parentElement
      if (parent) {
        var sibs = Array.prototype.filter.call(parent.children, function (c) {
          return c.nodeName === node.nodeName
        })
        if (sibs.length > 1) sel += ":nth-of-type(" + (sibs.indexOf(node) + 1) + ")"
      }
      parts.unshift(sel)
      node = node.parentElement
    }
    return parts.join(" > ")
  }
  function shortFile(p) {
    if (!p) return ""
    var m = p.match(/(?:^|\/)((?:app|components|lib|context|hooks|src|pages)\/.*)/)
    return m ? m[1] : p.split("/").slice(-2).join("/")
  }
  function esc(s) {
    var d = document.createElement("div")
    d.textContent = s == null ? "" : String(s)
    return d.innerHTML
  }

  // ----------------------------------------------------------------------- UI
  var state = {
    mode: "idle", // idle | picking | compose
    captured: null,
    kind: "ui", // compose-panel choice: "ui" (visual tweak) | "behavior" (fix root cause)
    openCount: 0, // notes waiting to be worked
    toast: null,
    instruction: "",
  }

  var root = document.createElement("div")
  root.setAttribute("data-clickfix", "")
  root.style.cssText =
    "position:fixed;bottom:16px;right:16px;z-index:" + Z + ";font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;color:#e7eaf0;"

  var highlight = document.createElement("div")
  highlight.style.cssText =
    "position:fixed;display:none;z-index:" + (Z - 1) + ";pointer-events:none;border:2px solid #2dd4bf;background:rgba(45,212,191,0.12);border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,0.4);"

  // -------------------------------------------------------------------- dragging
  // The toolbar lives bottom-right by default; drag it anywhere by the ✦ Feedback
  // button. Position persists per-origin in localStorage.
  var POS_KEY = "__clickfix_pos"
  var drag = null // { sx, sy, ox, oy, moved } while a drag is in progress
  var suppressClick = false // true briefly after a drag, so the trailing click is ignored

  function loadPos() {
    try {
      var p = JSON.parse(localStorage.getItem(POS_KEY))
      if (p && typeof p.left === "number" && typeof p.top === "number") return p
    } catch (e) {}
    return null
  }
  function applyPos(p) {
    if (!p) return
    root.style.left = p.left + "px"
    root.style.top = p.top + "px"
    root.style.right = "auto"
    root.style.bottom = "auto"
  }
  function clamp(v, max) {
    return Math.max(0, Math.min(v, Math.max(0, max)))
  }
  function startDrag(e) {
    if (e.button !== 0) return
    var r = root.getBoundingClientRect()
    drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false }
    document.addEventListener("mousemove", onDrag, true)
    document.addEventListener("mouseup", endDrag, true)
  }
  function onDrag(e) {
    if (!drag) return
    var dx = e.clientX - drag.sx,
      dy = e.clientY - drag.sy
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return // tolerate jitter so clicks still register
    drag.moved = true
    e.preventDefault()
    var r = root.getBoundingClientRect()
    applyPos({
      left: clamp(drag.ox + dx, window.innerWidth - r.width),
      top: clamp(drag.oy + dy, window.innerHeight - r.height),
    })
  }
  function endDrag() {
    document.removeEventListener("mousemove", onDrag, true)
    document.removeEventListener("mouseup", endDrag, true)
    if (drag && drag.moved) {
      var r = root.getBoundingClientRect()
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ left: r.left, top: r.top }))
      } catch (e) {}
      suppressClick = true // swallow the click that fires right after mouseup
      setTimeout(function () {
        suppressClick = false
      }, 0)
    }
    drag = null
  }

  function mount() {
    document.documentElement.appendChild(highlight)
    document.documentElement.appendChild(root)
    applyPos(loadPos())
    refreshCount()
    render()
  }

  function refreshCount() {
    fetch(ORIGIN + "/feedback?status=open")
      .then(function (r) {
        return r.ok ? r.json() : { items: [] }
      })
      .then(function (d) {
        state.openCount = Array.isArray(d.items) ? d.items.length : 0
        render()
      })
      .catch(function () {})
  }

  function toast(msg) {
    state.toast = msg
    render()
    setTimeout(function () {
      state.toast = null
      render()
    }, 2200)
  }

  function setMode(m) {
    state.mode = m
    if (m !== "picking") highlight.style.display = "none"
    render()
  }

  function send() {
    if (!state.instruction.trim()) return
    var c = state.captured || {}
    var payload = {
      route: location.pathname + location.search,
      origin: location.origin,
      framework: c.framework || null,
      source_file: c.source_file || null,
      line: c.line || null,
      column: c.column || null,
      component: c.component || null,
      component_chain: c.component_chain || null,
      selector: c.selector || null,
      text: c.text || null,
      kind: state.kind,
      instruction: state.instruction,
    }
    fetch(ORIGIN + "/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        if (!r.ok) throw new Error()
        state.instruction = ""
        state.captured = null
        state.mode = "idle"
        toast(
          state.kind === "behavior"
            ? "Bug logged → /clickfix"
            : state.kind === "question"
            ? "Question logged → /clickfix"
            : "Sent → /clickfix"
        )
        refreshCount()
      })
      .catch(function () {
        toast("Failed to send")
      })
  }

  function render() {
    root.innerHTML = ""

    if (state.toast) {
      var t = document.createElement("div")
      t.style.cssText =
        "margin-bottom:8px;padding:6px 10px;background:#0f172a;border:1px solid #1e293b;border-radius:8px;text-align:center;"
      t.textContent = state.toast
      root.appendChild(t)
    }

    if (state.mode === "compose" && state.captured) {
      var c = state.captured
      var loc = c.source_file
        ? esc(shortFile(c.source_file)) + (c.line ? ":" + c.line : "")
        : c.component_chain && c.component_chain.length > 1
        ? '<span style="color:#64748b">in ' + esc(c.component_chain.join(" › ")) + "</span>"
        : '<span style="color:#94a3b8">located by selector</span>'
      var k = state.kind
      var seg = function (active) {
        return (
          "flex:1;border:none;border-radius:6px;padding:6px 6px;font-size:12px;font-weight:600;cursor:pointer;" +
          (active ? "background:#2dd4bf;color:#04211d" : "background:transparent;color:#94a3b8")
        )
      }
      var panel = document.createElement("div")
      panel.style.cssText =
        "width:320px;background:#0b1220;border:1px solid #1e293b;border-radius:12px;padding:12px;box-shadow:0 10px 40px rgba(0,0,0,0.5);"
      panel.innerHTML =
        '<div style="display:flex;gap:4px;margin-bottom:8px;background:#020617;border:1px solid #1e293b;border-radius:8px;padding:3px">' +
        '<button data-pf="kind-ui" style="' + seg(k === "ui") + '">✦ Tweak</button>' +
        '<button data-pf="kind-bug" style="' + seg(k === "behavior") + '">🪲 Bug</button>' +
        '<button data-pf="kind-ask" style="' + seg(k === "question") + '">❓ Ask</button>' +
        "</div>" +
        '<div style="font-size:11px;color:#94a3b8;margin-bottom:8px;line-height:1.5">' +
        '<div><span style="color:#64748b">page </span>' +
        esc(location.pathname) +
        "</div>" +
        '<div><span style="color:#64748b">element </span>' +
        (c.component ? '<span style="color:#2dd4bf">&lt;' + esc(c.component) + "&gt; </span>" : "") +
        loc +
        "</div>" +
        (c.text ? '<div style="color:#64748b;margin-top:2px">“' + esc(c.text) + "”</div>" : "") +
        "</div>" +
        (k === "behavior"
          ? '<div style="font-size:11px;color:#fbbf24;margin-bottom:8px;line-height:1.4">In /clickfix, Claude Code will trace the root cause and propose a fix before changing anything.</div>'
          : k === "question"
          ? '<div style="font-size:11px;color:#60a5fa;margin-bottom:8px;line-height:1.4">In /clickfix, Claude Code will answer this from the code — it won’t change anything.</div>'
          : "") +
        '<textarea data-pf="ta" rows="3" placeholder="' +
        (k === "behavior"
          ? "What&#39;s wrong here? (e.g. this shows the wrong company&#39;s data)"
          : k === "question"
          ? "What do you want to know? (e.g. what&#39;s the $ cap on this?)"
          : "What should change here?") +
        '" style="width:100%;box-sizing:border-box;resize:vertical;background:#020617;color:#e7eaf0;border:1px solid #1e293b;border-radius:8px;padding:8px 10px;font-size:13px;outline:none"></textarea>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<button data-pf="send" style="flex:1;border:none;border-radius:8px;padding:8px 10px;font-weight:600;cursor:pointer;background:#2dd4bf;color:#04211d">' +
        (k === "behavior" ? "Log bug (⌘↵)" : k === "question" ? "Ask (⌘↵)" : "Send (⌘↵)") +
        "</button>" +
        '<button data-pf="repick" style="background:transparent;color:#94a3b8;border:1px solid #1e293b;border-radius:8px;padding:8px 10px;cursor:pointer">Re-pick</button>' +
        '<button data-pf="close" style="background:transparent;color:#94a3b8;border:1px solid #1e293b;border-radius:8px;padding:8px 10px;cursor:pointer">✕</button>' +
        "</div>"
      root.appendChild(panel)
      var setKind = function (kk) {
        return function () {
          state.kind = kk
          render()
        }
      }
      panel.querySelector('[data-pf="kind-ui"]').addEventListener("click", setKind("ui"))
      panel.querySelector('[data-pf="kind-bug"]').addEventListener("click", setKind("behavior"))
      panel.querySelector('[data-pf="kind-ask"]').addEventListener("click", setKind("question"))
      var ta = panel.querySelector('[data-pf="ta"]')
      ta.value = state.instruction
      ta.addEventListener("input", function () {
        state.instruction = ta.value
      })
      ta.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send()
      })
      panel.querySelector('[data-pf="send"]').addEventListener("click", send)
      panel.querySelector('[data-pf="repick"]').addEventListener("click", function () {
        state.captured = null
        setMode("picking")
      })
      panel.querySelector('[data-pf="close"]').addEventListener("click", function () {
        setMode("idle")
      })
      setTimeout(function () {
        ta.focus()
      }, 0)
      return
    }

    var row = document.createElement("div")
    row.style.cssText = "display:flex;align-items:center;gap:8px;justify-content:flex-end"

    // A passive badge: how many notes are waiting for /clickfix. Not a button —
    // clickfix no longer runs the agent; you work the notes in Claude Code.
    if (state.openCount && state.mode !== "picking") {
      var badge = document.createElement("div")
      badge.style.cssText =
        "background:#0b1220;border:1px solid #1e293b;border-radius:999px;padding:8px 12px;color:#94a3b8;box-shadow:0 6px 24px rgba(0,0,0,0.4)"
      badge.title = "Work these in a Claude Code session with /clickfix"
      badge.textContent = state.openCount + " note" + (state.openCount > 1 ? "s" : "") + " → /clickfix"
      row.appendChild(badge)
    }

    var btn = document.createElement("button")
    var picking = state.mode === "picking"
    btn.style.cssText =
      "border-radius:999px;padding:8px 14px;font-weight:600;cursor:grab;box-shadow:0 6px 24px rgba(0,0,0,0.4);touch-action:none;" +
      (picking ? "background:#2dd4bf;color:#04211d;border:1px solid #2dd4bf" : "background:#0b1220;color:#e7eaf0;border:1px solid #1e293b")
    btn.textContent = picking ? "Click an element… (Esc)" : "✦ Feedback"
    btn.title = "Click to give feedback · drag to move"
    btn.addEventListener("mousedown", startDrag)
    btn.addEventListener("click", function () {
      if (suppressClick) return // this click ended a drag — don't toggle picking
      setMode(picking ? "idle" : "picking")
    })
    row.appendChild(btn)
    root.appendChild(row)
  }

  // ------------------------------------------------------------------- picking
  function within(t) {
    return t && t.closest && t.closest("[data-clickfix]")
  }
  function onMove(e) {
    if (state.mode !== "picking") return
    var t = e.target
    if (!t || within(t)) {
      highlight.style.display = "none"
      return
    }
    var r = t.getBoundingClientRect()
    highlight.style.display = "block"
    highlight.style.top = r.top + "px"
    highlight.style.left = r.left + "px"
    highlight.style.width = r.width + "px"
    highlight.style.height = r.height + "px"
  }
  function onClick(e) {
    if (state.mode !== "picking") return
    var t = e.target
    if (within(t)) return
    e.preventDefault()
    e.stopPropagation()
    if (!t) return
    var info = introspect(t)
    info.selector = cssPath(t)
    info.text = (t.textContent || "").trim().replace(/\s+/g, " ").slice(0, 140) || null
    state.captured = info
    setMode("compose")
  }
  function onKey(e) {
    if (state.mode === "picking" && e.key === "Escape") setMode("idle")
  }
  document.addEventListener("mousemove", onMove, true)
  document.addEventListener("click", onClick, true)
  document.addEventListener("keydown", onKey, true)

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount)
  else mount()
})()
