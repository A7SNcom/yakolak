# Sami

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block on `agent/yakolak-team-os`. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `001-hardening`
- Task ID: `YAK-001-02`
- Status: `READY`
- Task type: `REVIEW`
- Effort: `S (2 points)`
- Risk: `medium-CI`
- Objective: Independently identify the current D1 root cause and review Noor's proposed fix for correctness and preserved coverage.
- Why now: Noor must not self-validate a CI repair, and the previous process used stale conclusions.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; D1 run `30377398315`, job `90336466217`; observed `2026-07-28T16:16Z`.
- Base branch: read-only latest source/integration and Noor PR if available.
- Allowed files: D1 workflow, retained D1 HTML/fixture, D1 verifier scripts, current logs, Noor PR diff and checks.
- Forbidden files / conflicts: no repository writes except this report block; no test deletion/skip suggestions; do not edit Noor's branch.
- Change budget: read-only.
- Acceptance criteria:
  1. State the exact first failing assertion/command with evidence.
  2. Explain the smallest valid root-cause fix independently of Noor's explanation.
  3. Check Noor's diff stays within scope/budget and preserves intended assertions.
  4. Issue `PASS`, `CONDITIONAL`, or `FAIL` with specific reasons.
  5. State the exact checks Hakam should require before merge.
- Required validation: cite run/job/step, exact file/symbol/assertion, Noor commit/PR/check IDs if present.
- Independent reviewer: none; Hakam audits this review.
- Expected artifact: a compact review verdict in this report block.
- Context links: `AGENTS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, run `30377398315`, job `90336466217`, Noor task/PR.
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
