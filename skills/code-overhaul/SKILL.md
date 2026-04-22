---
name: code-overhaul
version: 1.0.0
description: |
  Audit a codebase for maintenance and modernization. Challenges scope,
  reviews architecture/quality/tests/performance/dependencies, files
  deferred work via bd. Language-specific addendums for iOS/Swift, Go,
  and Web/JS/CSS activate automatically based on what's in the repo.
  Supports monorepos with mixed stacks.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

# Code Overhaul Review

Audit this codebase for maintenance, modernization, and overhaul. For every issue, state concrete tradeoffs, lead with an opinionated recommendation, and ask for input before assuming direction.

Health check, not feature review. Goal: identify highest-leverage changes for reliability, performance, maintainability, and dev velocity — then execute in disciplined order.

**Stack detection:** At the start of Step 0, scan the repo for language markers (\*.swift/Xcode projects, go.mod, package.json/tsconfig). For each stack detected, apply the matching addendum from the Language-Specific Addendums section below IN ADDITION to the generic section. For monorepos, apply multiple addendums and note which findings apply to which module/package.

## Priority hierarchy

Context low? Step 0 > Impact/effort matrix > Test diagram > Recommendations > Rest. Never skip Step 0 or the matrix.

## Engineering preferences

- DRY — flag repetition aggressively.
- Well-tested non-negotiable; too many > too few.
- "Engineered enough" — not fragile, not over-abstracted.
- More edge cases, not fewer; thoughtfulness > speed.
- Explicit over clever.
- Minimal diff: fewest new abstractions and files touched.
- Performance is a feature. Profile before and after.
- Prefer platform/stdlib over third-party when feasible.
- Deprecation warnings are bugs. Fix proactively.
- Build time matters. Justify anything that slows it.

## Diagrams

ASCII art for data flow, state machines, dependency graphs, pipelines, decision trees — in plans and inline code comments. Embed where behavior is non-obvious: models, services, views/controllers, tests.

**Diagram maintenance is part of the change.** Stale diagrams are worse than none. Flag even outside scope.

## BEFORE YOU START

### Step 0: Scope Assessment

1. **Repo health:** Compiler/linter warnings, deprecation warnings, TODO/FIXME/HACK density, dead code, unused imports, test pass rate, build time. (Add stack-specific tools per addendum.)
2. **Dependency landscape:** All third-party deps, current vs. latest. Flag: >1 major behind, unmaintained (12+ months), replaceable by platform APIs.
3. **Platform/language version floor:** Determines which modern APIs are available, which workarounds can die.
4. **Tech debt concentration:** Top 3–5 files/modules by size, churn, coupling, bug history.
5. **Complexity check:** >15 files or >3 new abstractions → challenge scope.

Offer three modes:

1. **SURGICAL:** One theme, minimal blast radius, one session.
2. **SYSTEMATIC:** Section-by-section interactive, ≤4 issues per section.
3. **FULL AUDIT:** All sections, all issues. Phased roadmap.

**Once chosen, commit fully.** No silent scope reduction.

## Review Sections

### 1. Architecture

Evaluate: module structure and boundaries (draw dependency graph), layering violations, data flow and sources of truth, concurrency/thread safety, routing/navigation consistency, scaling bottlenecks, security boundaries. For each major boundary: one realistic production failure and whether current code handles it. Identify where ASCII diagrams belong. Apply stack addendum.

**STOP.** AskUserQuestion. Do NOT proceed until user responds.

### 2. Code quality

Evaluate: file/folder organization, DRY violations, error handling gaps (cite file and line), naming consistency, tech debt hotspots, over-engineering and under-engineering, dead code, stale diagrams, linter/compiler warnings. Apply stack addendum.

**STOP.** AskUserQuestion. Do NOT proceed until user responds.

### 3. Tests

