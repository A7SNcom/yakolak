# Noor

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

For implementation, create `agent/noor/<task-id>` from the latest assigned base and open one draft PR to `agent/yakolak-team-os`. Update only your `WORKER REPORT` block on the integration branch. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `002-evidence-first`
- Task ID: `YAK-002-01`
- Status: `READY`
- Task type: `INCIDENT/IMPLEMENT`
- Effort: `S (2 points)`
- Risk: `medium-CI`
- Objective: Freshly reproduce the earliest Developer D1 failure and either fix its single root cause or report an exact blocker with evidence.
- Why now: D1 is the only previously verified shared regression failure, but cycle 001 produced no artifact and stale logs cannot substitute for current reproduction.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; integration snapshot `b5279840c52722d60c69069e7f05e05dd458cda0`; observed `2026-07-28T17:01Z`.
- Base branch: latest `agent/yakolak-team-os` after re-reading `BOARD.md` and verifying target files.
- Allowed files: the exact first-failing D1 verifier/fixture file and at most one directly required D1 fixture/workflow file.
- Forbidden files / conflicts: D4 runtime/state files; package-wide unrelated tests; no assertion deletion, skip, inversion, or loosening.
- Change budget: at most 2 files / 80 logical changed lines.
- Acceptance criteria:
  1. Record exact command, first failing assertion, and current output.
  2. Explain the root cause before changing code.
  3. Produce one bounded fix or `BLOCKED` with exact missing prerequisite.
  4. Focused D1 command passes after the fix.
  5. No regression coverage is weakened.
- Required validation: syntax check changed JS/MJS; exact D1 command; directly affected verifier; attach commit/PR/run/job evidence.
- Independent reviewer: Sami.
- Expected artifact: draft PR or precise `BLOCKED`; absence of both is `NO_ARTIFACT`.
- Context links: `AGENTS.md`, `ops/ai-team/BOARD.md`, prior run `30377398315` / job `90336466217`, current D1 workflow and verifier.
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