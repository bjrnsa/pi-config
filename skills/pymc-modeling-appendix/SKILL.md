---
name: pymc-modeling-appendix
description: >
  Advanced PyMC modeling patterns beyond standard workflows. Use whenever user needs
  likelihood-free inference (SMC/Simulator/ABC), ODE/SDE models, custom black-box
  likelihoods, state space modeling with pymc-extras, spatial CAR/ICAR structure,
  survival/frailty models, minibatch variational inference, or mixed discrete+continuous
  samplers. Trigger even if user only hints at simulation-based inference, latent
  dynamics, missingness mechanisms, or large-scale approximate Bayesian fitting.
---

# PyMC Modeling Appendix

Advanced extension pack for PyMC v5+ workflows.

Use this with standard Bayesian workflow: prior predictive -> fit -> diagnostics -> posterior predictive -> comparison. This appendix covers patterns usually needed after baseline model works but still misses domain structure, scale, or sampler compatibility.

## 0) Decision routing

Use this quick map before coding:

1. **No closed-form likelihood, simulator exists** -> `pm.Simulator` + `pm.sample_smc()`
2. **Need SMC tuning / diagnostics** -> choose `kernel=pm.smc.IMH` or `pm.smc.MH`; tune `threshold` and `correlation_threshold`
3. **Continuous-time process** -> ODE (`DifferentialEquation`) or SDE (`EulerMaruyama`)
4. **Discrete-time latent dynamics** -> `GaussianRandomWalk`, `MvGaussianRandomWalk`, or `pm.AR`
5. **Linear Gaussian latent dynamics / forecasting** -> `pymc_extras.statespace`
6. **Multivariate macro time series** -> Bayesian VAR / hierarchical Bayesian VAR pattern
7. **Custom external likelihood code** -> custom PyTensor `Op` + `pm.Potential` or `pm.CustomDist`
8. **Spatial areal dependence** -> `pm.CAR` / ICAR-style modeling
9. **Time-to-event with heterogeneity** -> censored survival + frailty terms
10. **Sports team strengths from scores** -> rugby-style attack/defense + home advantage Poisson hierarchy
11. **Huge data / fast approximate posterior** -> minibatch VI, Pathfinder, Laplace, DADVI
12. **Mixed discrete + continuous parameters** -> compound step methods or marginalization
13. **Ordinal outcomes** -> `OrderedLogistic` / `OrderedProbit` with ordered cutpoints

## 1) Likelihood-free inference (Simulator + SMC)

Use when simulator can generate data but exact likelihood hard/intractable.

```python
import numpy as np
import pymc as pm


def simulator_fn(rng, a, b, size):
    return rng.normal(loc=a, scale=b, size=size)


with pm.Model() as m:
    a = pm.Normal("a", 0, 5)
    b = pm.HalfNormal("b", 1)

    s = pm.Simulator(
        "s",
        simulator_fn,
        params=(a, b),
        sum_stat="sort",
        distance="gaussian",
        epsilon=1.0,
        observed=observed_data,
    )

    idata = pm.sample_smc(draws=2000)
```

Guidance:
- Start with larger `epsilon`, then tighten.
- Use summary stats only if full-data distance too noisy/expensive.
- Validate with posterior predictive from simulator output.
- SMC can handle multimodality better than many VI methods.

### SMC kernel choice and operational controls

```python
with model:
    # Default kernel is IMH; can be swapped to MH
    idata_imh = pm.sample_smc(draws=1000, kernel=pm.smc.IMH)
    idata_mh = pm.sample_smc(draws=1000, kernel=pm.smc.MH)

    # Kernel kwargs used by both kernels
    idata = pm.sample_smc(
        draws=1000,
        chains=2,
        cores=2,
        kernel=pm.smc.IMH,
        threshold=0.7,
        correlation_threshold=0.02,
    )
```

Operational notes:
- `kernel` defaults to `IMH`; switch to `MH` explicitly when you want MH transition behavior.
- `threshold` and `correlation_threshold` control stage progression and per-stage MCMC effort.
- `chains` defaults to `max(2, cores)`; run multiple chains when you need robust convergence diagnostics.
- `start` accepts a dict (reused across chains) or list of dicts matching `chains`; transformed names (for example `b_log__`) are valid.
- `compute_convergence_checks=True` runs convergence checks on returned results; very small draws trigger warnings.

### Simulator guardrails (failure modes you should test early)

