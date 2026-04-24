# Changelog

Semver: MAJOR for protocol-breaking changes, MINOR for additive features, PATCH for clarifications and fixes.

The current version is recorded in the YAML frontmatter of `SKILL.md`.

## 2.1.0 — 2026-04-20

Closes ambiguities and fills capability gaps surfaced by independent grading against the rubric. Rubric-level behavior is unchanged; enforcement and schemas are tightened.

### Added
- **Security integration** block under Step 2 — trust-boundary pass in Section 1, secrets-in-code grep in Section 2, auth-test verification in Section 3, vulnerability scan in Section 5. Security never gets its own section.
- **Dirty-working-tree advisory** in preflight using `git status --porcelain | wc -l`; audit proceeds but metrics are flagged as committed-state-only.
- **Retrospective-learning tiers** in Step 0.6 — tier-1 `⚑ hotspot` auto-promotes to DO FIRST; tier-2 promotes one matrix cell.
- **Counting rule** for required outputs — Approved = A/B only; Defer → NOT in scope; SURGICAL-skipped sections show `—`.
- **De-duplication rule** — a root cause crossing sections is filed in the most-consequential one with inline `See also <id>` cross-references.
- **Three-part finding ID** — `<section>.<finding><letter>` (e.g., `3.2B`); pre-approval references use `<section>.<finding>`.
- **Mandatory-scan statement** on addendum bullets — every bullet in a matching addendum sub-section is a scan item, not a suggestion.

### Changed
- **SURGICAL finding cap** set to 3 per chosen section (previously uncapped inside that section).
- **Checkpoint timing** unified: `.code-overhaul/resume.md` is written after the user resolves the section-close AskUserQuestion (Approve or Pause), not before; Revise does not rewrite the checkpoint.
- **Per-finding AskUserQuestion removed.** The Finding Template now produces a Recommendation letter; Approval/override is batched at the section-close question. This eliminates up to 20 prompts per full audit.
- **Defer option** now carries explicit zero labels (`effort: 0, risk: 0, blast radius: 0, maintenance: 0, reason: <one line>`) so the label grammar is uniform across all three options.
- **Module-tag slug priority** rewritten as an ordered list: directory → package name → AskUserQuestion confirmation.
- **Pause-exception wording** changed from "before any finding is recorded" to "with zero approved findings" (covers the all-Defer case).
- **Resume schema** expanded: `written_at` (ISO-8601), `findings[]` with `id/tag/title/chosen`. The undefined `snapshot:` field was removed.

### Protocol-breaking
- Resume files written by 2.0.x are readable but missing `written_at` and `findings[]`; the skill treats them as stale and prompts fresh-vs-resume.

## 2.0.0 — 2026-04-20

Full rewrite. Removes ambiguous instructions and aligns the skill with the rubric under `eval/`. 1.x is preserved only in git history.

### Added
- **Preflight** step that probes for `bd`, `git`, and a prior resume file, with explicit fallbacks per missing tool.
- **Step 0 table** — every repo-health metric now has a runnable measurement command and a threshold. Stack addendums extend the table with stack-specific metrics.
- **Step 0.5 scope-risk heuristic** (SMALL / MEDIUM / LARGE buckets) that feeds a recommendation into Step 1.
- **Step 0.6 retrospective learning** — historically buggy files, reverts, large "fix" commits; a file appearing in all three lists is a tier-1 target.
- **Degenerate-repo handling** — no tests, no git history, single-file, no deps each have explicit per-section instructions.
- **Scope-drift rule** — expansion requests require a mode re-prompt, never silent widening.
- **Explicit `Finding Template`** — NUMBER+LETTER scheme with required fields (evidence, options with S/M/L effort/risk/blast/maintenance, directive letter, mandatory AskUserQuestion).
- **Fixed section-close question** — one canonical question with three option branches (Approve / Revise / Pause).
- **Output templates** for Impact/Effort matrix, NOT in scope, What already exists, Deferred work → Beads (with bd-absent fallback), Diagrams, Failure modes, Migration/rollback, Execution order, Completion summary, Unresolved decisions.
- **Characterization-tests-first** hard gate in Execution order: any recommendation touching untested code produces a characterization-test step ahead of the change.
- **Failure-mode review** as a required non-skippable output; `no-test + no-handling + silent` → critical gap with priority uplift.
- **Resume behavior** — `.code-overhaul/resume.md` checkpoint after each section; `resume` argument re-enters at `next_section`.
- **Batched beads confirmation** — single AskUserQuestion covering all proposed `bd create` commands with `File all / Skip selected / File none`.
- **Monorepo tagging format** — every finding begins with `[<module>]` using short lowercase slugs.
- **Conventions glossary** — directive vs soft verbs, evidence requirement, module tags, context-tight priority order.
- `eval/` directory with `RUBRIC.md`, `GRADER.md`, `SCENARIOS.md` used to validate changes to the skill.

### Changed
- `description` rewritten to front-load the trigger action and include natural-language invocation phrases.
- `argument-hint` added (`[surgical|systematic|full|resume] [path]`).
- `allowed-tools` slimmed to Read/Grep/Glob/Bash (AskUserQuestion is built-in).
- All soft verbs (*consider*, *evaluate*, *should*) removed from mandatory steps.
- Stack addendums reorganized to mirror the generic structure one-to-one: Step 0 additions → Architecture → Code quality → Tests → Performance → Modernization → Summary additions → Anti-pattern(s).
- Dependency classification (outdated vs replaceable vs unmaintained) made explicit in Section 5.

### Removed
- Vague "Offer three modes" phrasing — replaced by an explicit AskUserQuestion invocation with fixed options.
- Unbounded "STOP. AskUserQuestion." placeholder — replaced by the fixed section-close question with branch logic.
- Orphaned "Retrospective learning" section — reassigned to Step 0.6 with defined output.

### Protocol-breaking
- Sessions/resume files from any 1.x snapshot are ignored. Start fresh after upgrading.

## 1.0.0 — 2026-02

Initial release. Five review sections, three modes, stack addendums for iOS/Swift, Go, and Web. No preflight, no resume, no fixed output templates beyond the Impact/Effort matrix and Completion Summary. Kept in git history only.