Diagram all critical flows, pipelines, state transitions, branching. For each: test exists? meaningful? edge cases covered? fast and reliable? Also: test distribution, execution time (flag slow tests), isolation, missing categories, mock strategy. Apply stack addendum.

**STOP.** AskUserQuestion. Do NOT proceed until user responds.

### 4. Performance

Evaluate: startup/launch time, memory footprint and leaks, response latency on hot paths, I/O patterns, network efficiency, build time, binary/bundle size. Apply stack addendum.

**STOP.** AskUserQuestion. Do NOT proceed until user responds.

### 5. Dependencies and modernization

Evaluate: outdated deps, replaceable deps, unmaintained deps, language modernization opportunities, toolchain hygiene, CI/CD health. Apply stack addendum.

**STOP.** AskUserQuestion. Do NOT proceed until user responds.

## For each issue

- File/line references.
- 2–3 options including "defer."
- Per option, one line: effort, risk, blast radius, maintenance burden.
- **Lead with directive:** "Do B. Here's why:"
- **Map to engineering preference** in one sentence.
- **AskUserQuestion:** "We recommend [LETTER]: [reason]" then `A) ... B) ... C) ...`. Label: NUMBER + LETTER (e.g., "3B").

## Required outputs

### Impact/effort matrix

```
                LOW EFFORT        HIGH EFFORT
           ┌─────────────────┬─────────────────┐
HIGH       │ DO FIRST         │ PLAN CAREFULLY   │
IMPACT     │ (quick wins)     │ (core overhaul)  │
           ├─────────────────┼─────────────────┤
LOW        │ IF TIME          │ SKIP / DEFER     │
IMPACT     │ (polish)         │ (not worth it)   │
           └─────────────────┴─────────────────┘
```

### NOT in scope

Deferred work, one-line rationale each.

### What already exists

Underused utilities, helpers, or patterns already in the codebase.

### Deferred work → Beads

```bash
bd create "<title>" -t <type> -p <priority> -d "<what, why, current state, where to start, prereqs>" -l "tech-debt,overhaul"
```

Ask before filing. Link with `bd dep add`.

### Diagrams

Before/after dependency graphs, refactored data flow, state machines. Identify files needing inline diagrams.

### Failure modes

Per modified codepath: one realistic failure → test covers it? error handling? user-visible or silent? No test + no handling + silent → **critical gap**.

### Migration / rollback

Incremental or all-or-nothing? Rollback plan? Old/new coexistence? Verification?

### Execution order

Numbered, respecting: (1) inter-change dependencies, (2) impact/effort priority, (3) tests before refactoring, (4) every step shippable.

### Completion summary

```
╔════════════════════════════════════════════════╗
║           CODE OVERHAUL SUMMARY                ║
╠════════════════════════════════════════════════╣
║ Mode:                 ___                      ║
║ Stacks detected:      ___                      ║
║ Warnings:             ___ compiler, ___ deprec ║
║ Dead code:            ___                      ║
║────────────────────────────────────────────────║
║ Architecture:         ___ issues               ║
║ Code quality:         ___ issues               ║
║ Tests:                ___ gaps                 ║
║ Performance:          ___ issues               ║
║ Dependencies:         ___ outdated, ___ replace║
║────────────────────────────────────────────────║
║ Quick wins:           ___                      ║
║ Core overhaul:        ___                      ║
║ Beads filed:          ___                      ║
║ Critical gaps:        ___                      ║
║ Execution steps:      ___                      ║
╚════════════════════════════════════════════════╝
```

Add stack-specific rows from addendums (e.g., force-unwrap count, `any` count, race-clean status).

## Retrospective learning

Git log: high-churn files, reverted commits, large "fix" commits, recurring patterns ("fix crash in…", "workaround for…"). Aggressive on historically problematic areas.

## Formatting

NUMBER issues, LETTERS for options. Recommended first. One sentence per option. Pause after each section.

## Unresolved decisions

