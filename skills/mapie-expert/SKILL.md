---
name: mapie-expert
description: >
  Expert guidance for working with MAPIE (Model Agnostic Prediction Interval Estimator),
  the Python library for conformal prediction and uncertainty quantification.
  Use this skill whenever the user mentions MAPIE, conformal prediction,
  prediction intervals, prediction sets, uncertainty quantification, risk control,
  conformalized quantile regression, or any MAPIE class or function.
  Also use when the user asks about calibrating model uncertainty, constructing
  valid prediction intervals with sklearn models, or conformal classification.
  Trigger even for vague requests like "make my model give confidence intervals"
  or "quantify prediction uncertainty" when the context implies Python and sklearn.
  This skill covers both the modern v1 API and the legacy v0 API, steering users
  toward best-practice patterns and away from inefficient or incorrect usage.
compatibility: Python 3.9+, scikit-learn compatible
---

# MAPIE Expert

MAPIE provides distribution-free uncertainty quantification for regression and
classification via conformal prediction. It is fully compatible with any
scikit-learn estimator.

## API Versions

MAPIE has two API layers. **Always guide users to the v1 API** unless they
explicitly mention legacy code.

### v1 API (Current, Recommended)

Clean, explicit workflow with separate `fit`, `conformalize`, and `predict`
steps. Uses `confidence_level` (not `alpha`).

| Task | Primary Class | Module |
|------|-------------|--------|
| Regression, split conformal | `SplitConformalRegressor` | `mapie.regression` |
| Regression, cross conformal | `CrossConformalRegressor` | `mapie.regression` |
| Regression, jackknife+ bootstrap | `JackknifeAfterBootstrapRegressor` | `mapie.regression` |
| Regression, quantile conformal | `ConformalizedQuantileRegressor` | `mapie.regression` |
| Regression, time series | `TimeSeriesRegressor` | `mapie.regression` |
| Classification, split conformal | `SplitConformalClassifier` | `mapie.classification` |
| Multi-label risk control | `MultiLabelClassificationController` | `mapie.risk_control` |
| Binary risk control | `BinaryClassificationController` | `mapie.risk_control` |
| Semantic segmentation | `SemanticSegmentationController` | `mapie.risk_control` |
| Calibration | `TopLabelCalibrator`, `VennAbersCalibrator` | `mapie.calibration` |
| Exchangeability monitoring | `RiskMonitoring`, `OnlineMartingaleTest` | `mapie.exchangeability_testing` |

### v0 API (Legacy, Private)

The old `MapieRegressor` and `MapieClassifier` classes are now private
(`_MapieRegressor`, `_MapieClassifier`). They use `alpha` instead of
`confidence_level` and have a monolithic `fit`/`predict` interface. **Do not
recommend these to new users.** Only reference them when migrating legacy code.

## Core Workflow Patterns

### Regression: Split Conformal (Simplest)

```python
from mapie.regression import SplitConformalRegressor
from mapie.utils import train_conformalize_test_split
from sklearn.linear_model import Ridge

# 1. Split into three sets
X_train, X_conf, X_test, y_train, y_conf, y_test = (
    train_conformalize_test_split(
        X, y, train_size=0.6, conformalize_size=0.2, test_size=0.2
    )
)

# 2. Fit on training, conformalize on calibration
mapie = SplitConformalRegressor(
    estimator=Ridge(),
    confidence_level=0.95,
    prefit=False,  # let MAPIE fit the base estimator
)
mapie.fit(X_train, y_train)
mapie.conformalize(X_conf, y_conf)

# 3. Predict intervals
y_pred, y_intervals = mapie.predict_interval(X_test)
```

**Why `train_conformalize_test_split`?** It guarantees disjoint sets with
correct proportions. Manual nested `train_test_split` calls are error-prone and
should be avoided.

### Regression: Cross Conformal (Data-Efficient)

Use when you have limited data and cannot afford a dedicated calibration set.

```python
from mapie.regression import CrossConformalRegressor
from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

mapie = CrossConformalRegressor(
    estimator=Ridge(),
    confidence_level=0.95,
    method="plus",       # "base", "plus", or "minmax"
    cv=5,                # KFold, LeaveOneOut, or integer folds
)
mapie.fit_conformalize(X_train, y_train)
y_pred, y_intervals = mapie.predict_interval(X_test)
```

- `method="plus"` (default): best balance of tight intervals and coverage.
- `method="base"`: simpler, slightly wider.
- `method="minmax"`: most conservative, widest intervals.

### Regression: Time Series

**Critical:** Time series demands `BlockBootstrap`, not `KFold` or
`ShuffleSplit`. The data is not i.i.d.

