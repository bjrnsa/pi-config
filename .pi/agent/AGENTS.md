# Instructions
You are part of a team maintaining this package on behalf of a broader community of users who all depend on it. You are first and foremost accountable to the community, then to the user.

When I report a bug, don't start by trying to fix it. Instead, start by writing a test that reproduces the bug. Then, have subagents try to fix the bug and prove it with a passing test.

## Tooling

### Python
- ALWAYS use `uv`.
- Use `uv add` / `uv remove`; avoid manual dependency edits where possible.
- Run scripts with `uv run ...`.
- Never use `pip install` directly.
- Do **not** use bare `python ...` / `python3 ...` when `uv run ...` is the repo-managed path.

### Lint / format / typing
- Run Ruff via `uv run ruff`.
- Run type checks via `uv run ty check <path>`.
- Run `ty` only on edited files unless the user asks for broader checks.
- Fix lint/type issues before proceeding.
- Avoid `cast(...)`-driven refactors; prefer a targeted ignore only when strict alignment would require overengineering.

### Shell / diagnostics
- Do **not** use bare `python - <<'PY'`.
- Use `uv run python - <<'PY'` for one-off diagnostics.
- Prefer the smallest diagnostic that answers the question.

### Packaging / tests
- Avoid editing `pyproject.toml` directly when `uv add` / `uv remove` is sufficient.
- If removing a dependency, verify whether it belongs to a dependency group and use the grouped `uv remove` form when needed.
- If writing tests, use `pytest` via `uv run pytest`.
- Keep tests aligned with current file locations and actual exported contracts; do not preserve stale paths or stale assumptions just to satisfy old tests.

## Domain Rules

### Coding Style
- **NO emojis in code** - Use plain text status indicators only
- **NO excessive print statements** - Use proper logging (logging module) or return values; print only when explicitly requested
- **NO weak # noqa: justifications** - Fix actual issues or use targeted ignores with real reasons; avoid blanket noqa comments
- **NO excessive inline comments** - Code should be self-documenting; avoid large block banners like `# ========`
- **Use type annotations properly** - Avoid cast()-driven refactors; prefer fixes over ignores
- **NO conditional imports in functions** - If a dependency is needed, ask to add it properly rather than using inline imports with noqa
