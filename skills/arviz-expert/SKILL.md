---
name: arviz-expert
description: >
  Expert guidance for working with ArviZ, the Python library for exploratory analysis
  of Bayesian models. Use this skill whenever the user mentions arviz, Bayesian posterior
  analysis, MCMC diagnostics, model comparison with LOO/WAIC, Bayesian plotting,
  InferenceData, DataTree, or any probabilistic programming language workflow that
  involves analyzing or visualizing posterior samples (PyMC, Stan, NumPyro, Pyro, emcee,
  Bambi). Also use when the user asks about converting sampler output, computing ESS,
  R-hat, HDI/ETI credible intervals, posterior predictive checks, forest plots, trace plots,
  or rank plots. Trigger even for vague requests like "analyze my Bayesian model results",
  "plot MCMC chains", or "check convergence" when the context implies Python and Bayesian
  workflows.
---

# ArviZ Expert

ArviZ (pronounced "AR-vees") is a Python meta-package for exploratory analysis of Bayesian models. It ingests posterior samples from probabilistic programming languages (PPLs) and provides diagnostics, model comparison, visualization, and standardized data containers.

## Architecture

ArviZ 1.x is a thin namespace meta-package. The actual code lives in three satellite libraries that must share the same minor version:

- **arviz_base**: Data I/O, converters from PPLs, rcParams, `xarray.DataTree` integration
- **arviz_stats**: MCMC diagnostics, model comparison, summaries, credible intervals. Provides both a raw NumPy/SciPy array API and an xarray-aware API.
- **arviz_plots**: 30+ diagnostic and comparison plots across matplotlib, Bokeh, and Plotly backends

`arviz/__init__.py` enforces version coupling at import time. Mismatched minor versions raise `ImportError`.

## Installation

Install only the backends you need. The meta-package has no mandatory plotting or I/O library.

```bash
pip install "arviz[zarr, matplotlib]"
```

Available extras:
- I/O: `zarr`, `netcdf4`, `h5netcdf`
- Plotting: `matplotlib`, `bokeh`, `plotly`

Mix and match freely. Verify with `print(az.info)`.

## Data Model: xarray.DataTree

The legacy `arviz.InferenceData` class is gone. ArviZ 1.x uses `xarray.DataTree` as its canonical container. Accessing `az.InferenceData` emits a `MigrationWarning` and returns `xarray.DataTree`.

### Standard Schema Groups

Structure your `DataTree` with these top-level groups for full ArviZ compatibility:

| Group | Purpose |
|-------|---------|
| `posterior` | Posterior samples |
| `posterior_predictive` | Posterior predictive distribution |
| `prior` | Prior samples |
| `prior_predictive` | Prior predictive distribution |
| `observed_data` | Observed data |
| `constant_data` | Data constants (not sampled) |
| `sample_stats` | Sampler diagnostics (divergences, energy, etc.) |
| `log_likelihood` | Pointwise log-likelihood (required for `loo`) |
| `predictions` | Out-of-sample predictions |

### DataTree Access Patterns

- `dt["posterior"]` returns a `DataTree`, **not** a `Dataset`. Use `.dataset` for a read-only view or `.to_dataset()` for a mutable copy.
- Old NetCDF/Zarr files written by 0.x `InferenceData` read cleanly into `DataTree` via `az.from_netcdf(path)` and `az.from_zarr(path)` — thin aliases over `xarray.open_datatree`.
- Write data with native xarray methods: `dt.to_netcdf(path, engine="h5netcdf")` or `dt.to_zarr(path)`.
- `InferenceData.extend()` mapped to `DataTree.update()` (note reversed argument order).
- `InferenceData.map()` mapped to `DataTree.map_over_datasets()` combined with `.filter`/`.match`.

### Converter Usage

Use `arviz_base` converters to ingest output from any supported PPL:

```python
import arviz as az

# From PyMC
idata = az.from_pymc(trace, model=model)

# From CmdStanPy
idata = az.from_cmdstanpy(fit)

# From NumPyro
idata = az.from_numpyro(mcmc)

# From a dictionary of NumPy arrays
idata = az.from_dict(posterior={"mu": samples, "sigma": samples})
```

Supported PPLs: **PyMC, CmdStanPy, NumPyro, Pyro, emcee, Bambi**.

## Statistical Analysis

### Two Interfaces

