# Zendriver architecture reference

Use this reference when task needs deeper repo-specific detail than `SKILL.md` provides.

## What package is

Zendriver is async browser automation and scraping library for Chromium-family browsers. It talks to Chrome DevTools Protocol directly, not WebDriver. Public API is thin over CDP and keeps raw protocol available.

Main exported objects:
- `Browser`
- `Tab`
- `Element`
- `Config`
- `Connection`
- `cdp`
- `start`

## Core stack

### Config
File: `zendriver/core/config.py`

Responsibilities:
- browser executable discovery (`chrome`, `brave`, or auto)
- temp or persistent profile directory
- launch arguments
- headless mode
- sandbox handling
- attach mode via `host` and `port`
- user agent, language, WebRTC, WebGL, expert mode

Important details:
- temp user data dir created lazily
- root on posix auto-disables sandbox
- remote debugging host and port added at launch
- expert mode adds `--disable-web-security` and `--disable-site-isolation-trials`
- `user_data_dir` can be reused as a template; each `Browser.create()` deep-copies config and lazily generates a temp dir only when needed

### Browser
File: `zendriver/core/browser.py`

Responsibilities:
- async startup and shutdown
- HTTP discovery against Chrome debug endpoint
- root websocket connection
- target discovery and inventory
- browser-level commands
- cookies (`CookieJar`)
- temp profile cleanup

Startup path:
1. `zendriver.start()` builds `Config`
2. `Browser.create()` deep-copies config and calls `start()`
3. managed mode launches browser process; attach mode skips process spawn
4. package polls `/json/version`
5. creates root `Connection` from `webSocketDebuggerUrl`
6. enables target discovery (`set_discover_targets`)
7. updates targets

Shutdown path:
- sends `cdp.browser.close()` if connection alive
- closes websocket connection
- terminates process gracefully, then kills if needed
- cleans temp profile via `_cleanup_temporary_profile()` unless custom dir

### Connection
File: `zendriver/core/connection.py`

Responsibilities:
- websocket open/close via `websockets`
- command send via `Transaction`
- response correlation by numeric id
- event listener loop (`Listener`)
- handler registration and removal
- lazy protocol-domain enablement
- headless and expert prep

Important details:
- generated CDP commands are generators. `Transaction` calls `next()` to build outbound request JSON, then `.send(result)` to parse inbound response
- `Listener` distinguishes responses by `id` and events by `method`
- `await tab` delegates to `Connection.wait()`, which waits for `listener.idle` Event
- `Listener` sets `idle` when no websocket message arrives for `time_before_considered_idle` seconds (0.10s in production scripts, 0.75s in interactive/REPL)
- domain auto-enablement: when handlers are registered, `Connection._register_handlers()` sends `domain.enable()` for each needed domain
- domains are tracked in `enabled_domains` (auto) and `manually_enabled_domains` (user explicit)
- `feed_cdp()` is sync helper for unblocking `Fetch` paused requests without awaiting

### Tab
File: `zendriver/core/tab.py`

`Tab` subclasses `Connection`. It is main page/target automation surface.

Key capabilities:
- navigation and history
- CSS and text search
- iframe-aware querying in key paths
- JS evaluation with serialization options
- screenshots, snapshot, PDF
- page scrolling
- window management
- network expectation and interception helpers
- local storage helpers
- user-agent override
- Cloudflare helper wrapper

Important details:
- `wait_for()` polls selector or text
- `wait_for_ready_state()` polls `document.readyState`
- `select` / `find` methods are also wait primitives
- stale-node recovery catches "could not find node" protocol errors and retries once with refreshed document
- `expect_request()` / `expect_response()` are passive observers that use `asyncio.Future` matched by `request_id`
- `intercept()` is Fetch-domain based and actively pauses traffic
- `evaluate()` supports both `return_by_value=True` (primitives) and `return_by_value=False` (deep serialization via `SerializationOptions`)
- `js_dumps()` recursively serializes JS objects with two fallback strategies

