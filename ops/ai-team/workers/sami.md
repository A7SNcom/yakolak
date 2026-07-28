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
- OBSERVED: review only Noor PR for `YAK-004-01`; if no artifact exists, return `NO_ARTIFACT`.
- Single outcome: independently determine whether Noor's state contract is deterministic, bounded, tested, and free of browser/legacy coupling.
- Allowed scope: task contract, Noor diff/base/head, focused tests, architecture docs/guard output.
- Forbidden scope: no implementation, no rewriting Noor's solution, no acceptance from summary alone.
- Acceptance criteria: verify every binary criterion; inspect invalid-event semantics; verify no duplicate state source or forbidden dependency; reproduce focused test and architecture guard; issue `PASS | CONDITIONAL | FAIL` with exact evidence.
- Architecture/debt check: confirm legacy-debt delta `unchanged` and Slice 1 progress is honest.
- Stop conditions: no PR/commit, stale base, missing test evidence, or diff outside budget.
- Expected artifact: compact independent verdict for Hakam.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary / verdict: —
- Observed head / freshness: —
- Commit / PR / evidence reviewed: —
- Files inspected: —
- Validation: —
- Residual risks: —
- Required merge checks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
