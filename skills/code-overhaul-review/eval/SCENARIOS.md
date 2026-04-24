# Eval scenarios

Sample inputs to sanity-check the skill end-to-end. A grader is not required to run these — they exist so a human or a secondary agent can walk through and verify the skill gives sane answers. Every scenario below lists the expected behavior against the current rubric. If the skill diverges, that's a rubric-failing bug.

---

## S1. SURGICAL — single-section audit on a medium Go repo

**Input:** `/code-overhaul surgical ~/Work/api-service`

**Repo profile:** ~250 Go files, 18k LOC, has `go.mod`, `go vet` clean, no `staticcheck` present, `go test -race` passes.

**Expected:**
- Preflight detects `bd: ok`, `git: ok`, no resume file.
- Step 0 runs with Go addendum: lists `go vet: 0`, `staticcheck: n/a (not installed)`, `govulncheck` if installed, go version from `go.mod`, churn/fix-pattern lists.
- Scope-risk bucket: MEDIUM.
- Step 1 is **skipped** (mode passed on invocation). The skill asks instead: "Which section?" with five options.
- User picks `2 Code quality`. Only Section 2 runs.
- Findings use the NUMBER+LETTER template; `staticcheck` absence becomes a Section 2 finding (tooling gap), not a silent skip.
- `.code-overhaul/resume.md` is written at section close with `completed_sections: [2]`.
- Completion Summary has `Mode: surgical`, `Status: complete`, `Dependencies: — (not scanned)`.

---

## S2. SYSTEMATIC — iOS/Swift app, full walk-through

**Input:** `/code-overhaul systematic ~/Work/PhotoApp`

**Repo profile:** SwiftUI + some UIKit, `Package.swift` with iOS 16 deployment target, 800 Swift files, 42 force-unwraps, SwiftLint present.

**Expected:**
- Preflight: all green.
- Step 0 runs with iOS/Swift addendum: Xcode warnings, SwiftLint violations, force-unwrap count, `try?` count all appear in the table.
- Bucket: MEDIUM.
- Step 1 recommends B) SYSTEMATIC. User confirms.
- All five sections run; each capped at 4 findings.
- Section 2 lists force-unwraps as a finding with a table of `path:line` occurrences, options include `A) Replace top-20 offenders with guard/if-let`, `B) Add linter rule + fix-forward`, `C) Defer`.
- After each section, the fixed section-close question fires; user answers A each time.
- `.code-overhaul/resume.md` is overwritten after every section.
- Final outputs include Failure-modes table with at least one `no/no/silent` row marked ⚠ and priority-uplifted in Execution order.
- Completion Summary contains iOS-specific rows (`Min iOS target`, `Swift version`, `Force-unwrap count`, `SwiftLint violations`).

---

## S3. FULL AUDIT — Web monorepo with two stacks (Node + Go)

**Input:** `/code-overhaul full ~/Work/platform`

**Repo profile:** root has `package.json` (Next.js front-end in `web/`), plus `go.mod` in `services/api/`. Both Web/JS/CSS and Go addendums apply.

**Expected:**
- Preflight: all green.
- Step 0 table has both Go rows and Web rows, side by side.
- Bucket: LARGE → recommendation C) FULL, but the skill flags a time warning.
- All five sections run with no finding cap. Every finding is prefixed `[web]` or `[api]` (or `[services/api]` if the skill uses directory names). Inconsistent tags across findings is a rubric-failing bug.
- Dependency graph in Section 1 shows web↔api boundary and any HTTP/RPC contract.
- Failure-mode table rows are scoped per codepath with module tags.
- Deferred work → Beads emits runnable `bd create` commands, with `--labels "tech-debt,overhaul"`, and `bd dep add` between inter-stack items.
- Single batched AskUserQuestion fires before any `bd create` runs.

---

## S4. No tests + no git history (degenerate repo)

**Input:** `/code-overhaul ~/tmp/prototype`

**Repo profile:** fresh directory, three `.py` files, no tests, no `.git`, no manifest.

**Expected:**
- Preflight: `git: absent`, `bd: absent`.
- Step 0 runs partial: file count, LOC, platform version; skips churn, retrospective learning, dependency drift with `n/a (no git history)` and `n/a (no manifest)`.
- Degenerate-repo advisory printed: `Retrospective learning: n/a (no git history).` and `No third-party dependencies detected.`
- Step 1: the skill offers SURGICAL only (single-file / near-empty refusal rule).
- Section 3 becomes "Test creation plan". Any subsequent refactor recommendation must be blocked behind characterization-tests-first.
- Deferred-work output is a markdown checklist (bd absent) with the advisory line at the top.

---

## S5. Resume after a pause

**Input (first run):** `/code-overhaul systematic ~/Work/tool` → user hits Pause after Section 2.

**Input (second run, later):** `/code-overhaul resume ~/Work/tool`

**Expected first run:**
- `.code-overhaul/resume.md` contains `mode: systematic`, `completed_sections: [1, 2]`, `next_section: 3`, `snapshot: <path>`.
- Completion Summary is emitted with `Status: paused at section 2`.

**Expected second run:**
- Preflight: `resume: available`.
- Skill reprints a compact form of Section 1 + Section 2 findings, restates chosen mode, resumes at Section 3.
- The fixed section-close question fires at the end of Section 3 and the resume file is overwritten with `completed_sections: [1, 2, 3]`.
- If the resume file is >7 days old, the skill asks fresh-vs-resume before reprinting.

---

## S6. Scope drift mid-audit

**Input:** Mid-SURGICAL audit on Section 4 (Performance). User types "also check the test suite."

**Expected:**
- Skill does not silently add Section 3 findings.
- Skill re-issues the Step 1 mode question, framed: "That expands scope. Switch mode to [systematic] or keep scope and queue the test-suite review as a follow-up?"
- User response drives behavior. If keep-scope, test-suite request becomes a queued bead in the Deferred-work output.

---

## S7. bd present but the command fails

**Input:** `/code-overhaul systematic ~/Work/svc` where `bd create` returns non-zero (e.g., Dolt server misconfigured).

**Expected:**
- Skill surfaces the error inline and offers: A) Retry, B) Switch to checklist fallback, C) Skip filing. The batched confirmation is still single-shot.
- If the user picks B, the skill emits the markdown checklist with the bd-absent advisory line and completes.
- The skill does **not** silently re-prompt per-issue.

---

## Using these scenarios

A secondary agent walking these scenarios should record a one-line result per scenario:

```
S1: PASS — surgical scoped to Section 2, resume written, tooling gap captured as finding
S2: PASS — all five sections, iOS rows in summary, force-unwrap finding surfaced
...
```

Any FAIL result must cite the rubric criterion the scenario violates.
