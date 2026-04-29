---
name: pandas-temporal
description: >-
  Expert guidance for pandas 3.0+ temporal feature engineering: pd.Grouper,
  resampling, rolling/expanding/EWM windows, time-aware joins, reshaping only
  when useful, and leakage-safe forecasting features. Use when users need fast,
  clean, efficient pandas code for datetime/groupby/window workflows, especially
  reusable feature transformations for larger data pipelines.
---

# Pandas 3.0+ Temporal Feature Engineering

## Objective

Produce the fastest, cleanest, most efficient pandas solution that remains correct and reusable inside a larger feature-engineering pipeline.

Priority order:

1. Correctness and no leakage.
2. Vectorized performance.
3. Minimal clean code.
4. Composable API.
5. Explanation or demo last.

Write importable module-quality code by default. Do not write notebook-style or demo-script code unless the user explicitly asks for a runnable example.

## Output Style Rules

Hard bans:

- No synthetic data generation unless the user explicitly asks for a runnable example.
- No timing or benchmark code unless benchmarking is the main task.
- No `from __future__ import annotations`.
- No `.values`; use `.to_numpy()` when a NumPy array is needed.
- No `__all__`.
- No one-line functions or single-statement function bodies.
- No inline `#` comments.
- No decorative section banners.
- No tutorial comments.
- No print statements in library, transform, or validation functions.
- No row-wise loops, `iterrows`, `itertuples`, list accumulation per row, or `apply(axis=1)` for feature generation.

Docstrings:

- Public transform and validation functions get concise contract docstrings.
- Private helpers usually do not need docstrings.
- Public docstrings should state required grain/index, produced columns, and leakage guarantee when relevant.
- Do not put long tutorials or examples inside code.

Type annotations:

- Annotate public helpers lightly, e.g. `def add_features(df: pd.DataFrame) -> pd.DataFrame:`.
- Avoid excessive pandas internal typing.

Constants:

- Use constants for model-matrix boundaries and reused column groups.
- Do not ceremonialize every one-off column name.

## Pipeline Architecture

A `.pipe()` step should represent a real feature transformation stage:

```python
features = (
    raw
    .pipe(add_calendar_keys)
    .pipe(add_contract_volatility_features)
    .pipe(add_lagged_residual_features)
    .pipe(add_rolling_standardization_features)
)
```

Each feature transform should:

- accept a `pd.DataFrame` as first argument;
- return a `pd.DataFrame`;
- preserve row count, index, and row order unless explicitly aggregating or reshaping;
- add or replace well-named feature columns;
- keep raw and intermediate columns by default;
- avoid side effects, printing, file I/O, and hidden global state.

Use `.pipe()` when it improves composition. Do not force `.pipe()` with trivial wrapper functions. Inline trivial pandas expressions.

Avoid helper functions that only wrap one obvious pandas expression. Do not create functions such as `add_target` when the body is only `return df.assign(...)`, or `select_modeling_columns` when the body is only `return df.loc[:, cols]`. Inline those expressions inside a justified transform or model-boundary block. If a function exists, it must contain enough logic to justify its boundary and must not be a single-statement wrapper.

## Validation and Leakage Audits

Separate feature construction from validation.

Preferred pattern:

```python
def add_lagged_feature(df: pd.DataFrame) -> pd.DataFrame:
    """Add leakage-safe lagged feature while preserving input row grain."""
    ...


def find_lag_leaks(features: pd.DataFrame) -> pd.DataFrame:
    """Return rows whose feature source timestamp violates the cutoff."""
    ...
```

Validation helpers should return booleans or inspectable DataFrames. Pipeline boundaries or tests decide whether to raise. Do not print audits inside transforms.

For leakage-safe temporal features:

- Define target timestamp, feature source timestamp, and cutoff timestamp explicitly.
- Use `shift(1)`, `closed="left"`, `merge_asof(..., allow_exact_matches=False)`, or equivalent logic so row `t` cannot use information from `t` or later.
- Preserve traceability with source timestamp columns when the task involves conditional availability.

## Core Pandas Performance Rules

- Prefer vectorized pandas/NumPy operations over Python loops.
- Prefer `agg`, `transform`, `rolling`, `ewm`, `merge_asof`, `reindex`, masks, and `np.where`/`np.select` before `groupby.apply`.
- Treat `groupby.apply` as last resort. Use only when output shape genuinely differs per group or vectorized methods cannot express the logic.
- Strongly prefer `groupby.transform` or index-aligned rolling results when returning one value per input row.
- Avoid `groupby().agg()` followed by merge-back when `transform` can broadcast directly.
- Avoid unnecessary `pivot`/`unstack`/`stack` cycles. Preserve current grain unless wide matrix layout is genuinely needed.
- Use NumPy for fast array math after pandas alignment is explicit.

