# Noor

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

For implementation, create `agent/noor/<task-id>` from the latest assigned base and open one draft PR to `agent/yakolak-team-os`. Update only your `WORKER REPORT` block on the integration branch. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `001-hardening`
- Task ID: `YAK-001-01`
- Status: `READY`
- Task type: `IMPLEMENT`
- Effort: `S (2 points)`
- Risk: `medium-CI`
- Objective: Reproduce and fix only the earliest current Developer D1 structure failure without weakening D1 coverage.
- Why now: At source head `d8d2a50f...`, all listed shared regressions are green except D1 run `30377398315`, job `90336466217`.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; integration implementation head `fbadc7de98303651c0e4f8c96117c602b59c23bf`; observed `2026-07-28T16:16Z`.
- Base branch: latest `agent/yakolak-team-os` after verifying target files still match the observed implementation head.
- Allowed files: the single failing D1 verifier/fixture file and at most one directly required D1 fixture/workflow file identified by reproduction.
- Forbidden files / conflicts: D4 runtime/registry/state files, package-wide unrelated tests, worker/system files except this report block; no deleting/skipping/loosening assertions.
- Change budget: at most 2 files and 80 logical changed lines.
- Acceptance criteria:
  1. Record the exact first failing command/assertion from current reproduction or run logs.
  2. Patch its real root cause, not downstream symptoms.
  3. Preserve the intended D1 retained-surface coverage.
  4. The focused D1 structure command passes locally or in CI.
  5. No other regression is disabled, skipped, or weakened.
- Required validation: syntax-check changed JS/MJS; run the exact D1 structure command; run any directly affected verifier; attach command output or CI run/job IDs.
- Independent reviewer: Sami.
- Expected artifact: one bounded draft PR plus exact before/after failure evidence.
- Context links: `AGENTS.md`, `ops/ai-team/BOARD.md`, run `30377398315`, job `90336466217`, current D1 workflow/verifier files.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary: —
- Observed head / freshness: —
- Commit / PR / evidence: —
- Files inspected or changed: —
- Budget used: —
- Validation: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
