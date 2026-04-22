# code-overhaul SKILL.md rubric

13 criteria, 1 point each. Target: 13/13.

Each criterion lists what the SKILL.md must contain to earn the point. A grader reads `skills/code-overhaul/SKILL.md` and scores 0 or 1 per criterion with a one-sentence justification. Half credit is not allowed — either the SKILL.md has it or it doesn't. This keeps iterations honest.

---

## C1. Frontmatter conformance

The YAML frontmatter uses the official Claude Code skill schema for discovery and invocation.

Pass if **all** of:
- `name:` uses lowercase hyphen-case and matches the skill directory name.
- `description:` opens with a directive verb (the action the skill performs) and contains natural-language trigger phrases a user would say (e.g., "review this codebase", "audit this repo").
- `argument-hint:` lists the valid modes plus `resume`, matching the invocation section.
- `allowed-tools:` names every shell / file tool the skill actually calls (Read, Grep, Glob, Bash). AskUserQuestion may be omitted (built-in).

## C2. Argument parsing and mode routing

The skill accepts explicit modes and routes interactively when none is passed.

Pass if **all** of:
- `surgical`, `systematic`, `full`, and `resume` are each named explicitly.
- Path argument behavior is documented (defaults to current directory).
- If a mode is passed explicitly, the interactive mode prompt in Step 1 is skipped.
- Resume reads a persisted file and skips to the recorded section.

## C3. Preflight environment detection with fallbacks

Before any audit work, the skill probes the environment and specifies concrete fallback behavior for every missing tool.

Pass if **all** of:
- A preflight block enumerates tool checks (`bd`, `git`), repo-root resolution, and a working-tree cleanliness probe.
- The `bd: absent` fallback specifies what the Deferred-work output becomes instead (plain checklist) and requires an explanatory line.
- The `git: absent` fallback specifies skipping retrospective learning with a stated note.
- Dirty-tree handling is stated explicitly (print an advisory, do not abort).
- Preflight results are surfaced as a visible table before Step 0.

## C4. Executable Step 0 with measurements and thresholds

Step 0 is a concrete measurement pass, not a prose checklist.

Pass if **all** of:
- Every generic metric has a runnable shell command (or explicit delegation to "stack-specific").
- Every metric has a threshold or an `informational` label (the grader can answer "what counts as a finding?").
- The output shape is a table printed before Step 1.
- A repo-size bucket (SMALL / MEDIUM / LARGE) is computed from the measurements.
- Retrospective-learning queries (git history) are specified with exact `git` commands.

## C5. Stack detection, addendum application, and monorepo tagging

The skill auto-activates stack-specific addendums and keeps monorepo findings unambiguous.

Pass if **all** of:
- At least three addendums (iOS/Swift, Go, Web/JS/CSS) are present.
- Each addendum lists Triggers (file markers) that a shell glob can evaluate.
- Each addendum mirrors the generic structure: Step 0 additions → Architecture → Code quality → Tests → Performance → Modernization → Summary additions → Anti-pattern.
- Monorepo tag format is specified exactly (e.g., `[<module>]` with lowercase slug) and required on every finding when >1 stack matches.

## C6. Scope commitment and drift handling

Mode selection is blocking; scope changes are not silent.

Pass if **all** of:
- Step 1 calls AskUserQuestion with a fixed question, three labelled options (A/B/C), and a recommendation seeded from the repo-size bucket.
- The skill explicitly blocks further work until the user responds.
- A scope-drift rule is documented: if the user requests expansion mid-audit, the skill re-issues the mode question before complying.
- Mode caps are numeric and explicit: SURGICAL ≤ 3 findings for the chosen section, SYSTEMATIC ≤ 4 per section, FULL no cap.
- SURGICAL mode additionally asks which section to run.

## C7. Finding schema is mandatory and complete

Findings use a single shape; free-form findings are forbidden.

