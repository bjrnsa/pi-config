# Testing in the Zendriver repository

Use this reference when writing, debugging, or fixing tests.

## Test runner

Always use:

```bash
uv run pytest
```

Do not use bare `pytest` — the project manages dependencies and Python version via `uv`.

## Key configuration

File: `pyproject.toml`

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
log_level = "INFO"
```

All tests are async by default. Do not manually add `@pytest.mark.asyncio`.

## Test fixtures

File: `tests/conftest.py`

### `create_browser` fixture

Returns the `CreateBrowser` class (not an instance). Usage:

```python
async def test_something(browser: zd.Browser) -> None:
    tab = browser.main_tab
    assert tab is not None
    ...
```

Wait — the fixture above shows `browser` being injected directly. Actually, `tests/conftest.py` provides a `create_browser` fixture that returns the `CreateBrowser` class. Tests usually use it like this:

```python
async def test_something(create_browser: type[CreateBrowser]) -> None:
    async with create_browser(headless=True, sandbox=False) as browser:
        tab = await browser.get("https://example.com")
        ...
```

But many test files import a `browser` fixture pattern. Check the actual test file imports.

### `headless` fixture

Parametrized fixture. By default runs each test twice: once headless, once headful.

Controlled by environment variable:
- `ZENDRIVER_TEST_BROWSERS=headless` — headless only
- `ZENDRIVER_TEST_BROWSERS=headful` — headful only
- `ZENDRIVER_TEST_BROWSERS=all` — both (default)

### `CreateBrowser` context manager

```python
class CreateBrowser(AbstractAsyncContextManager):
    def __init__(
        self,
        *,
        headless: bool = True,
        sandbox: bool = TestConfig.SANDBOX,  # from ZENDRIVER_TEST_SANDBOX env var
        browser_args: list[str] | None = None,
        browser_connection_max_tries: int = 15,
        browser_connection_timeout: float = 3.0,
    )
```

Behavior:
- builds a `zd.Config` with given options
- on `__aenter__`: calls `zd.start(config)`, waits for startup, asserts process PID > 0
- on `__aexit__`: calls `browser.stop()`, asserts process PID is None

Use this for reliable browser lifecycle in tests.

### Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `ZENDRIVER_TEST_BROWSERS` | `all` | Which browser modes to test |
| `ZENDRIVER_PAUSE_AFTER_TEST` | `false` | If `true`, pauses after each test for manual inspection |
| `ZENDRIVER_TEST_SANDBOX` | `false` | Whether to enable sandbox in tests |
| `WAYLAND_DISPLAY` | auto-detected | If set and headful, adds Wayland backend args |

### Windows policy in tests

`tests/conftest.py` sets `asyncio.WindowsSelectorEventLoopPolicy()` automatically when `sys.platform == "win32"`. Production scripts must do this themselves.

## Sample data fixtures

Dir: `tests/sample_data/`

Contains static HTML files used by tests:
- `groceries.html` — used for `find()`, `select()`, `xpath()` tests
- Other HTML fixtures as needed

Tests reference them via `sample_file("filename.html")` helper imported from `tests.sample_data`.

## Writing a new test

Pattern:

```python
import pytest
import zendriver as zd
from tests.sample_data import sample_file

async def test_my_feature(browser: zd.Browser) -> None:
    tab = await browser.get(sample_file("my_fixture.html"))
    result = await tab.find("target text")
    assert result is not None
    assert result.tag == "div"
```

Or with explicit context manager:

```python
from tests.conftest import CreateBrowser

async def test_my_feature(create_browser: type[CreateBrowser]) -> None:
    async with create_browser(headless=True, sandbox=False) as browser:
        tab = await browser.get("https://example.com")
        ...
```

## Test categories

| Directory | Contents |
|-----------|----------|
| `tests/core/` | Unit and integration tests for core modules |
| `tests/core/test_tab.py` | Tab behavior: navigation, find, select, evaluate, screenshots |
| `tests/core/test_browser.py` | Browser lifecycle, cookies, targets |
| `tests/core/test_keyinputs.py` | Keyboard input system |
| `tests/core/test_react_controlled_input.py` | React input clearing behavior |
| `tests/core/test_multiple_browsers.py` | Multi-browser scenarios |
| `tests/bot_detection/` | Anti-bot and detection tests |
| `tests/docs/tutorials/` | Tutorial code verification |

## Debugging a failing test

1. Check `ZENDRIVER_TEST_BROWSERS` — headful tests need a display
2. Check sandbox — CI often needs `sandbox=False`
3. Increase `browser_connection_timeout` if browser startup is slow
4. Use `ZENDRIVER_PAUSE_AFTER_TEST=true` to inspect browser state
5. Check for zombie Chrome processes from previous runs