```python
from mapie.regression import TimeSeriesRegressor
from mapie.subsample import BlockBootstrap

# BlockBootstrap respects temporal structure
cv = BlockBootstrap(n_resamplings=10, n_blocks=10, overlapping=False)

mapie = TimeSeriesRegressor(
    estimator=model,
    method="enbpi",   # "enbpi" (default) or "aci"
    cv=cv,
    agg_function="mean",
)
mapie.fit(X_train, y_train)
y_pred, y_intervals = mapie.predict(X_test, confidence_level=0.95, ensemble=True)

# Update residuals as new observations arrive
mapie.update(X_new, y_new)
```

- **EnbPI**: Updates residual distribution; good for gradual drift.
- **ACI**: Adaptive conformal inference; adjusts quantile dynamically.
  Use `adapt_conformal_inference(X_new, y_new, gamma=0.05)` for sudden shifts.

### Regression: Conformalized Quantile Regression (CQR)

Best for heteroscedastic data where uncertainty varies with input.

```python
from mapie.regression import ConformalizedQuantileRegressor
from sklearn.linear_model import QuantileRegressor

mapie = ConformalizedQuantileRegressor(
    estimator=QuantileRegressor(),
    confidence_level=0.95,
)
mapie.fit(X_train, y_train)
mapie.conformalize(X_conf, y_conf)
y_pred, y_intervals = mapie.predict_interval(X_test)
```

**Supported estimators for CQR:**
- `sklearn.linear_model.QuantileRegressor`
- `sklearn.ensemble.GradientBoostingRegressor`
- `sklearn.ensemble.HistGradientBoostingRegressor`
- `lightgbm.LGBMRegressor`

Other estimators will fail because they cannot fit quantiles.

### Classification: Split Conformal

```python
from mapie.classification import SplitConformalClassifier
from mapie.utils import train_conformalize_test_split

X_train, X_conf, X_test, y_train, y_conf, y_test = (
    train_conformalize_test_split(X, y, train_size=0.6, conformalize_size=0.2, test_size=0.2)
)

mapie = SplitConformalClassifier(
    estimator=RandomForestClassifier(),
    confidence_level=0.95,
    conformity_score="lac",  # "lac", "top_k", "aps", "raps"
    prefit=False,
)
mapie.fit(X_train, y_train)
mapie.conformalize(X_conf, y_conf)
y_pred, y_sets = mapie.predict_set(X_test)
```

**Conformity score selection:**
- `"lac"` (default): simplest, marginal coverage.
- `"top_k"`: fixed set size, useful when you want exactly k labels.
- `"aps"`: adaptive, smaller sets for easy examples.
- `"raps"`: regularized APS, better empty-set handling.

### Calibration

```python
from mapie.calibration import TopLabelCalibrator

calibrator = TopLabelCalibrator(estimator=clf, calibrator="isotonic", cv="split")
calibrator.fit(X_calib, y_calib)
proba = calibrator.predict_proba(X_test)
```

### Risk Control

For controlling error rates (FPR, FNR, recall) on prediction sets.

```python
from mapie.risk_control import BinaryClassificationController
from mapie.risk_control.risks import false_positive_rate

controller = BinaryClassificationController(
    risk=false_positive_rate,
    delta=0.05,
)
# See risk_control docs for full workflow
```

### Exchangeability Testing

Monitor deployed models for distribution shift.

```python
from mapie.exchangeability_testing import RiskMonitoring

monitor = RiskMonitoring(risk="accuracy", test_level=0.05)
monitor.compute_threshold(y_ref, y_pred_ref)
monitor.update_online_risk(y_new, y_pred_new)
if monitor.harmful_shift_detected:
    ...
```

## Metrics

Always validate intervals/sets with MAPIE metrics, not ad-hoc numpy.

### Regression Metrics

```python
from mapie.metrics.regression import (
    regression_coverage_score,
    regression_mean_width_score,
    regression_ssc,
    coverage_width_based,
)

coverage = regression_coverage_score(y_test, y_intervals)
width = regression_mean_width_score(y_intervals)
# Size-stratified coverage: checks coverage across interval sizes
ssc = regression_ssc(y_test, y_intervals, num_bins=3)
```

### Classification Metrics