```python
with pm.Model():
    a = pm.Normal("a", 0, 1)
    b = pm.HalfNormal("b", 1)

    # Valid: unnamed params
    s1 = pm.Simulator("s1", simulator_fn, a, b, distance="gaussian", sum_stat="sort", observed=data)

    # Valid: params keyword form
    s2 = pm.Simulator("s2", simulator_fn, params=(a, b), distance="laplace", sum_stat="mean", observed=data)
```

Guardrails from core/tests:
- Invalid `distance` (for example `"not_real"`) raises `ValueError`.
- Invalid `sum_stat` (for example `"not_real"`) raises `ValueError`.
- Passing both unnamed parameters and `params=...` raises `ValueError`.
- `distance="kullback_leibler"` currently raises `NotImplementedError` (`"KL not refactored yet"`), so treat KL as unavailable in production paths.
- Custom callables for `distance`/`sum_stat` are supported, including scalar-observed cases, but test shape behavior with prior predictive before long SMC runs.

## 2) ODE models (parameter inference in mechanistic systems)

Use when deterministic dynamics driven by latent parameters.

```python
import numpy as np
import pymc as pm
from pymc.ode import DifferentialEquation


def ode_func(y, t, p):
    return [p[0] * y[0] * (1 - y[0])]


times = np.arange(0.5, 10.5, 0.5)
ode_model = DifferentialEquation(func=ode_func, times=times, n_states=1, n_theta=1, t0=0)

with pm.Model() as m:
    r = pm.LogNormal("r", 0, 1)
    sigma = pm.HalfNormal("sigma", 1)

    y_hat = ode_model(y0=[0.1], theta=[r])
    y = pm.Normal("y", mu=y_hat, sigma=sigma, observed=y_obs)

    idata = pm.sample(target_accept=0.9)
```

Guidance:
- Keep state scaling sane; extreme scales destabilize gradients.
- Put informative priors on rate constants/initial conditions.
- For stiff/large systems, consider performance-first alternatives if runtime dominates.

## 3) SDE models (stochastic dynamics)

Use when latent process has drift + diffusion noise.

```python
import pymc as pm


def sde_fn(x, theta):
    drift = theta[0] * (theta[1] - x)
    diffusion = theta[2]
    return drift, diffusion


with pm.Model() as m:
    kappa = pm.HalfNormal("kappa", 1)
    mu = pm.Normal("mu", 0, 2)
    sigma = pm.HalfNormal("sigma", 1)

    x = pm.EulerMaruyama(
        "x",
        dt=0.1,
        sde_fn=sde_fn,
        sde_pars=(kappa, mu, sigma),
        steps=n_steps,
    )

    y = pm.Normal("y", mu=x, sigma=obs_sigma, observed=y_obs)
    idata = pm.sample(target_accept=0.9)
```

Guidance:
- Match `dt` to data resolution and process smoothness.
- Check identifiability between process noise and observation noise.
- Posterior predictive on trajectories is mandatory, not optional.

## 3.5) Time-series primitives: `GaussianRandomWalk`, `MvGaussianRandomWalk`, `AR`

Use these when latent dynamics are discrete-time and you need direct process priors without building a full state-space object.

```python
import numpy as np
import pymc as pm

with pm.Model(coords={"time": np.arange(T), "series": np.arange(D)}) as m:
    # Univariate GRW: defaults to Normal.dist(0, 100) init_dist if omitted
    level = pm.GaussianRandomWalk(
        "level",
        mu=0.0,
        sigma=0.2,
        init_dist=pm.Normal.dist(0, 1),
        steps=T,
        dims="time",
    )

    # Multivariate GRW with correlated innovations
    chol, *_ = pm.LKJCholeskyCov("chol", n=D, eta=2, sd_dist=pm.HalfCauchy.dist(2.5))
    trend = pm.MvGaussianRandomWalk(
        "trend",
        mu=np.zeros(D),
        chol=chol,
        shape=(T, D),
    )

    # AR(p): order inferred from rho.shape[-1] (minus intercept if constant=True)
    rho = pm.Normal("rho", 0.0, 1.0, shape=3)  # intercept + 2 lags => AR(2)
    sigma = pm.HalfNormal("sigma", 3)
    y = pm.AR(
        "y",
        rho=rho,
        sigma=sigma,
        constant=True,
        init_dist=pm.Normal.dist(0, 10),
        observed=y_obs,
    )
```

