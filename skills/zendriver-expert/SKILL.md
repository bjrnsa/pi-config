---
name: zendriver-expert
description: >-
  Expert guidance for working with Zendriver, Chrome DevTools Protocol (CDP)
  browser automation, and this repository's Browser/Tab/Element architecture.
  Use this skill whenever the user mentions zendriver, CDP automation,
  headless Chrome, anti-bot scraping, browser tabs/pages/elements, request or
  response expectations, Fetch interception, cookie/profile management,
  downloads, Cloudflare challenge handling, or keyboard input automation in this
  package. Also use it when the user asks to debug, explain, extend, or fix code
  in this repository, when they compare Zendriver to Selenium or Playwright,
  when they need help writing tests for browser automation, or when a request is
  framed generically as browser automation but the work clearly belongs in
  Zendriver. If the current project is the zendriver repo or code that imports
  zendriver, this skill should be consulted.
---

# Zendriver Expert

Use this skill for work on `zendriver` package itself or for code that relies on its repo-specific behavior.

## Purpose

Help Claude work effectively in this repository by using Zendriver's real architecture, not generic Selenium or Playwright assumptions.

This skill should produce:
- accurate architectural explanations
- targeted bug fixes grounded in CDP behavior
- correct use of `Browser`, `Tab`, `Element`, and raw `cdp.*`
- realistic guidance about stealth, headless mode, downloads, interception, and profiles

## Platform

This skill runs in Pi / Claude Code when current project is `zendriver`.

Target package platform:
- Python `>=3.10`
- Chromium-family browsers, especially Chrome and Brave
- Chrome DevTools Protocol, not WebDriver
- local development on macOS, Linux, or Windows
- Docker workflows mainly Linux-centric when real browser stack is needed

## Required functionality

When using this skill, do all of following:

1. Model package correctly.
   - `Config` shapes browser launch and attach mode.
   - `Browser` owns process, root connection, targets, cookies, and cleanup.
   - `Connection` owns websocket transport, transactions, listener loop, and event dispatch.
   - `Tab` is target-specific automation API built on `Connection`.
   - `Element` wraps DOM nodes and exposes interaction helpers.
   - generated `zendriver.cdp.*` is raw protocol escape hatch.

2. Prefer repo-native solutions.
   - If high-level helper exists in `Tab` or `Element`, use or fix that first.
   - If helper does not exist, drop to raw `await tab.send(cdp.domain.command(...))` instead of inventing fake abstractions.

3. Respect package workflow.
   - For bugs: write reproduction test first, then fix.
   - Use `uv run pytest` for tests.
   - Use targeted tests first, then broader tests if needed.
   - Keep async semantics intact.

4. Preserve core design assumptions.
   - CDP-first, Chromium-specific.
   - async websocket event loop.
   - DOM snapshot plus wrapper model, with stale-node recovery.
   - network expectations are passive; Fetch interception is active and blocking.

5. Give users honest guidance.
   - Say when Zendriver is better than Selenium/WebDriver.
   - Say when Playwright-style locators or cross-browser support are stronger elsewhere.
   - Treat stealth as partial and practical, not magical.

## Fast mental model

Think in this order:

1. `zendriver.start()` -> build `Config`
2. `Browser.create()` -> launch or attach browser
3. HTTP `json/version` discovery -> get websocket URL
4. root `Connection` -> enable target discovery
5. `Browser.get()` / `Tab.get()` -> navigate target
6. `Tab` helpers -> DOM, runtime, page, browser, input, network, fetch commands
7. `Element` helpers -> node-scoped interaction built on DOM/runtime/input

If you need more detail, read `references/architecture.md`.

## Standard operating procedure

### When explaining repository

Cover these in order:
- what package provides
- why CDP instead of WebDriver
- `Browser` / `Tab` / `Element` split
- generated `cdp` role
- request flow and event flow
- key strengths, limitations, and gotchas

### When fixing or adding behavior

1. Find narrowest existing test file or add one.
2. Trace from public API to CDP call.
3. Confirm whether behavior belongs in:
   - `browser.py`
   - `tab.py`
   - `element.py`
   - `expect.py`
   - `intercept.py`
   - `connection.py`
   - `keys.py`
4. Prefer minimal patch over abstraction sprawl.
5. Run targeted tests.

### When debugging network features

Distinguish these clearly:
- `expect_request()` / `expect_response()` -> passive observers using Network events
- `intercept()` -> active pause using Fetch domain
- `expect_download()` -> browser download event helper
- `download_file()` -> JS fetch/blob/anchor helper, different semantics

### When debugging stealth or anti-bot issues

Check, in order:
- headless vs headful
- custom `user_data_dir`
- UA override behavior
- WebRTC / WebGL flags
- timing issues (`await tab`, waits, ready state)
- whether user actually needs raw CDP or site-specific JS
- whether `expert=True` is being misused as stealth instead of debug aid

### When debugging input/keyboard issues