1. **xarray-aware top-level API** (`az.ess`, `az.rhat`, `az.loo`, `az.summary`) — operates on `DataTree`
2. **Raw array API** (`arviz_stats.array_stats.ess`) — operates on NumPy arrays. Useful for PPL developers who need diagnostics without xarray overhead.

### xarray Accessors

After `import arviz as az`, `DataArray`, `Dataset`, and `DataTree` objects gain a `.azstats` accessor:

```python
dt.posterior.azstats.ess()
dt.posterior.azstats.hdi()
```

### Key Diagnostics and Comparisons

| Function | Purpose |
|----------|---------|
| `az.ess(dt)` | Effective sample size |
| `az.rhat(dt)` | Potential scale reduction factor (convergence) |
| `az.mcse(dt)` | Monte Carlo standard error |
| `az.loo(dt)` | PSIS-LOO-CV model comparison. **WAIC is removed; use `loo` exclusively.** |
| `az.compare({"m1": dt1, "m2": dt2})` | Compare multiple models |
| `az.summary(dt)` | Parameter summary table |
| `az.hdi(dt)` / `az.eti(dt)` | Credible intervals |

### rcParams Defaults (Changed in 1.x)

Defaults changed intentionally from 0.x. Do not assume old behavior:

- `stats.ci_prob`: **0.89** (was 0.94). Non-standard value chosen deliberately to remind users the cutoff is arbitrary.
- `stats.ci_kind`: **"eti"** (was "hdi").
- `stats.module`: **"base"** (NumPy). Set to "numba" or a custom module for accelerated backends.
- `plot.backend`: **"matplotlib"**.
- `data.sample_dims`: **("chain", "draw")**.
- `stats.ic_compare_method`: "stacking".

Set globally or override per function call.

```python
az.rcParams["stats.ci_prob"] = 0.95
az.rcParams["stats.ci_kind"] = "hdi"
```

## Plotting

### PlotCollection Architecture

New plot functions return `PlotCollection` (or `PlotMatrix`) objects, not raw matplotlib axes. This separates plotting logic from faceting and aesthetic mapping, enabling backend-agnostic customization.

Customize via `pc_kwargs`, `visuals`, and `stats` dicts rather than positional style arguments:

```python
pc = az.plot_dist(dt, var_names=["mu"], pc_kwargs={"aes": {"color": ["model"]}})
```

### Three Backends

- **matplotlib**: Default. Best for publication-quality static output.
- **bokeh**: Interactive web output.
- **plotly**: Interactive web output with different feature set.

Not all plots have full feature parity across all three backends. Check `arviz-plots` docs for backend-specific limitations.

### Common Plot Functions

| New (1.x) | Legacy (0.x) Note |
|-----------|-------------------|
| `plot_trace_dist` | Replaces `plot_trace` (dist half) |
| `plot_trace_rank` | Replaces `plot_trace` (rank half) |
| `plot_dist` | Merged `plot_posterior` + `plot_density` |
| `plot_forest` | Forest plot. Add ESS columns via `PlotCollection.map()` with pre-computed stats |
| `plot_pair` | Pair plots with flexible reference values |
| `plot_rank_dist` | Rank distribution plots |
| `plot_ppc` | Posterior/prior predictive checks |
| `plot_loo_pit` | LOO probability integral transform |

**Removed**: `plot_kde`, `plot_violin`.

### Adding ESS to Forest Plots

In 1.x, `plot_forest` does not take an `ess=True` flag. Pre-compute ESS and map it onto the `PlotCollection`:

```python
# Pre-compute ESS on the posterior Dataset (not DataTree)
ess_ds = dt["posterior"].dataset.azstats.ess()

# Build forest plot
pc = az.plot_forest(dt["posterior"].dataset, var_names=["mu", "sigma"])

# Map ESS values as scatter points onto the "ess" aesthetic column
pc.map(az.visuals.scatter_x, "ess", data=ess_ds, coords={"column": "ess"})
```

### Cross-Backend Styling

`az.style` is no longer a matplotlib alias. It controls cross-backend themes for all installed backends.

## Version Compatibility and Migration

### 1.0 vs 1.1

The meta-package delta between 1.0 and 1.1 is minimal:

- **1.0**: `az.InferenceData` raised `MigrationError`
- **1.1**: `az.InferenceData` emits `MigrationWarning` (inherits both `UserWarning` and `FutureWarning`) and returns `xarray.DataTree`
- Dependency pins bumped from `>=1.0.0,<1.1.0` to `>=1.1.0,<1.2.0`

