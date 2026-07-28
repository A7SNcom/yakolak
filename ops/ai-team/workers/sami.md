# Sami

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block on `agent/yakolak-team-os`. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `004-canonical-entry-contract`
- Task ID: `YAK-004-02`
- Status: `READY`
- Task type: `REVIEW`
- Effort: `S (2 points)`
- Risk: `high-architecture-state`
- Blueprint Node ID: `track-canonical-architecture`
- Blueprint Revision: `2`
- Objective: Independently determine whether Noor's state contract is deterministic, bounded, tested, and aligned with the documented blueprint without browser or legacy coupling.
- Why now: Noor's first canonical Slice 1 artifact requires a separate reviewer before Architecture Steward and Hakam decisions.
- Observed base/head: review only the exact Noor PR for `YAK-004-01`, based on `agent/yakolak-team-os` at or after `5d3871544031a84c553b27768ef00ef2a382b55d`, and blueprint `track-canonical-architecture@2`; if no artifact exists, return `NO_ARTIFACT`.
- Base branch: repository-wide read-only review of the exact assigned artifact and current integration head.
- Allowed files: Noor task contract, exact PR base/head/diff, changed canonical files, focused tests, architecture documents, blueprint node, and guard/test outputs.
- Forbidden files / conflicts: no implementation, no rewriting Noor's solution, no report edits outside Sami's report block, no acceptance from summaries, and no review against a stale blueprint revision.
- Change budget: read-only inspection plus Sami's report block.
- Acceptance criteria:
  1. Verify every Noor acceptance criterion against the diff and reproducible evidence.
  2. Confirm deterministic invalid-event semantics and absence of mutation leakage.
  3. Confirm no duplicate state source or forbidden dependency.
  4. Reproduce the focused test and architecture guard when accessible.
  5. Confirm the artifact matches `track-canonical-architecture@2` and report any blueprint mismatch.
  6. Issue `PASS`, `CONDITIONAL`, or `FAIL` with exact evidence.
- Required validation: exact PR/commit/diff references; focused Node test; architecture guard; current blueprint node/revision check.
- Independent reviewer: `none; Sami is the named independent reviewer and Hakam audits the verdict`.
- Stop conditions: no PR/commit, stale base, changed/unreconciled blueprint, missing test evidence, diff outside budget, or inaccessible required evidence.
- Expected artifact: compact independent review verdict for Hakam, or `NO_ARTIFACT` with exact evidence.
- Context links: `AGENTS.md`, `ops/ai-team/development-blueprint.json`, Noor task/report, `ops/ai-team/BOARD.md`, architecture documents, and Noor's exact PR.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary / verdict: —
- Observed head / freshness: —
- Blueprint node / revision: —
- Commit / PR / evidence reviewed: —
- Files inspected: —
- Validation: —
- Blueprint / debt / migration deltas: —
- Residual risks: —
- Required merge checks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