### Element
File: `zendriver/core/element.py`

Responsibilities:
- DOM node metadata and traversal
- click, mouse, drag, keyboard, upload
- JS bound to specific element
- screenshot and overlay helpers
- refresh/update against latest DOM tree

Important details:
- `click()` uses JS click via `runtime.call_function_on`
- `mouse_click()` dispatches low-level `input_.dispatch_mouse_event` events
- `send_keys()` uses CDP key events from `keys.py`
- `clear_input()` and `clear_input_by_deleting()` intentionally bypass React `_valueTracker` with native prototype setter and `InputEvent`
- `scroll_into_view()` uses CDP DOM helper
- `Element.__getattr__` is deprecated in favor of `Element.get(name)`

### Keys / Input
File: `zendriver/core/keys.py`

Responsibilities:
- convert text strings to CDP `input_.dispatch_key_event` payloads
- handle ASCII characters, special keys, modifiers, emoji, and grapheme clusters
- support mixed input sequences (text + special keys + modifier combos)

Key classes:
- `KeyEvents` — main conversion API with `from_text()` and `from_mixed_input()` class methods
- `SpecialKeys` — enum for enter, tab, space, arrows, escape, delete, backspace
- `KeyModifiers` — bitwise-OR flags for Alt, Ctrl, Meta, Shift
- `KeyPressEvent` — event type enum: `CHAR` (direct ASCII send), `DOWN_AND_UP` (full key sequence)

Important details:
- `from_text()` iterates grapheme clusters via `grapheme.graphemes(text)`; emoji triggers `CHAR` path
- shift variants of special chars and uppercase letters are automatically handled by `_normalise_key()`
- modifier decomposition produces full down/up sequences: modifier downs, main key, modifier ups
- `Element.send_keys()` internally calls `KeyEvents.from_text(text, KeyPressEvent.DOWN_AND_UP)`

## Generated CDP package

Dir: `zendriver/cdp`

Role:
- typed schema for domains, commands, events, and results
- raw escape hatch when wrapper API insufficient
- command generator pattern keeps transport generic

Useful domains:
- `page`
- `runtime`
- `dom`
- `network`
- `fetch`
- `target`
- `browser`
- `input_`
- `storage`

Policy: do not hand-edit. Read `references/cdp-generated.md`.

## ContraDict

File: `zendriver/core/_contradict.py`

`ContraDict` provides attribute-style access on dict-like data. Used by:
- `Browser.info` — holds CDP `json/version` response; `browser.info.webSocketDebuggerUrl` works because ContraDict maps snake_case to attribute access
- `Element.attrs` — maps HTML attribute names to Python attributes (e.g., `elem.attrs.href`)

Behavior: if key exists in underlying dict, attribute access returns it; otherwise falls through. This is why camelCase CDP keys are accessible as snake_case attributes in many contexts.

## Network model

### Passive observation
Files: `zendriver/core/expect.py`, `zendriver/core/tab.py`

- `expect_request(pattern)`
- `expect_response(pattern)`
- `expect_download()`

Behavior:
- URL patterns use regex full-match semantics
- request and response matched through `request_id`
- `response_body` fetched only after `LoadingFinished` event arrives for that `request_id`
- uses context manager pattern with `__aenter__`/`__aexit__` to register/unregister handlers

### Active interception
Files: `zendriver/core/intercept.py`, `zendriver/core/tab.py`

- `intercept(url_pattern, request_stage, resource_type)`

Behavior:
- enables Fetch domain with `RequestPattern`
- browser pauses matching traffic at specified stage
- caller must `continue_request()`, `fail_request()`, `fulfill_request()`, or `continue_response()`
- if caller forgets, page stalls indefinitely
- uses context manager pattern for setup/teardown
- `reset()` allows reuse without full teardown

## Cloudflare helper

Files: `zendriver/core/cloudflare.py`, `zendriver/core/tab.py`

