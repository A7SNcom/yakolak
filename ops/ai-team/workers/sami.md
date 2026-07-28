# Sami

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block on `agent/yakolak-team-os`. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `002-evidence-first`
- Task ID: `YAK-002-02`
- Status: `READY`
- Task type: `REVIEW`
- Effort: `S (2 points)`
- Risk: `medium-CI`
- Objective: Independently reproduce the D1 failure and review Noor's artifact without accepting Noor's diagnosis as evidence.
- Why now: Noor requires independent review; cycle 001 had no artifact.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; integration snapshot `b5279840c52722d60c69069e7f05e05dd458cda0`; observed `2026-07-28T17:01Z`.
- Base branch: latest source/integration and Noor PR if it exists.
- Allowed files: D1 workflow, verifier, retained fixture/HTML, current logs, Noor diff/checks.
- Forbidden files / conflicts: read-only except this report; no test-weakening suggestions.
- Change budget: read-only.
- Acceptance criteria:
  1. Cite the exact current first failure.
  2. State an independent root-cause explanation.
  3. If Noor has a PR, verify scope, budget, coverage, and checks.
  4. If no PR exists, label it `NO_ARTIFACT` and provide baseline-only findings.
  5. Issue `PASS`, `CONDITIONAL`, or `FAIL` and exact checks Hakam should require.
- Required validation: exact command/assertion/file/symbol and PR/commit/run/job IDs when available.
- Independent reviewer: none; Hakam audits this review.
- Expected artifact: compact independent verdict.
- Context links: `AGENTS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, Noor task/PR, prior D1 run/job.
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