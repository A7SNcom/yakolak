# Lina

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

For implementation, create `agent/lina/<task-id>` from the latest assigned base and open one draft PR to `agent/yakolak-team-os`. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `006-correction-closure`
- Task ID: `YAK-006-02`
- Status: `READY`
- Task type: `IMPLEMENT_PROCESS_GUARD`
- Effort: `S (2 points)`
- Risk: `medium-process-contract`
- OBSERVED: Omar diagnosed PR #43 AI Team OS failure as `STALE_VERIFIER`; `scripts/verify-ai-team-os.mjs` hard-codes obsolete literal labels while current canonical task contracts preserve the required semantics under labels such as `OBSERVED`, `Single outcome`, `Allowed scope`, `Forbidden scope`, `Validation`, and `Stop conditions`.
- Single outcome: make the verifier schema-aware so it accepts current semantic labels while continuing to reject genuinely incomplete task contracts.
- Why now: required team-system CI is red and blocks trustworthy review of PR #43; bypassing or weakening the verifier is forbidden.
- Architecture/debt impact: no game/runtime debt; governance invariant remains equal or stronger; President portal remains inactive.
- Base branch: latest `agent/yakolak-team-os`; create `agent/lina/yak-006-02` after verifying no competing verifier PR exists.
- Allowed scope: `scripts/verify-ai-team-os.mjs` plus one focused fixture/test file under `scripts/` or `tests/`; maximum 2 files / 100 logical changed lines.
- Forbidden scope: workflow disabling/skipping, PR #43 special-case, reducing required semantic fields, changing worker task contracts, portal/runtime/game files, dependencies, test deletion, broad refactor.
- Acceptance criteria:
  1. A versioned or explicit normalization layer maps accepted canonical aliases to required semantic fields.
  2. Current cycle-005/006 task contracts pass without PR-specific exceptions.
  3. An intentionally incomplete fixture fails for the exact missing semantic invariant.
  4. Effort, budget, reviewer, Architecture Steward/Hakam, locks, and human-gate checks remain enforced.
  5. Existing `Verify AI Team OS` command and syntax checks pass locally.
- Validation: `node --check scripts/verify-ai-team-os.mjs`; run verifier against repository; run positive and negative focused fixtures; report exact commands/results.
- Independent reviewer: Omar.
- Architecture Steward: not required; this changes process validation, not runtime/state/rules/network/bootstrap/dependencies.
- Stop conditions: correction needs workflow bypass, more than two files/100 lines, invariant meaning is ambiguous, or another active verifier correction exists.
- Expected artifact: one bounded draft PR to `agent/yakolak-team-os`; otherwise exact `BLOCKED` evidence.
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