Behavior:
- scans DOM and shadow roots for challenge signatures containing `challenges.cloudflare.com`
- locates iframe inside shadow DOM
- computes click point from box model (`dom.get_box_model`)
- clicks until challenge input disappears or gets value
- `verify_cf()` is the main entry point

Constraint:
- heuristic helper for Turnstile/checkbox challenges only
- does not handle managed challenges, rate-limited IPs, or non-Cloudflare WAFs
- relies on challenge iframe being visible (not `display: none`)

## Stealth-related behavior

What exists:
- CDP instead of WebDriver (no `navigator.webdriver` flag)
- headless UA patch removes `Headless` from `navigator.userAgent`
- default launch args reduce browser noise/background behavior
- WebRTC UDP leak mitigation flags (`--webrtc-ip-handling-policy=disable_non_proxied_udp`)
- optional WebGL disable
- custom user-agent/language/platform overrides via `tab.set_user_agent()`
- expert mode forces future shadow roots open

What not to overclaim:
- package does not rewrite whole fingerprint surface
- anti-bot detection remains broader than UA and WebRTC
- expert mode is more debugging/control than stealth

## Profile and cookie model

### Profiles
- default temp profile dir
- cleaned on explicit `browser.stop()` for managed temp profiles
- custom `user_data_dir` disables cleanup

### Cookies
File: `zendriver/core/browser.py` (`CookieJar`)

Methods:
- `get_all()` — returns `cdp.network.Cookie` list or `requests`-compatible jar
- `set_all()` — takes list of `cdp.network.CookieParam`
- `save()` — pickles to file with optional regex pattern filter
- `load()` — unpickles from file with optional regex pattern filter
- `clear()` — removes all cookies

Caution:
- save-side regex filtering may not behave as intended when debugging subset persistence
- v0.15.3 fixed crash when `sameParty` field is missing in cookie JSON from newer Chrome versions

## Timing and waiting model

This library is often faster than target page JS.

Important primitives:
- `await tab` -> wait for listener idle (no CDP events for idle window) and refresh target info
- `tab.wait_for(...)` -> poll selector or text with timeout
- `tab.wait_for_ready_state(...)` -> poll DOM ready state
- `tab.sleep(t)` -> unconditional `asyncio.sleep(t)` plus target refresh
- explicit `await asyncio.sleep(...)` still sometimes needed in real sites

Listener idle mechanics:
- `Listener` is an `asyncio.Task` that loops `websocket.recv()`
- after each message, `idle` Event is cleared
- if `recv()` times out (no message for idle window), `idle` Event is set
- `Connection.wait()` awaits `listener.idle.wait()`
- in interactive mode (REPL), idle window is 0.75s to avoid premature returns
- in production scripts, idle window is 0.10s

## Evaluate and serialization

`Tab.evaluate(expression, ...)` behavior:
- `return_by_value=True` (default): result returned as `remote_object.value`. Best for primitives, arrays, and simple objects.
- `return_by_value=False`: enables deep serialization via `SerializationOptions` with `max_depth=10`, `includeShadowTree="all"`. Returns `DeepSerializedValue`.
- Falsy values (`0`, `False`, `""`, `[]`, `{}`) were historically returned as `None` before v0.14.2 due to incorrect truthiness check.
- Complex objects may exceed serialization depth; use `js_dumps()` as fallback.

## Docker / container deployment

Zendriver supports running real (non-headless) GPU-accelerated Chrome in Docker containers. Companion project: `cdpdriver/zendriver-docker`.

Key points:
- Linux-only due to GPU passthrough requirements
- uses xvfb or real display for headful mode in container
- useful when anti-bot checks require real window compositor
- not the default path; most users run headless locally

## Use-case guidance

### Strong fit
- JS-heavy sites
- browser-session-aware scraping
- anti-WebDriver-sensitive flows
- raw CDP customization
- network response extraction and interception
- debugging modern frontend behavior

### Weak fit
- cross-browser abstraction
- highly opinionated test ergonomics like Playwright locators/actionability
- cheap static HTML crawling
- promises of guaranteed anti-bot bypass