Subpackage changelogs live in their own repositories. The meta-package changelog tracks only meta-package changes.

### Migrating from 0.x to 1.x

**Important:** Old NetCDF and Zarr files written by ArviZ 0.x remain fully compatible. No file format migration is needed. Load them with `az.from_netcdf(path)` or `az.from_zarr(path)` and they become `DataTree` objects automatically.

| 0.x Pattern | 1.x Equivalent |
|-------------|---------------|
| `arviz.InferenceData(...)` | `xarray.DataTree(...)` |
| `idata.to_netcdf(path)` | `dt.to_netcdf(path, engine="h5netcdf")` |
| `idata.extend(other)` | `other.update(idata)` (reversed order) |
| `idata.map(func)` | `dt.map_over_datasets(func)` + `.filter`/`.match` |
| `az.rcParams["stats.hdi_prob"]` | `az.rcParams["stats.ci_prob"]` |
| Default HDI at 0.94 | Default ETI at 0.89 |
| `plot_trace()` | `plot_trace_dist()` + `plot_trace_rank()` |
| `plot_posterior()` / `plot_density()` | `plot_dist()` |
| `plot_kde()` | Removed |
| `plot_violin()` | Removed |

## Best Practices

### For Concise, Efficient, Performant Workflows

1. **Install minimally**: Only include the I/O and plotting backends you will actually use.
2. **Configure rcParams early**: Set `ci_prob`, `ci_kind`, `stats.module`, and `plot.backend` at the top of notebooks/scripts for reproducibility.
3. **Structure DataTree with standard groups**: Populate at minimum `posterior`, `observed_data`, and `sample_stats`. Include `log_likelihood` if you plan to use `az.loo()` or `az.compare()`.
4. **Use accessors for exploration**: `dt.posterior.azstats.ess()` is more discoverable than top-level functions for quick checks.
5. **Use top-level functions for batch analysis**: `az.summary(dt)`, `az.loo(dt)`, `az.compare(models)` for full-dataset operations.
6. **Label and sort upstream**: Modify xarray coordinates before calling ArviZ for consistent ordering across multiple plots. Use `MapLabeller` for math notation.
7. **Persist with native xarray**: `dt.to_netcdf(path, engine="h5netcdf")` or `dt.to_zarr(path)`. Read with `az.from_netcdf(path)` / `az.from_zarr(path)`.
8. **Pre-computed stats for repeated plots**: When re-rendering the same data multiple times (e.g., in dashboards), pre-compute summaries and pass them to plotting functions where supported. Currently most effective with `plot_forest`.
9. **Choose stats backend wisely**: `stats.module="base"` is pure NumPy. `"numba"` may accelerate large diagnostics. Custom modules can be registered at runtime via `rcParams`.
10. **Avoid deep nesting**: ArviZ expects single-level groups. Arbitrary `DataTree` nesting beyond the standard schema may break ArviZ expectations.

## Common Gotchas

- `az.InferenceData` is dead. Do not write new code against it.
- `dt["posterior"]` returns `DataTree`, not `Dataset`.
- Default credible interval is **ETI at 0.89**, not HDI at 0.94.
- `dim` vs `sample_dims` is strict in `arviz-stats`: `ess`, `rhat`, `mcse` require all target variables to share every dimension in `sample_dims`. `hdi`, `eti`, `kde` use `dim` and reduce only dimensions present in each variable.
- `stats.module` backend changes must be set at runtime in `rcParams`; the `arvizrc` config file does not support custom module registration.
- Several 0.x plot functions renamed or removed. Check the migration table above.
- ArviZ does **not** perform inference. It only analyzes samples produced by external PPLs.
- Not all `xarray.DataTree` features are supported. Stick to the standard single-level group schema.
- ArviZ 1.x requires **Python 3.12+**.

## Quick Reference

```python
import arviz as az
import xarray as xr

# Verify installation
print(az.info)

# Convert from PPL
idata = az.from_pymc(trace)

# Quick diagnostics
az.summary(idata)
az.ess(idata)
az.rhat(idata)

# Model comparison
az.loo(idata)

# Plot
az.plot_trace_dist(idata)
az.plot_forest(idata)

# Accessors
idata.posterior.azstats.hdi()

# Save / load
idata.to_netcdf("model.nc", engine="h5netcdf")
loaded = az.from_netcdf("model.nc")
```