Pass if **all** of:
- A `Finding Template` block appears with: three-part ID (section.finding), module tag, problem statement, evidence (path:line or command), 2–3 options each with effort/risk/blast-radius/maintenance labelled S/M/L, a `Defer` option with zero labels (`effort: 0, risk: 0, blast radius: 0, maintenance: 0`), and a Recommendation letter with an engineering-preference rationale.
- The template states that recommendations are batched — approval/revision is handled by the section-close AskUserQuestion rather than one prompt per finding.
- The template is referenced from every review section (1–5) or the template is defined before the sections and explicitly stated as mandatory for all sections.
- "No free-form findings" or equivalent exclusion is stated.

## C8. Section pauses are enforced with fixed questions and branches

Every section ends with a blocking, schema'd AskUserQuestion.

Pass if **all** of:
- A single fixed section-close question is defined verbatim and reused for every section.
- Three options (Approve / Revise / Pause) are enumerated with their consequences.
- Branch logic is specified: Approve → next section; Revise → re-emit affected findings and re-ask; Pause → jump to Completion Summary with `Status: paused`.

## C9. Required outputs have concrete templates

Every required output has a fixed shape so runs are comparable.

Pass if **all** of:
- Impact/effort matrix: ASCII quadrant template with ID slots.
- NOT in scope: markdown table with `| id | finding | reason |`.
- What already exists: bulleted list with `path:line` citations required.
- Deferred work → Beads: `bd create` command template AND fallback checklist spec.
- Failure modes: table with `codepath | failure | test? | handling? | visible?` plus critical-gap escalation rule.
- Migration/rollback: table scoped to L blast-radius items with `incremental | rollback | coexistence | verification`.
- Execution order: numbered steps with `[blocked-by: …] [ships-alone: …]` annotations.
- Completion summary: ASCII box with every listed row.

## C10. Beads integration with verified syntax, fallback, and batched confirmation

The skill's beads usage is correct and degrades gracefully.

Pass if **all** of:
- The `bd create` command uses real flags in long or short form (`--title`/positional, `--type`, `--priority`, `--description`, `--labels`).
- `bd dep add` is shown for linking dependent issues.
- Batch confirmation is required (single AskUserQuestion covering all proposed issues with File-all / Skip-selected / File-none), not one prompt per issue.
- bd-absent fallback is specified with the exact advisory line to print.

## C11. Characterization-tests-first and failure-mode gates

Two non-negotiable gates bind the skill's output:

Pass if **all** of:
- Execution order explicitly states: if a recommendation touches untested code, the first step is the characterization-test plan (not the change).
- A failure-mode table is required output and cannot be skipped.
- The rule `no-test + no-handling + silent → critical gap` is stated, with the priority-uplift consequence.

## C12. Degenerate-repo and edge-case handling

The skill behaves sensibly on unusual repos instead of drifting.

Pass if **all** of:
- `no tests detected` → Section 3 becomes a test-creation plan; refactor-of-untested-code is blocked.
- `no git history` → Step 0.6 is skipped with a printed note.
- `single-file` or `near-empty` repo → SURGICAL only; SYSTEMATIC/FULL refused with a stated reason.
- `no dependency manifest` → Section 5 output is the single stated line.

## C13. Resume behavior with checkpoint persistence

The audit is resumable and version-aware.

Pass if **all** of:
- After each section-close AskUserQuestion resolves (Approve or Pause, not Revise), the skill writes `.code-overhaul/resume.md`.
- The resume file schema lists at minimum `version`, `mode`, `target`, `written_at`, `completed_sections`, `next_section`, and a `findings` list capturing `id`, `tag`, `title`, `chosen`.
- `resume` invocation reads the file, reprints completed findings in compact form, and resumes at `next_section`.
- Resume files whose `written_at` is older than 7 days trigger a fresh-vs-resume AskUserQuestion prompt.

---

## Scoring

Total = sum of criteria. Pass = 13/13.

Partial matches score 0. No partial credit. A skill that says "should" where it must say "must", or that gestures toward a requirement without enforcing it, fails the relevant criterion.
