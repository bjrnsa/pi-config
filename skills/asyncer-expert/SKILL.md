---
name: asyncer-expert
description: >
  Expert guidance for working with Asyncer, the sync/async bridge library
  by tiangolo. Use this skill whenever the user mentions asyncer, needs to
  call sync code from async code, call async code from sync code, run async
  functions concurrently with typed return values, or is dealing with
  blocking I/O inside async event loops. Also use when the user asks about
  AnyIO-based threading, worker threads, event loop blocking, or typed
  wrappers for sync/async interop in Python. Trigger even if the user only
  mentions mixing sync and async code, blocking functions in FastAPI, or
  running blocking database calls from async endpoints.
---

# Asyncer Expert

Asyncer is a micro-library (~400 lines) by Sebastián Ramírez built on AnyIO.
It provides four typed utility functions for sync/async interop, designed
primarily for **developer experience**: autocompletion, inline errors, and
mypy compatibility.

**Source code**: `asyncer/_main.py` (all logic), `asyncer/_compat.py` (AnyIO
version shim), `asyncer/__init__.py` (exports).

**Docs**: https://asyncer.tiangolo.com

## The Four Functions

### `asyncify(function)` — Call Sync from Async

Takes a blocking/sync function, returns an async callable that runs it in a
worker thread via `anyio.to_thread.run_sync()`.

Use when:
- You have a blocking library (database driver, file I/O, CPU-bound code) inside
  async code
- You're inside a FastAPI endpoint or any async event loop and need to call
  something that does not `await`

Key args:
- `abandon_on_cancel=True` — if the awaiting task is cancelled, the thread keeps
  running but its result is discarded
- `limiter` — pass an `anyio.CapacityLimiter` to cap total worker threads

**Pattern**:
```python
from asyncer import asyncify

result = await asyncify(some_blocking_func)(arg1, arg2=3)
```

The wrapper preserves the original function's signature through `ParamSpec`, so
editors autocomplete `arg1` and `arg2=3` and know the return type.

Deprecated arg: `cancellable` (pre-AnyIO 4.1.0). Use `abandon_on_cancel`.

---

### `syncify(async_function, raise_sync_error=True)` — Call Async from Sync

Takes an async function, returns a blocking callable that runs it in the main
async loop from a worker thread via `anyio.from_thread.run()`.

Use when:
- You're in a worker thread (e.g. code called via `asyncify()`) and need to call
  an async function
- You need async code inside a legacy sync codebase

With `raise_sync_error=True` (default), calling outside a worker thread raises
an error. Set `raise_sync_error=False` to fall back to `anyio.run()` instead.
This is useful during migrations where the same code may be called from both
async and sync contexts. **Warning**: calling `anyio.run()` repeatedly in a loop
is expensive — wrap the loop in a single async function and call that once.

**Pattern**:
```python
from asyncer import syncify

result = syncify(some_async_func)(arg1, arg2=3)
```

---

### `runnify(async_function, backend="asyncio")` — Run Async from Top-Level Sync

Takes an async function, returns a blocking callable that starts an event loop
and runs it via `anyio.run()`.

Use when:
- Your `main()` is sync but your program logic is async
- You want to pass arguments to the async main function from a sync entrypoint
  while keeping full type safety

**Pattern**:
```python
from asyncer import runnify

result = runnify(async_main)(name="World")
```

This is essentially `anyio.run(async_main, name="World")` with preserved typing.

---

### `create_task_group()` + `task_group.soonify()` — Concurrent Async with Typed Returns

`asyncer.create_task_group()` returns an extended AnyIO `TaskGroup` with a
`soonify()` method. `soonify()` takes an async function and returns a callable
that, when invoked with the function's arguments, schedules the task and returns a
`SoonValue[T]` immediately.

Use when:
- You need to run multiple async functions concurrently and collect typed return
  values after they all finish
- You want structured concurrency (all tasks finish before the `async with` block
  exits)

**Pattern**:
```python
from asyncer import create_task_group

async with create_task_group() as tg:
    result1 = tg.soonify(fetch_user)(user_id=1)
    result2 = tg.soonify(fetch_user)(user_id=2)

# After the block, values are populated:
print(result1.value)  # typed as User
print(result2.value)  # typed as User
```

**Important**: accessing `.value` inside the `async with` block raises
`PendingValueException` unless the task already finished (check `.ready`). If you
need to consume results inside the same block, use AnyIO Streams instead —
Asyncer does not support that pattern.

---

## Decision Tree

| Situation | Use |
|-----------|-----|
| Blocking code inside async loop | `asyncify()` |
| Async code inside worker thread | `syncify()` |
| Async code inside legacy sync main | `runnify()` or `syncify(raise_sync_error=False)` |
| Run many async tasks concurrently, get typed results | `create_task_group()` + `soonify()` |
| Need streaming/consuming results inside the same block | **Not Asyncer** — use AnyIO Streams |

---

## Common Pitfalls

1. **Blocking the event loop without `asyncify()`** — calling a sync function that
   sleeps or does I/O directly from async code freezes all concurrent tasks.
2. **Accessing `SoonValue.value` too early** — always access after the `async with`
   block, or guard with `.ready`.
3. **`syncify()` in a loop from sync main** — `raise_sync_error=False` starts a new
   event loop per call. Wrap the loop in an async function and call it once.
4. **Forgetting AnyIO dependency** — Asyncer is a thin wrapper. Understanding
   AnyIO's `CapacityLimiter`, `TaskGroup`, and cancellation semantics helps.

---

## Architecture Notes

- `asyncer/_main.py` contains `PendingType`, `PendingValueException`,
  `SoonValue[T]`, `TaskGroup`, and the four functions.
- `get_asynclib()` in `_main.py` introspects AnyIO backends to construct the
  extended `TaskGroup` — this is an internal compatibility detail.
- `asyncer/_compat.py` smooths over AnyIO API changes (e.g.
  `cancellable` → `abandon_on_cancel` in 4.1.0).
- Python 3.10+ required. Supports asyncio and trio backends.
- The library is intentionally small and opinionated. It does not replace AnyIO —
  it gives typed, ergonomic wrappers over a subset of it.