List at end: "Unresolved decisions that may bite you later." Never silently default.

## Anti-patterns

- Big bang rewrites → incremental.
- Refactoring without tests → characterization tests FIRST.
- Gold plating → health, not perfection.
- Chasing new hotness → solve concrete problems only.
- Breaking the build → every commit compiles and passes tests.

---

# Language-Specific Addendums

Apply these when the corresponding stack is detected. For monorepos, apply all matching addendums and tag each finding with its module.

---

## Addendum: iOS / Swift

**Triggers:** _.swift files, _.xcodeproj, \*.xcworkspace, Package.swift with Apple platform targets.

### Step 0 additions

- Run: Xcode warnings count, SwiftLint violations, deployment target (min iOS version).
- Deployment target determines: SwiftUI API surface, structured concurrency availability, which UIKit workarounds can die.
- Dep audit specifics: SPM/CocoaPods/Carthage. Replaceable: Kingfisher→AsyncImage, Alamofire→URLSession async/await, SnapKit→modern AutoLayout, RxSwift→Combine/async-await, KeychainAccess→native keychain, SwiftyJSON→Codable, IQKeyboardManager→native keyboard avoidance.

### Architecture additions

- State management consistency: @Observable vs ObservableObject vs @State — pick one per concern, not mix-and-match.
- Navigation: NavigationStack vs coordinator pattern vs mixed — consistent?
- Concurrency model: structured concurrency adoption boundary vs legacy GCD/completion handlers. Where is the migration line?
- Core Data / SwiftData stack health. Extension targets sharing code correctly?

### Code quality additions

- **Force-unwraps and implicitly unwrapped optionals** — cite every one, these are crash sources.
- `try?` swallowing errors silently. Empty catch blocks.
- Retain cycle risks: missing `[weak self]` in closures, non-weak delegate properties.
- Unused @objc exposure, stale Storyboard/XIB connections, dead IBOutlets/IBActions.
- Massive ViewControllers/Views (>300 lines).
- Protocol-oriented over-engineering: protocol with one conformer, unnecessary associated types.

### Test additions

- XCTest vs Swift Testing adoption. UI test reliability (flag >10s per UI test).
- Test host app dependency — can unit tests run without app launch?
- Core Data tests using in-memory stores? Network tests using URLProtocol mocks?
- Total suite time matters with large test counts — flag >60s.
- Missing: snapshot tests for complex layouts, accessibility audit tests.

### Performance additions

- **Launch:** Pre-main (dylib loading, +load, static initializers) and post-main. Synchronous main-thread work in `didFinishLaunching`?
- **Main thread:** File I/O, JSON parsing, image decoding, Core Data fetches on main.
- **Scrolling:** Cell reuse, async image loading, Auto Layout ambiguity, offscreen rendering (cornerRadius + clipsToBounds).
- **Media:** Image downsample before display? PhotoKit fetch efficiency? Unnecessary format conversions?
- **Build:** Slowest files via `-Xfrontend -debug-time-function-bodies`. Complex type inference. SPM resolution time.
- **Binary:** Unused asset catalog entries, embedded resources that could be on-demand.

### Modernization additions

- Structured concurrency: async/await, actors, task groups.
- @Observable macro (iOS 17+), #Preview macros, @Entry for EnvironmentValues.
- Typed throws (Swift 6), strict concurrency checking readiness.
- Xcode hygiene: unused build phases, stale schemes, code signing drift, build settings at wrong level.

### Summary additions

Add rows: Min iOS target, Swift version, force-unwrap count, SwiftLint violations.

### Extra anti-pattern

- UIKit-to-SwiftUI migration without a boundary strategy → define the bridge pattern once, use everywhere.

---

## Addendum: Go

**Triggers:** go.mod, \*.go files.

### Step 0 additions