Read `zendriver/core/keys.py` first. Key concepts:
- `KeyEvents.from_text(text, ascii_keypress)` converts plain text to CDP payloads
- `KeyEvents.from_mixed_input(sequence, ascii_keypress)` handles text, special keys, and modifier combos
- `SpecialKeys` covers arrows, enter, escape, delete, backspace, tab, space
- `KeyModifiers` uses bitwise OR for Ctrl/Alt/Shift/Meta combinations
- `Element.send_keys()` routes through `KeyEvents.from_text(..., KeyPressEvent.DOWN_AND_UP)` by default
- emoji and non-ASCII characters use `KeyPressEvent.CHAR` path automatically

## Important constraints and gotchas

- Chromium-only mindset. Do not promise cross-browser parity.
- `await tab` matters. It means wait for listener idle (0.10s production / 0.75s interactive) and refresh target info. Not a no-op.
- `find()` is text-search based and can match scripts/meta/noisy nodes.
- `find(best_match=True)` uses text-length heuristic, not semantic understanding.
- `expect_*` URL matching uses regex full-match behavior. Use regex-ready patterns.
- `intercept()` pauses browser traffic until caller continues, fails, fulfills, or continues response.
- `Browser.__aexit__()` does not reliably replace explicit `await browser.stop()` for callers.
- `expert=True` changes browser behavior by forcing future shadow roots open and relaxing web security/site isolation. It is a **debug aid, not a stealth feature**. Explicitly warn users who confuse the two.
- headless prep removes `Headless` from UA, but full fingerprint surface is much larger.
- default temp profiles are cleaned up; custom `user_data_dir` is not.
- cookie save/load exists, but save-side pattern filtering deserves caution when debugging cookie subset behavior.
- On Windows, `asyncio.WindowsSelectorEventLoopPolicy()` is required for correct asyncio behavior. Set it before creating event loop.
- `Element.clear_input()` and `clear_input_by_deleting()` bypass React `_valueTracker` via native prototype setters. This is intentional and necessary for modern frameworks.
- Do not hand-edit files in `zendriver/cdp/`. They are auto-generated by PyCDP. Read `references/cdp-generated.md`.
- `evaluate()` changed significantly around serialization. Use `return_by_value=True` for primitives; `return_by_value=False` triggers deep serialization via `SerializationOptions`. Falsy values were historically mishandled before v0.14.2.
- `ContraDict` (`zendriver/core/_contradict.py`) provides attribute-style access on Config and Element attrs. Explains why `browser.info.webSocketDebuggerUrl` works with snake_case.

## File map

Read these first for most work:
- `zendriver/core/config.py`
- `zendriver/core/browser.py`
- `zendriver/core/connection.py`
- `zendriver/core/tab.py`
- `zendriver/core/element.py`

Read these when relevant:
- `zendriver/core/keys.py` — keyboard input, modifiers, special keys, text-to-CDP conversion
- `zendriver/core/expect.py` — passive network request/response/download expectations
- `zendriver/core/intercept.py` — active Fetch-domain interception
- `zendriver/core/cloudflare.py` — Cloudflare Turnstile checkbox challenge helper
- `zendriver/core/util.py` — helpers, target comparison, CDP module lookup
- `zendriver/core/_contradict.py` — `ContraDict` attribute accessor
- `zendriver/cdp/README.md` — generated code notice
- `tests/conftest.py` — test fixtures and `CreateBrowser` context manager

## Guidance by task type

### Add or fix page interaction
Start in `tab.py` or `element.py`.
Check whether DOM, Runtime, or Input domain is correct primitive.
Preserve stale-node recovery and iframe/shadow behavior.
For keyboard issues, start in `keys.py` before touching `element.py`.

### Add or fix browser lifecycle
Start in `browser.py`, then `config.py`, then `connection.py`.
Check launch args, attach mode, cleanup, and target discovery.

### Add or fix request waiting or interception
Start in `expect.py` or `intercept.py`, then trace into `connection.py` and `tab.py`.
Be explicit about passive versus blocking behavior.

### Add or fix keyboard/input behavior
Start in `keys.py`, then `element.py`.
Preserve grapheme/emoji handling, modifier decomposition, and shift-variant mapping.

### Explain performance or timing behavior
Explain websocket listener idle model, target refresh, retry loops, and why package can outrun page JS.
See `references/architecture.md` for listener idle mechanics.

### Explain capabilities to users
Frame Zendriver as:
- stronger than plain HTTP scraping for JS-heavy sites
- often better stealth posture than WebDriver stacks
- weaker than cross-browser tools for standards portability
- less ergonomic than Playwright for locator/actionability UX
- supports real GPU-accelerated browser in Docker containers (see `cdpdriver/zendriver-docker` companion project)

## Output expectations

When user asks for design or architecture, structure answer like this:
- Overview
- Core components
- Feature-by-feature behavior
- Underlying mechanisms
- Benefits
- Limitations
- Recommended use cases

When user asks for code changes, structure answer like this:
- Problem
- Root cause
- Files changed
- Tests added or updated
- Remaining caveats

## References

Read `references/architecture.md` when user needs deep architectural detail.
Read `references/anti-patterns.md` when user is struggling with common mistakes, deprecation migrations, or React input issues.
Read `references/testing.md` when user needs to write or fix tests in this repo.
Read `references/cdp-generated.md` when user wants to modify or understand the `zendriver/cdp/` package.