Pattern notes:
- `GaussianRandomWalk` and `MvGaussianRandomWalk` both warn and default to broad init distributions when `init_dist` is omitted.
- `MvGaussianRandomWalk` innovations can be parameterized with `cov`, `tau`, or `chol` (one is required).
- For `pm.AR`, use `constant=True` when first `rho` entry is intercept (matches PyMC example guidance).
- AR order is inferred from the last `rho` dimension when possible; pass `ar_order` explicitly if shape is not static.
- `init_dist` must be created with `.dist()` (not a named RV).

## 4) Missing data: explicit mechanisms over blind imputation

When observed arrays contain masks/NaNs, PyMC can impute missing components during modeling. Use this intentionally.

```python
import numpy as np
import pymc as pm

x_obs = np.ma.masked_invalid(raw_x)

with pm.Model() as m:
    mu = pm.Normal("mu", 0, 2)
    sigma = pm.HalfNormal("sigma", 1)
    x = pm.Normal("x", mu=mu, sigma=sigma, observed=x_obs)
    idata = pm.sample()
```

Upgrade path:
- MCAR/MAR: model data-generating process with partial pooling and covariates.
- MNAR suspicion: explicitly model missingness indicator jointly with outcome.
- Always run sensitivity analyses under alternate missingness assumptions.

## 5) State space modeling with `pymc_extras.statespace`

Use for ARIMA-family models, structural decomposition, ETS, VARMAX, dynamic factor models, latent filtering/smoothing.

### SARIMAX-style workflow

```python
import pymc as pm
import pymc_extras.statespace as pmss

ss_mod = pmss.BayesianSARIMAX(order=(1, 0, 1), mode="JAX", verbose=True)

with pm.Model(coords=ss_mod.coords) as m:
    sigma_state = pm.Gamma("sigma_state", alpha=10, beta=2, dims=ss_mod.param_dims["sigma_state"])
    ar_params = pm.Beta("ar_params", alpha=5, beta=1, dims=ss_mod.param_dims["ar_params"])
    ma_params = pm.Normal("ma_params", mu=0.0, sigma=0.5, dims=ss_mod.param_dims["ma_params"])

    ss_mod.build_statespace_graph(y_train)
    idata = pm.sample()

post = ss_mod.sample_conditional_posterior(idata)
```

### Structural components workflow

```python
import pymc as pm
from pymc_extras.statespace import structural as st

mod = st.LevelTrend(order=2, innovations_order=[0, 1])
mod += st.TimeSeasonality(name="season", season_length=12, innovations=False)
mod += st.MeasurementError(name="obs")

with pm.Model(coords=mod.coords) as m:
    mod.build_statespace_graph(y_train)
    idata = pm.sample()

components = mod.extract_components_from_idata(idata)
```

Guidance:
- Use provided `coords`/`param_dims`; avoid manual dimension guessing.
- Build graph before sampling, then inspect latent components after fitting.
- For missing timestamps/values, inspect model warnings and index assumptions.

### Bayesian VAR workflow (from PyMC examples)

```python
import numpy as np
import pymc as pm
def make_model(n_lags, n_eqs, df, priors, mv_norm=True, prior_checks=True):
    coords = {
        "lags": np.arange(n_lags) + 1,
        "equations": df.columns.tolist(),
        "cross_vars": df.columns.tolist(),
        "time": [x for x in df.index[n_lags:]],
    }

    with pm.Model(coords=coords) as model:
        lag_coefs = pm.Normal(
            "lag_coefs",
            mu=priors["lag_coefs"]["mu"],
            sigma=priors["lag_coefs"]["sigma"],
            dims=["equations", "lags", "cross_vars"],
        )
        alpha = pm.Normal(
            "alpha", mu=priors["alpha"]["mu"], sigma=priors["alpha"]["sigma"], dims=("equations",)
        )
        data_obs = pm.Data("data_obs", df.values[n_lags:], dims=["time", "equations"], mutable=True)
        mean = alpha + betaX
        if mv_norm:
            noise_chol, _, _ = pm.LKJCholeskyCov(
                "noise_chol",
                eta=priors["noise_chol"]["eta"],
                n=n_eqs,
                sd_dist=pm.HalfNormal.dist(sigma=priors["noise_chol"]["sigma"]),
            )
            pm.MvNormal("obs", mu=mean, chol=noise_chol, observed=data_obs, dims=["time", "equations"])
        else:
            sigma = pm.HalfNormal("noise", sigma=priors["noise"]["sigma"], dims=["equations"])
            pm.Normal("obs", mu=mean, sigma=sigma, observed=data_obs, dims=["time", "equations"])

        idata = pm.sample_prior_predictive()
        if not prior_checks:
            idata.extend(pm.sample(draws=2000, random_seed=130))
            pm.sample_posterior_predictive(idata, extend_inferencedata=True)
    return model, idata
```

