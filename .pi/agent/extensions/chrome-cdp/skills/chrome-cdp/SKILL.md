---
name: chrome-cdp
description: Interact with local Chrome browser session (only on explicit user approval after being asked to inspect, debug, or interact with a page open in Chrome)
---

# Chrome CDP

Lightweight Chrome DevTools Protocol CLI. Connects directly via WebSocket — no Puppeteer, works with 100+ tabs, instant connection.

## Preferred usage in pi

When this extension is loaded, prefer the `chrome_cdp` tool for Chrome inspection and interaction. It already knows how to find and invoke the bundled CDP script, so do not use bash to search for `cdp.mjs` or run `node .../cdp.mjs` directly.

Only fall back to `scripts/cdp.mjs` if the tool is unavailable or the user explicitly asks for the raw CLI.

For accessibility workflows, prefer structured calls like:
- `chrome_cdp` with `action: "snapshot", format: "json"` for structured roles, names, states, and focus
- `chrome_cdp` with `action: "audit_accessibility"` for duplicate names, generic names, unlabeled controls, unlabeled inputs, and missing alt text
- `chrome_cdp` with `action: "type", selector: "...", text: "..."` so typing targets the intended field instead of stale focus

### Context-window guardrails (extension tool)

`chrome_cdp` tool now defaults to context-safe reads:
- `snapshot`/`audit_accessibility` default to `format: "json"`, `scope: "interactive"`
- `includeHidden` and `includeIframes` remain opt-in
- large responses are truncated unless you opt in

Use these params when broad output truly required:
- `allowLargeOutput: true` to disable truncation for call
- `maxOutputChars: <n>` to raise/lower truncation limit when `allowLargeOutput` is false
- `includeStructuredDetails: true` to include full structured payloads in tool `details` (default keeps lightweight metadata only)
- `itemLimit: <n>` to control returned snapshot item count (default 150, clamped)

Each tool response also includes:
- `highCost` telemetry (flags + count for page-wide html, broad snapshots, hidden/iframe expansion)
- `warnings` when risky combinations are requested
- `budget` session counters per target (chars/calls/highCostCalls + threshold crossing)

Additional advanced params:
- `deltaKey` on `snapshot`/`audit_accessibility` for compact diffs vs prior call
- `htmlChunkStart` + `htmlChunkSize` for paged HTML reads
- `budgetWarnChars` to tune cumulative-output warning threshold
## Prerequisites

- Chrome with remote debugging enabled: open `chrome://inspect/#remote-debugging` and toggle the switch
- Node.js 22+ (uses built-in WebSocket)

## Commands

All commands use `scripts/cdp.mjs`. The `<target>` is a **unique** targetId prefix from `list`; copy the full prefix shown in the `list` output (for example `6BE827FA`). The CLI rejects ambiguous prefixes.

### List open pages

```bash
scripts/cdp.mjs list
```

### Take a screenshot

```bash
scripts/cdp.mjs shot <target> [file]    # default: /tmp/screenshot.png
```

Captures the **viewport only**. Scroll first with `eval` if you need content below the fold. Output includes the page's DPR and coordinate conversion hint (see **Coordinates** below).

### Accessibility tree snapshot

```bash
scripts/cdp.mjs snap <target>
```

### Evaluate JavaScript

```bash
scripts/cdp.mjs eval <target> <expr>
```

> **Watch out:** avoid index-based selection (`querySelectorAll(...)[i]`) across multiple `eval` calls when the DOM can change between them (e.g. after clicking Ignore, card indices shift). Collect all data in one `eval` or use stable selectors.

### Other commands

```bash
scripts/cdp.mjs html    <target> [selector]   # full page or element HTML
scripts/cdp.mjs nav     <target> <url>         # navigate and wait for load
scripts/cdp.mjs net     <target>               # resource timing entries
scripts/cdp.mjs click   <target> <selector>    # click element by CSS selector
scripts/cdp.mjs clickxy <target> <x> <y>       # click at CSS pixel coords
scripts/cdp.mjs type    <target> <text>         # Input.insertText at current focus; works in cross-origin iframes unlike eval
scripts/cdp.mjs loadall <target> <selector> [ms]  # click "load more" until gone (default 1500ms between clicks)
scripts/cdp.mjs evalraw <target> <method> [json]  # raw CDP command passthrough
scripts/cdp.mjs stop    [target]               # stop daemon(s)
```

## Coordinates

`shot` saves an image at native resolution: image pixels = CSS pixels × DPR. CDP Input events (`clickxy` etc.) take **CSS pixels**.

```
CSS px = screenshot image px / DPR
```

`shot` prints the DPR for the current page. Typical Retina (DPR=2): divide screenshot coords by 2.

## Tips

- Prefer `snap --compact` over `html` for page structure.
- Use `type` (not eval) to enter text in cross-origin iframes — `click`/`clickxy` to focus first, then `type`.
- Chrome shows an "Allow debugging" modal once per tab on first access. A background daemon keeps the session alive so subsequent commands need no further approval. Daemons auto-exit after 20 minutes of inactivity.