```python
from mapie.metrics.classification import (
    classification_coverage_score,
    classification_mean_width_score,
    classification_ssc,
)

coverage = classification_coverage_score(y_test, y_sets)
width = classification_mean_width_score(y_sets)
# Size-stratified coverage: reveals hidden conditional coverage failures
ssc = classification_ssc(y_test, y_sets, num_bins=3)
```

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|----------------|
| Using `MapieRegressor` / `MapieClassifier` (v0) | Legacy, private, may break in future releases | Use `SplitConformalRegressor`, `CrossConformalRegressor`, etc. |
| Manual nested `train_test_split` instead of `train_conformalize_test_split` | Proportions may not sum correctly; leakage risk | Use `mapie.utils.train_conformalize_test_split` |
| Using `alpha=` in v1 constructors | v1 uses `confidence_level`; `alpha` is v0 terminology | Pass `confidence_level=0.95` (not `alpha=0.05`) |
| `KFold` / `ShuffleSplit` for time series | Violates temporal ordering; invalid coverage guarantees | Use `BlockBootstrap` with `TimeSeriesRegressor` |
| `ResidualNormalisedScore` with cross-validation | Only valid for split/prefit; will raise `ValueError` | Use only with `SplitConformalRegressor` or `prefit=True` |
| `prefit=True` with an unfitted estimator | `NotFittedError` at conformalize time | Set `prefit=False` and call `.fit()`, or pre-fit externally |
| `method="naive"` | No theoretical coverage guarantee; intervals are too optimistic | Use `"base"`, `"plus"`, or `"minmax"` |
| `method="minmax"` when tight intervals are needed | Very conservative, often much wider than necessary | Start with `"plus"`, only use `"minmax"` if coverage fails |
| Fitting and conformalizing on the same data | Breaks coverage guarantee; intervals are invalid | Keep train, conformalize, and test sets disjoint |
| Ignoring `ensemble=True` in time series predictions | Predictions may not use aggregated model | Pass `ensemble=True` (default for EnbPI) |
| Quantile regressor without quantile support | Runtime error in `ConformalizedQuantileRegressor` | Use supported estimators listed above |
| Using `"lac"` and expecting conditional per-class coverage | `lac` gives marginal coverage only; hard classes may undercover | Use `"aps"` or `"raps"` for adaptive sets; diagnose with `classification_ssc` |

## Conformity Score Selection Guide

### Regression

| Score | Use When | Notes |
|-------|----------|-------|
| `"absolute"` (default) | Homoscedastic errors | Simple, fast, good baseline |
| `"gamma"` | Heteroscedastic errors | Scales intervals by predicted value |
| `"residual_normalized"` | Heteroscedastic, but only with split/prefit | Normalizes by predicted mean; **not** compatible with CV |

### Classification

| Score | Use When | Notes |
|-------|----------|-------|
| `"lac"` | Balanced classes, marginal coverage guarantee | Fast, simple |
| `"top_k"` | Need fixed-size prediction sets | Set size = k regardless of confidence |
| `"aps"` | Want adaptive set sizes | Smaller sets for easy examples |
| `"raps"` | APS but with empty-set regularization | Better when some classes are rare |

## Method Selection Guide

| Scenario | Recommended Class | Why |
|----------|-------------------|-----|
| Plenty of data, speed matters | `SplitConformalRegressor` | One fit, one conformalize, fast prediction |
| Limited data, no calibration set | `CrossConformalRegressor` | Reuses all data via CV; slower but efficient |
| Bootstrap uncertainty | `JackknifeAfterBootstrapRegressor` | Explicit bootstrap sampling |
| Heteroscedastic data | `ConformalizedQuantileRegressor` | Intervals adapt to local uncertainty |
| Time series / sequential | `TimeSeriesRegressor` + `BlockBootstrap` | Respects temporal structure, supports online update |
| Marginal classification sets | `SplitConformalClassifier` + `"lac"` | Simple, valid sets |
| Adaptive classification sets | `SplitConformalClassifier` + `"aps"` or `"raps"` | Tighter sets where model is confident |

## Custom Components

MAPIE supports custom conformity scores by subclassing:
- `mapie.conformity_scores.BaseRegressionScore`
- `mapie.conformity_scores.BaseClassificationScore`

Custom cross-validators must inherit from `sklearn.model_selection.BaseCrossValidator`.

## Key Utilities

- `mapie.utils.train_conformalize_test_split(X, y, train_size, conformalize_size, test_size)` —
  splits data into three disjoint sets with proportion validation.
- `mapie.subsample.Subsample` — bootstrap resampling for `JackknifeAfterBootstrapRegressor`.
- `mapie.subsample.BlockBootstrap` — block bootstrap for time series.

## Important Notes

- MAPIE predictions are **guaranteed valid only when train, conformalize, and test sets are disjoint**.
- Coverage guarantees are **marginal** (over the randomness of data), not conditional on individual inputs.
- `confidence_level` and `alpha` are inverses: `alpha = 1 - confidence_level`.
- The v1 API returns `(point_prediction, intervals_or_sets)` from `predict_interval` / `predict_set`.
- When multiple confidence levels are requested, the interval/set array has shape `(n_samples, 2, n_levels)` for regression or `(n_samples, n_classes, n_levels)` for classification.