Workflow notes:
- Keep explicit `coords` (`lags`, `equations`, `cross_vars`, `time`) to avoid silent shape mistakes.
- Start with prior predictive (`prior_checks=True`) before fitting full VAR.
- Use LKJ-Cholesky + `MvNormal` likelihood when cross-series covariance is part of the target inference.

### Hierarchical Bayesian VAR over countries

```python
import numpy as np
import pymc as pm
from pymc.sampling_jax import sample_blackjax_nuts
def make_hierarchical_model(n_lags, n_eqs, df, group_field, prior_checks=True):
    cols = [col for col in df.columns if col != group_field]
    groups = df[group_field].unique()

    with pm.Model(coords={"lags": np.arange(n_lags) + 1, "equations": cols, "cross_vars": cols}) as model:
        rho = pm.Beta("rho", alpha=2, beta=2)
        alpha_hat_location = pm.Normal("alpha_hat_location", 0, 0.1)
        alpha_hat_scale = pm.InverseGamma("alpha_hat_scale", 3, 0.5)
        beta_hat_location = pm.Normal("beta_hat_location", 0, 0.1)
        beta_hat_scale = pm.InverseGamma("beta_hat_scale", 3, 0.5)
        omega_global, _, _ = pm.LKJCholeskyCov(
            "omega_global", n=n_eqs, eta=1.0, sd_dist=pm.Exponential.dist(1)
        )
        for grp in groups:
            df_grp = df[df[group_field] == grp][cols]
            z_scale_beta = pm.InverseGamma(f"z_scale_beta_{grp}", 3, 0.5)
            z_scale_alpha = pm.InverseGamma(f"z_scale_alpha_{grp}", 3, 0.5)
            lag_coefs = pm.Normal(
                f"lag_coefs_{grp}",
                mu=beta_hat_location,
                sigma=beta_hat_scale * z_scale_beta,
                dims=["equations", "lags", "cross_vars"],
            )
            alpha = pm.Normal(
                f"alpha_{grp}",
                mu=alpha_hat_location,
                sigma=alpha_hat_scale * z_scale_alpha,
                dims=("equations",),
            )
            betaX = calc_ar_step(lag_coefs, n_eqs, n_lags, df_grp)
            mean = alpha + betaX
            noise_chol, _, _ = pm.LKJCholeskyCov(
                f"noise_chol_{grp}", eta=10, n=n_eqs, sd_dist=pm.Exponential.dist(1)
            )
            omega = pm.Deterministic(f"omega_{grp}", rho * omega_global + (1 - rho) * noise_chol)
            pm.MvNormal(f"obs_{grp}", mu=mean, chol=omega, observed=df_grp.values[n_lags:])

        idata = pm.sample_prior_predictive()
        if not prior_checks:
            idata.extend(sample_blackjax_nuts(2000, random_seed=120))
            pm.sample_posterior_predictive(idata, extend_inferencedata=True)
    return model, idata
```

Operational notes:
- The group loop pattern supports partial pooling across countries via shared hyperparameters.
- `rho * omega_global + (1 - rho) * noise_chol` is the key covariance-sharing control in the example.
- Keep country-specific outputs (`alpha_<country>`, `lag_coefs_<country>`, `obs_<country>`) for post-fit comparisons.

### Post-fit analysis hooks (impulse-response / forecasting context)

- The notebook states IRF/forecast analysis is the next-step use of fitted VAR posteriors.
- The workflow in both VAR functions explicitly runs `pm.sample_posterior_predictive(..., extend_inferencedata=True)` after posterior sampling.

## 6) Variational inference at scale

### Minibatch ADVI

```python
import pymc as pm

X_mb = pm.Minibatch(X_train, batch_size=512)
y_mb = pm.Minibatch(y_train, batch_size=512)

with pm.Model() as m:
    beta = pm.Normal("beta", 0, 1, shape=X_train.shape[1])
    mu = pm.math.dot(X_mb, beta)
    y = pm.Normal("y", mu=mu, sigma=1, observed=y_mb, total_size=len(y_train))

    approx = pm.fit(
        n=50_000,
        method="advi",
        callbacks=[pm.callbacks.CheckParametersConvergence(tolerance=1e-4)],
    )
    idata_vi = approx.sample(2000)
```

