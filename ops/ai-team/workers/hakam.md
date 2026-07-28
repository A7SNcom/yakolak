# Hakam

## Permanent instructions
You are Yakolak's independent cycle auditor. Read `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, the manager report, every worker task/report, and the exact GitHub evidence they cite.

You are permanently read-only. You must not implement code, open an implementation PR, merge, rewrite another worker report, or accept the manager's claims without evidence. Update only your `WORKER REPORT` block and stop after one audit task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `005-evidence-reconciliation`
- Task ID: `YAK-005-04`
- Status: `READY_AFTER_REPORTS`
- Task type: `AUDIT`
- Effort: `M (3 points)`
- Risk: `high-process-architecture`
- Single outcome: audit the refreshed cycle and issue exact verdicts for PR #41, PR #43, and Rashed's process recovery.
- Required evidence: current integration/PR heads and checks; Sami PASS; Nada exact-head Architecture Steward verdict; Omar verifier diagnosis; Sara exact-head PR #43 evidence; task/report freshness and scope.
- Acceptance criteria:
  1. Score Rashed and every evidenced worker; do not score `NO_TASK` as success.
  2. For PR #41, verify exact head, reviewer PASS, Nada verdict, focused tests, architecture guard, budget, debt/migration deltas, and issue `MERGE_OK | HOLD | REJECT`.
  3. For PR #43, keep HOLD unless AI Team OS is green, exact-head Preview/evidence exists, independent reviewer PASS exists, and no trust-boundary or human-gate defect remains.
  4. Verify no product implementation was performed by Rashed and no verifier was weakened.
  5. Keep PR #35/main/Production and other human gates protected.
- Forbidden scope: no implementation, merge, coordination edits, acceptance from manager assertion, or substitution of stale evidence.
- Stop conditions: any required worker report remains pending, head moved materially, or evidence is unavailable.
- Expected artifact: scores, capability updates, tripwires, required correction, and per-PR verdicts.
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
