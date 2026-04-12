# chrome-cdp pi extension

Local pi extension package for Chrome CDP workflows.

Authors: Bjoern Aagaard and OpenAI

This package is intended to live in `~/.pi/agent/extensions/chrome-cdp` so new pi sessions pick it up automatically. It wraps the bundled Chrome CDP skill and exposes interactive slash commands.

## What it provides

- auto-discovered extension entrypoint: `index.ts`
- bundled skill resources under `skills/`
- slash commands for selecting and driving a Chrome tab
- local package metadata so it can later be installed as a package if wanted

## Auto-loading

Pi auto-discovers `~/.pi/agent/extensions/*/index.ts`, so this directory works without `pi install`.

After editing it, use `/reload` in pi or start a new session.

## Slash commands

- `/chrome-tabs` — list and choose a Chrome tab for this session
- `/chrome help`
- `/chrome list`
- `/chrome use <prefix>`
- `/chrome clear`
- `/chrome snap`
- `/chrome shot [file]`
- `/chrome html [selector]`
- `/chrome eval <expr>`
- `/chrome nav <url>`
- `/chrome net`
- `/chrome click <selector>`
- `/chrome clickxy <x> <y>`
- `/chrome type <text>`
- `/chrome loadall <selector> [ms]`
- `/chrome stop [target|all]`

If no tab is selected yet, most `/chrome ...` commands open a picker automatically.

## Tool guardrails

`chrome_cdp` tool keeps full capability but uses safer defaults to reduce context blowups:
- snapshot/audit default to `format: "json"` + `scope: "interactive"`
- large outputs truncated by default
- opt in to full large payloads with `allowLargeOutput: true`
- tune truncation with `maxOutputChars`
- include full structured payloads in tool `details` only when needed: `includeStructuredDetails: true`
- tune snapshot payload density with `itemLimit` (default 150, bounded)
- tool `details` include `highCost` telemetry + `warnings` when high-cost combinations detected
- request diff-only structured updates with `deltaKey` on snapshot/audit calls
- page HTML safely with `htmlChunkStart` + `htmlChunkSize`
- monitor cumulative per-target output in `details.budget` and tune warning threshold via `budgetWarnChars`

## Prerequisites

- Chrome remote debugging enabled at `chrome://inspect/#remote-debugging`
- Node.js 22+

## Implementation layout

- `index.ts` is the auto-discovered extension entrypoint and contains the slash command implementation
- `skills/chrome-cdp/SKILL.md` is the bundled skill text
- `skills/chrome-cdp/scripts/cdp.mjs` is the raw CDP CLI

## Upstream basis

This local package is derived from the upstream `chrome-cdp-skill` work and repackaged for frictionless pi auto-loading.