Example preferred pattern for per-contract EWM:

```python
sq = df["y_t"].pow(2)
vol_99 = sq.groupby(df["slot"]).transform(
    lambda s: s.ewm(alpha=0.01).mean().shift(1)
)
out = df.assign(contract_var_99=vol_99)
```

Do not use `pivot -> ewm -> shift -> stack -> merge` for this case.

## Modern Pandas 3.0 Temporal Rules

Use modern frequency aliases:

| Old | New |
| --- | --- |
| `M` | `ME` |
| `Y` | `YE` |
| `Q` | `QE` |
| `H` | `h` |
| `T` | `min` |
| `S` | `s` |
| `L` | `ms` |
| `U` | `us` |
| `N` | `ns` |

Use `observed=True` for categorical groupers when only observed combinations are needed.

Use named aggregations:

```python
summary = df.groupby(["region", pd.Grouper(key="date", freq="ME")], observed=True).agg(
    revenue_sum=("revenue", "sum"),
    units_mean=("units", "mean"),
)
```

Use `pd.Grouper` for time buckets:

```python
bucketed = df.groupby(
    ["server_id", pd.Grouper(key="timestamp", freq="15min", origin="start_day", offset="5min")],
    observed=True,
).agg(
    request_count=("latency_ms", "size"),
    latency_mean=("latency_ms", "mean"),
    latency_p95=("latency_ms", lambda s: s.quantile(0.95)),
)
```

Use `resample` directly when datetime is the index and grain changes:

```python
daily = df.resample("D").agg(total=("value", "sum"))
```

Use `on=` for time-based rolling when datetime is a column:

```python
rolled = df.groupby("symbol").rolling("1min", on="timestamp")["price"].mean()
```

Flatten groupby rolling MultiIndex intentionally with `reset_index(level=..., drop=True)` only after confirming alignment.

## Rolling, Expanding, and EWM

Choose window semantics deliberately:

- Time windows (`"7D"`, `"1min"`) when irregular spacing matters.
- Integer windows when observation count matters.
- `min_periods` to control early-row behavior.
- `closed="left"` or `shift(1)` for leakage-safe features.
- `center=True` only for descriptive smoothing, never forecasting features unless future data is allowed.
- `step` only with integer rolling windows.
- Numba rolling functions must use `raw=True` and `engine="numba"`.

EWM parameters: specify exactly one of `span`, `halflife`, `alpha`, or `com`. For forecasting features, apply shift or equivalent exclusion so current row does not enter its own statistic.

## Heuristics for Grouping and Windows

When choosing seasonal grouping and window length, explain briefly outside code or in a public function contract docstring if it is part of the API.

Grouping:

- Diurnal: `(hour, minute)` or time block.
- Weekly: `dayofweek`.
- Annual: `month`, `quarter`, or season.
- Multiple seasonalities: combine only as granular as data volume supports.

Window length:

- Shorter windows react faster but are noisier.
- Longer windows are stable but can lag regime changes.
- Grouped windows need enough observations per bucket.
- For leakage-safe standardization, current row must be excluded.

## Model-Matrix Boundary

Feature steps keep raw/intermediate columns by default. Select final columns once at the modeling boundary:

```python
TARGET_COLUMN = "y_t"
FEATURE_COLUMNS = ["leg_signal_cond", "contract_var_99", "residual_signal_lagged"]

model_matrix = features.loc[:, FEATURE_COLUMNS]
target = features[TARGET_COLUMN]
```

Do not create trivial selection helper functions.

## Decision Tree

Need one output value per input row?
→ Prefer `transform`, index-aligned rolling/EWM, or vectorized assignment.

Need to change grain?
→ Use `groupby(...).agg(...)`, `resample(...).agg(...)`, or reshaping with an explicit grain contract.

Need leakage-safe rolling/window feature?
→ Use `shift(1)` after grouped rolling/EWM or `closed="left"`; validate separately.

Need conditional feature availability?
→ Compute vectorized masks and source timestamps; use `reindex`, `merge_asof`, or `np.where` after alignment.

Need wide reshape?
→ Use only if operation truly needs matrix form; otherwise keep long/current grain.

Need `.pipe()`?
→ Use it for real feature stages, not for narrative steps or trivial one-liners.