Critical details:
- Set `total_size` on minibatch likelihood terms.
- Track ELBO and posterior predictive quality, not ELBO alone.
- Mean-field ADVI misses multimodal/correlated structure.

### `pymc_extras` fast approximations

```python
import pymc_extras as pmx

# Unified interface
idata_pf = pmx.fit(method="pathfinder", model=model)
idata_lap = pmx.fit(method="laplace", model=model)
idata_dadvi = pmx.fit(method="dadvi", model=model)

# Direct interfaces
from pymc_extras.inference import fit_dadvi
idata_pf2 = pmx.fit_pathfinder(model=model, num_paths=4, num_draws=1000)
idata_lap2 = pmx.fit_laplace(model=model, draws=1000)
idata_dadvi2 = fit_dadvi(n_fixed_draws=30, n_draws=1000)
```

Use cases:
- Pathfinder: strong initialization and fast approximate posterior.
- Laplace: local Gaussian approximation around MAP.
- DADVI: deterministic objective, stable reproducibility.

## 7) Black-box likelihood integration

Use when core likelihood lives in external NumPy/C/Fortran/JAX code not natively symbolically differentiable.

Pattern:
1. Wrap external log-likelihood in custom PyTensor `Op`.
2. Inject via `pm.Potential` or `pm.CustomDist` with explicit `logp`.
3. Provide gradients if possible; otherwise choose samplers that tolerate no-grad paths.

Skeleton:

```python
import pymc as pm
import numpy as np
import pytensor.tensor as pt
from pytensor.graph.op import Op
from pytensor.graph.basic import Apply


class LogLike(Op):
    itypes = [pt.dvector]
    otypes = [pt.dscalar]

    def perform(self, node, inputs, outputs):
        theta = inputs[0]
        outputs[0][0] = np.array(external_loglike(theta, data), dtype="float64")


loglike_op = LogLike()

with pm.Model() as m:
    theta = pm.Normal("theta", 0, 1, shape=p)
    pm.Potential("likelihood", loglike_op(theta))
```

Guidance:
- Start with correctness (finite logp), then add gradients for speed.
- Validate with simulation-based calibration or synthetic-recovery tests.
- If no gradients, prefer SMC/Metropolis/compound strategies over pure NUTS.

## 8) Spatial areal models (CAR / ICAR-style)

Use for region-level outcomes with adjacency dependence.

```python
import numpy as np
import pymc as pm

coords = {"area": np.arange(N)}

with pm.Model(coords=coords) as m:
    alpha = pm.Beta("alpha", 1, 1)
    tau_spat = pm.Gamma("tau_spat", 2, 2)
    phi = pm.CAR("phi", mu=np.zeros(N), tau=tau_spat, alpha=alpha, W=adj_matrix, dims="area")

    eta = beta0 + beta1 * x + phi
    y = pm.Poisson("y", mu=pm.math.exp(eta + np.log(exposure)), observed=y_obs)
    idata = pm.sample(target_accept=0.9)
```

Guidance:
- Build/test adjacency matrix first (symmetry, neighbors, isolated units).
- Compare independent vs spatial random effects; inspect residual maps.
- Check prior influence on spatial dependence near boundary values.

## 9) Survival and frailty models

Use for time-to-event, censoring, group heterogeneity.

```python
import pymc as pm

with pm.Model(coords={"group": group_ids}) as m:
    beta = pm.Normal("beta", 0, 1, shape=n_features)
    sigma_f = pm.HalfNormal("sigma_f", 1)
    frailty_raw = pm.Normal("frailty_raw", 0, 1, dims="group")
    frailty = pm.Deterministic("frailty", sigma_f * frailty_raw, dims="group")

    log_scale = pm.math.dot(X, beta) + frailty[group_idx]
    scale = pm.math.exp(log_scale)
    alpha = pm.HalfNormal("alpha", 1)  # Weibull shape

    base = pm.Weibull.dist(alpha=alpha, beta=scale)
    y = pm.Censored("y", base, lower=None, upper=censor_time, observed=t_obs)

    idata = pm.sample(target_accept=0.9)
```

Guidance:
- Separate event-time process from censoring mechanism in checks.
- Frailty often resolves unexplained heterogeneity and overconfidence.
- Calibrate with survival curves/hazard diagnostics, not posterior means alone.

### Hierarchical sports scoring pattern (rugby-style)