- Run: `go vet`, `staticcheck`, `golangci-lint`, `govulncheck ./...`, `go mod tidy` drift check.
- Go version in go.mod determines: range-over-func (1.23+), log/slog (1.21+), errors.Join (1.20+), generics depth, loop variable fix (1.22+).
- Dep audit specifics: `go list -m -u all`. Replaceable: gorilla/mux→stdlib 1.22+ routing, logrus→log/slog, pkg/errors→fmt.Errorf %w, testify→stdlib testing, go-playground/validator→custom, gorm→sqlc/sqlx, cobra→stdlib flag for simple CLIs.

### Architecture additions

- Package boundaries: `internal/` usage correct? Circular dep risks?
- Interface pollution: too many interfaces defined by implementor rather than consumer. Accept interfaces, return structs.
- Dependency injection: wire, manual, or scattered `init()`?
- Graceful shutdown chain: signal → context cancellation → resource cleanup.
- Error propagation: sentinel vs typed vs wrapping — consistent?
- Context: values vs cancellation — abuse?

### Code quality additions

- **Unchecked errors:** `_ = foo()` — cite every one unless justified with comment.
- Naked returns in complex functions.
- Package-level globals and `init()` abuse.
- Naming: Go conventions (MixedCaps, 1-2 char receivers, lowercase single-word packages). Stuttering (`user.UserService`).
- Over-engineering: interfaces with one implementation, unnecessary generics, Options pattern for 2 config values.
- Under-engineering: 2000+ line files, >5 params, `any`/`interface{}` where generics clarify.

### Test additions

- Table-driven tests consistent? `t.Helper()` used? Subtests with `t.Run()`?
- Integration tests tagged `//go:build integration`?
- **Race detector:** `go test -race` passing? This is a gate, not optional.
- Benchmarks for hot paths (`BenchmarkX`). Fuzz tests for parsers (`FuzzX`).
- Golden files for complex output. `testdata/` organized?
- Mocking: interfaces at boundaries only, not mocking everything. `httptest` for handlers.

### Performance additions

- **CPU:** Unnecessary allocations in tight paths, reflection in hot code, regexp compilation inside loops (compile once as package var), string concat in loops (strings.Builder).
- **Memory:** Goroutine leaks (unbounded spawn without context cancel), sync.Pool opportunities, slice pre-alloc (`make([]T, 0, cap)`), string↔[]byte in hot paths.
- **Concurrency:** Mutex contention (RWMutex? atomic?), channel buffer sizing, goroutine fan-out without limits (errgroup), context propagation gaps.
- **I/O:** Connection pool sizing, prepared statement reuse, N+1 queries, HTTP client reuse (not per-request), response body not closed, bufio for files.
- **Build:** CGO (slows build, complicates cross-compile), unnecessary `go generate`.
- **Binary:** `-ldflags "-s -w"`, `-trimpath`, unused dep bloat.

### Modernization additions

- Generics replacing `interface{}`/codegen where it clarifies (only with >2 concrete types).
- range-over-func (1.23+), log/slog, errors.Join, loop variable fix (1.22+) — remove workarounds.
- iter package (1.23+), any/comparable constraints.
- Toolchain: Makefile/Taskfile hygiene, golangci-lint config freshness, CI (test, vet, lint, race, vulncheck).

### Summary additions

Add rows: Go version (mod), go vet issues, staticcheck issues, govulncheck findings, unchecked errors, race clean Y/N.

### Extra anti-patterns

- Over-interfacing → one-method interfaces are Go's sweet spot, not the starting point.
- Premature generics → only when >2 concrete types and pattern is proven.

---

## Addendum: Web / JavaScript / CSS

**Triggers:** package.json, tsconfig.json, _.js, _.ts, _.jsx, _.tsx, _.css, _.scss, \*.html files.

### Step 0 additions

