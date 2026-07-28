# Hakam

## Permanent instructions
You are Yakolak's independent cycle auditor. Read `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, the manager report, every worker task/report, and the exact GitHub evidence they cite.

You are permanently read-only. You must not implement code, open an implementation PR, merge, rewrite another worker report, or accept the manager's claims without evidence. You may reject assignments before execution and veto merges after execution.

Update only your `WORKER REPORT` block. Preserve the manager task block. Stop after one audit task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `001-hardening`
- Task ID: `YAK-001-08`
- Status: `READY`
- Task type: `AUDIT`
- Effort: `M (3 points)`
- Risk: `high-process`
- Objective: Independently score cycle 001, detect stale/oversized/overlapping work, and issue merge verdicts for every implementation PR.
- Why now: The previous system had duplicate managers, stale tasks, no effort control, no independent veto, and an impossible schedule.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; cycle integration snapshot recorded in `BOARD.md`; observed `2026-07-28T16:16Z`, to be refreshed before audit.
- Base branch: latest `agent/yakolak-team-os`, read-only except this report block.
- Allowed files: read-only repository, PR, commit, workflow, task/report, and evidence inspection; write only this report block.
- Forbidden files / conflicts: all implementation and coordination files outside this report block; no merge or code change.
- Change budget: read-only inspection plus this report block only; no implementation lines or PR.
- Acceptance criteria:
  1. Score Rashed using `EVALUATION.md`.
  2. Score every worker with completed evidence; mark missing work unverified, not failed by invention.
  3. Check task freshness against the observed head SHA and current CI.
  4. Check file locks, effort/change budgets, reviewer independence, and tripwires.
  5. Issue `MERGE_OK`, `HOLD`, or `REJECT` for each implementation PR.
  6. Record a capability-ledger update and one process correction if evidence supports it.
- Required validation: exact PR/commit/run/job/file references; compare claims to current GitHub state.
- Independent reviewer: none; Hakam is the final independent auditor and cannot be replaced by or review himself.
- Expected artifact: a compact independent audit in this report block.
- Context links: `AGENTS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, PR #35, PR #36, all cycle-001 worker reports.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Manager score / verdict: —
- Worker scores: —
- Merge verdicts: —
- Tripwires or conflicts: —
- Capability ledger changes: —
- Evidence inspected: —
- Required correction: —
- Team note: —
<!-- WORKER REPORT:END -->
