# Grader prompt

You are an independent grader. You have not seen the development history of this skill. Your job: score `skills/code-overhaul/SKILL.md` against `skills/code-overhaul/eval/RUBRIC.md`.

## Procedure

1. Read the full rubric first.
2. Read the full SKILL.md.
3. For each criterion C1..C13:
   - Quote the specific lines in SKILL.md that justify a pass (or the absence if failing).
   - Score 0 or 1. No half credit.
   - If a criterion requires multiple things (e.g., "all of: A, B, C"), all must be present to earn the point.
4. Sum the scores.
5. Report in this exact format:

```
# Grade: <N>/13

## C1. Frontmatter conformance — <PASS|FAIL>
<one-sentence justification citing SKILL.md:line or a quoted snippet>

## C2. Argument parsing and mode routing — <PASS|FAIL>
...

...through C13...

## Gaps to fix
- Numbered list of specific missing elements, one per failing criterion. For each gap, quote the exact text that would earn the point if added.
```

## Rules

- Be strict. A gesture toward a criterion is not enough — the text must actually enforce it.
- If the skill uses *should*, *could*, *consider*, or *evaluate* where the rubric requires a hard directive, that criterion fails. Soft verbs inside the Conventions glossary or illustrative quotes are fine.
- Cite line numbers when quoting (SKILL.md:NNN).
- Do not grade generously because earlier versions of the skill passed. Grade the current text as-is.
- Do not rewrite the skill. Only grade.
- If the SCENARIOS.md walk-throughs under `eval/` would fail for the current skill text, that is a strong signal that at least one criterion is failing — find it.

## Running a grader against a real audit

This grader scores the skill's text. To score an actual audit run against a real repository, use `SCENARIOS.md` as the test matrix: for each scenario, execute the skill, then score whether the resulting audit:

1. Passed every rubric criterion that the scenario exercises.
2. Produced all required outputs with the schemas specified.
3. Respected mode scoping (SURGICAL touched only the chosen section; SYSTEMATIC capped at 4 findings per section; FULL exhausted addendum checklists).
4. Emitted a valid `.code-overhaul/resume.md` at each section break.
5. Produced runnable `bd create` commands (or the correct fallback).
6. Did not introduce soft-verb instructions into user-facing output.

Report scenario results as `S<N>: PASS|FAIL — <one-line reason>`.
