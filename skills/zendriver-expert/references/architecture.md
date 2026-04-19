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

### Browser
File: `zendriver/core/browser.py`

Responsibilities:
- async startup and shutdown
- HTTP discovery against Chrome debug endpoint
- root websocket connection
- target discovery and inventory
- browser-level commands
- cookies
- temp profile cleanup

Startup path:
1. `zendriver.start()` builds `Config`
2. `Browser.create()` deep-copies config and calls `start()`
3. managed mode launches browser process; attach mode skips process spawn
4. package polls `/json/version`
5. creates root `Connection` from `webSocketDebuggerUrl`
6. enables target discovery
7. updates targets

### Connection
File: `zendriver/core/connection.py`

Responsibilities:
- websocket open/close
- command send via `Transaction`
- response correlation by numeric id
- event listener loop
- handler registration and removal
- lazy protocol-domain enablement
- headless and expert prep

Important details:
- generated CDP commands are generators
- `Transaction` calls `next()` to build outbound request, then `.send(result)` to parse inbound response
- `Listener` distinguishes responses by `id` and events by `method`
- `await tab` delegates to idle wait behavior in `Connection.wait()`

### Tab
File: `zendriver/core/tab.py`

`Tab` subclasses `Connection`. It is main page/target automation surface.

Key capabilities:
- navigation and history
- CSS and text search
- iframe-aware querying in key paths
- JS evaluation
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
- stale-node recovery catches “could not find node” protocol errors and retries once
- `expect_request()` / `expect_response()` are passive observers
- `intercept()` is Fetch-domain based and actively pauses traffic

### Element
File: `zendriver/core/element.py`

Responsibilities:
- DOM node metadata and traversal
- click, mouse, drag, keyboard, upload
- JS bound to specific element
- screenshot and overlay helpers
- refresh/update against latest DOM tree

Important details:
- `click()` uses JS click
- `mouse_click()` dispatches low-level input events
- `send_keys()` uses CDP key events from `keys.py`
- `clear_input()` and `clear_input_by_deleting()` intentionally bypass React `_valueTracker` with native prototype setter and `InputEvent`
- `scroll_into_view()` uses CDP DOM helper

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

## Network model

### Passive observation
Files: `zendriver/core/expect.py`, `zendriver/core/tab.py`

- `expect_request(pattern)`
- `expect_response(pattern)`
- `expect_download()`

Behavior:
- URL patterns use regex full-match semantics
- request and response matched through `request_id`
- response body fetched only after `LoadingFinished`

### Active interception
Files: `zendriver/core/intercept.py`, `zendriver/core/tab.py`

- `intercept(url_pattern, request_stage, resource_type)`

Behavior:
- enables Fetch domain with `RequestPattern`
- browser pauses matching traffic
- caller must continue, fail, fulfill, or continue response
- if caller forgets, page stalls

## Cloudflare helper

Files: `zendriver/core/cloudflare.py`, `zendriver/core/tab.py`

Behavior:
- scans DOM and shadow roots for challenge signatures containing `challenges.cloudflare.com`
- locates iframe
- computes click point from box model
- clicks until challenge input disappears or gets value

Constraint:
- heuristic helper, not universal bypass

## Stealth-related behavior

What exists:
- CDP instead of WebDriver
- headless UA patch removes `Headless`
- default launch args reduce browser noise/background behavior
- WebRTC UDP leak mitigation flags
- optional WebGL disable
- custom user-agent/language/platform overrides
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
- `get_all()`
- `set_all()`
- `save()`
- `load()`
- `clear()`

Caution:
- save-side regex filtering may not behave as intended when debugging subset persistence

## Timing and waiting model

This library is often faster than target page JS.

Important primitives:
- `await tab` -> wait for listener idle and refresh target info
- `tab.wait_for(...)` -> poll selector or text
- `tab.wait_for_ready_state(...)` -> poll DOM ready state
- explicit `await asyncio.sleep(...)` still sometimes needed in real sites

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

## Known gotchas

- `Browser.__aexit__()` does not replace explicit `await browser.stop()` safely for all callers.
- `await tab` is core idiom, not syntactic novelty.
- `find(best_match=True)` is heuristic text-length matching.
- `intercept()` is blocking.
- `expect_*` patterns need regex-ready strings.
- `expert=True` changes browser behavior and should not be sold as pure stealth.