Use for paired team scores with latent attack/defense strengths and home advantage.

```python
import pymc as pm
import pytensor.tensor as pt
coords = {"team": teams}
with pm.Model(coords=coords) as model:
    home = pm.Normal("home", mu=0, sigma=1)
    sd_att = pm.HalfNormal("sd_att", sigma=2)
    sd_def = pm.HalfNormal("sd_def", sigma=2)
    intercept = pm.Normal("intercept", mu=3, sigma=1)

    atts_star = pm.Normal("atts_star", mu=0, sigma=sd_att, dims="team")
    defs_star = pm.Normal("defs_star", mu=0, sigma=sd_def, dims="team")

    atts = pm.Deterministic("atts", atts_star - pt.mean(atts_star), dims="team")
    defs = pm.Deterministic("defs", defs_star - pt.mean(defs_star), dims="team")

    home_theta = pt.exp(intercept + home + atts[home_idx] + defs[away_idx])
    away_theta = pt.exp(intercept + atts[away_idx] + defs[home_idx])

    pm.Poisson("home_points", mu=home_theta, observed=home_score, dims="match")
    pm.Poisson("away_points", mu=away_theta, observed=away_score, dims="match")
```

Pattern notes:
- Centering `atts` / `defs` (`- pt.mean(...)`) is the identifiability constraint.
- Separate home advantage from team strengths for cleaner interpretation.
- Posterior predictive ranking/league-table simulations are straightforward once score posteriors are sampled.

## 10) Mixed discrete + continuous latent structure

NUTS cannot directly handle discrete latent variables. Three options:

1. **Marginalize discrete variables** (preferred where available):

```python
import pymc_extras as pmx

m_marg = pmx.marginalize(model, ["z_discrete"])
with m_marg:
    idata = pm.sample()
idata = pmx.recover_marginals(m_marg, idata)
```

2. **Compound samplers** for hybrid models:

```python
with model:
    step_disc = pm.CategoricalGibbsMetropolis([z])
    step_cont = pm.NUTS(vars=[beta, sigma])
    idata = pm.sample(step=[step_disc, step_cont])
```

3. **Reparameterize** to remove explicit discrete latents where valid.

## 10.5) Ordinal outcomes: `OrderedLogistic` and `OrderedProbit`

```python
with pm.Model() as ordinal_model:
    beta = pm.Normal("beta", 0, 2, dims="features")
    cutpoints = pm.Normal(
        "cutpoints",
        mu=0,
        sigma=2,
        shape=n_categories - 1,
        transform=pm.distributions.transforms.ordered,
    )

    eta = pm.math.dot(X, beta)
    y_logit = pm.OrderedLogistic("y_logit", eta=eta, cutpoints=cutpoints, observed=y_obs)
    y_probit = pm.OrderedProbit("y_probit", eta=eta, cutpoints=cutpoints, sigma=1.0, observed=y_obs)
```

Guidance:
- Use ordered cutpoints (`transform=...ordered`) for stable ordinal thresholds.
- `OrderedLogistic` and `OrderedProbit` are paired options; choose based on link-function assumptions.
- Both expose `compute_p` behavior internally; disable stored category probabilities when memory is tight.
- `compute_p=True` stores per-category probabilities in the trace (`<name>_probs`); set `compute_p=False` when memory matters.

## 11) Named-dimension modeling with `pymc.dims`

For high-dimensional structured models, prefer explicit dimension semantics.

```python
import pymc as pm
import pymc.dims as pmd

with pm.Model(coords={"item": items, "participant": participants}) as m:
    pref = pmd.ZeroSumNormal("pref", core_dims="item", dims=("participant", "item"))
    logits = pmd.Deterministic("logits", pref)
    y = pmd.Categorical("y", p=pmd.math.softmax(logits, dim="item"), dims=("participant",))
```

Benefits:
- Clearer shape logic.
- Fewer silent broadcasting bugs.
- Better downstream interpretability in InferenceData.

## 12) Appendix-level quality gates

Before interpreting effects, confirm all:

1. Prior predictive sane for domain scale.
2. Sampler compatible with variable types/geometry.
3. Convergence metrics pass (`r_hat`, ESS, divergences).
4. Posterior predictive captures key data structure.
5. Model criticism done for domain-specific failure modes (time, space, censoring, latent dynamics).
6. Comparison and sensitivity checks completed for key assumptions.

When in doubt: simplify model first, validate each block independently, then re-compose.