- Run: `tsc --noEmit` errors, ESLint/Prettier violations, `npm audit`, bundle size (total + per-route).
- TypeScript strict mode on? If not, migration path is high-priority.
- Browser floor (browserslist) determines: CSS nesting, :has(), container queries, structuredClone, AbortSignal.any, Promise.withResolvers.
- Dep audit: `npm outdated`. Replaceable: moment→Temporal/date-fns, lodash→native (Array.at, Object.groupBy, structuredClone), axios→fetch, classnames→clsx/template literals, uuid→crypto.randomUUID, node-fetch→native fetch (Node 18+).

### Architecture additions

- Component hierarchy (draw tree). State management: local vs global, prop drilling vs context vs store — consistent?
- Data fetching: per-component vs route-level vs centralized? Caching/dedup? Loading/error states?
- API layer: fetch calls scattered or centralized?
- SSR/SSG/CSR boundaries if applicable. Error boundary placement.
- Build config complexity. Environment handling.

### Code quality additions

**JS/TS:**

- **`any` types** — cite every one, these defeat TypeScript.
- `as` assertions bypassing safety. Loose equality (`==`).
- Uncaught promise rejections. Missing error boundaries.
- Barrel file bloat killing tree-shaking. Unused exports (`ts-prune`).
- Component files >300 lines.

**CSS:**

- Specificity wars, `!important` proliferation.
- Magic numbers without custom properties. Duplicated values needing design tokens.
- Unused CSS. Inconsistent naming (BEM vs utility vs random).
- z-index: documented scale or chaos? Media queries: scattered or centralized?
- CSS-in-JS vs stylesheets vs utility — consistent approach?

**HTML/Accessibility:**

- Semantic HTML (div soup?). ARIA: missing or wrong. Keyboard nav, focus management, color contrast, alt text, form labels, heading hierarchy.

### Test additions

- Unit (Jest/Vitest) for logic. Component (Testing Library) for behavior — flag `getByTestId` overuse, prefer `getByRole`/`getByText`.
- E2E (Playwright/Cypress) for critical paths. Visual regression for complex layouts.
- MSW for network mocking — consistent? Snapshot tests: useful or noise?
- Accessibility tests (axe-core). Suite speed: flag >30s total, >5s individual.

### Performance additions

- **Core Web Vitals:** LCP (critical rendering path), CLS (images without dimensions, font flash, dynamic injection), INP (long tasks, heavy handlers).
- **Bundle:** Per-route splits, tree-shaking effective?, dynamic imports for below-fold, duplicate deps, `source-map-explorer` analysis.
- **Loading:** Critical CSS inlined? Render-blocking resources? Font strategy (font-display, preload)? Images (WebP/AVIF, srcset, lazy load, explicit dimensions)?
- **Runtime:** Unnecessary re-renders (missing memo where measured), DOM thrashing, event listener cleanup, Web Worker opportunities, requestAnimationFrame for visual updates.
- **Caching:** Service worker strategy, HTTP headers, CDN, stale-while-revalidate, asset fingerprinting.
- **Network:** API waterfall (sequential→parallel), overfetching, missing pagination.

### Modernization additions

- CSS: native nesting (drop preprocessor nesting), container queries, `:has()`, View Transitions, Popover API, `<dialog>` (drop modal libs), `color-mix()`, `@property`.
- TS: strict mode path, `satisfies`, template literal types, discriminated unions, `using` (5.2+).
- Platform: structuredClone, Object.groupBy, Set methods, import attributes.
- Toolchain: bundler currency (Webpack→Vite?), Node version, package manager consistency, monorepo tooling, preview deployments.

### Summary additions

Add rows: Framework, TS strict Y/N, `any` count, ESLint violations, bundle size (gzip), npm audit vulns, LCP.

### Extra anti-patterns

- Premature abstraction → don't build a component system for 3 buttons.
- CSS reset whack-a-mole → fix the specificity model, not symptoms.
- `any` as escape hatch → every `any` is deferred debt with compound interest.
- Framework churn → migrate when solving a concrete problem, not for novelty.
