# Sara

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `002-evidence-first`
- Task ID: `YAK-002-06`
- Status: `READY`
- Task type: `TEST/REVIEW`
- Effort: `S (2 points)`
- Risk: `high-game-state`
- Objective: Independently challenge Mazen's runtime contract map and define the smallest executable test that prevents false-green player/turn previews.
- Why now: Your cycle-001 review established that URL/key checks are insufficient; this cycle must turn that finding into a bounded executable test design.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; integration snapshot `b5279840c52722d60c69069e7f05e05dd458cda0`; observed `2026-07-28T17:01Z`.
- Base branch: read-only latest source/integration and Mazen report when available.
- Allowed files: real player/turn runtime, D4 registry/state, current contract verifier, audit, browser-test patterns.
- Forbidden files / conflicts: no code changes; no import-wrapper or online-lifecycle review.
- Change budget: read-only.
- Acceptance criteria:
  1. Verify or contradict each source-of-truth symbol in Mazen's map.
  2. Specify test inputs and exact expected outputs for 2/3/4 players and four turns.
  3. Identify the smallest test file/scope that can run without browser flakiness.
  4. State what still requires browser desktop/mobile evidence after deterministic tests.
  5. Issue `PASS`, `CONDITIONAL`, or `FAIL` on the proposed next slice.
- Required validation: exact paths/symbols/assertions and evidence that the proposed test fails current baseline.
- Independent reviewer: none; Hakam audits this review.
- Expected artifact: executable evidence matrix and verdict.
- Context links: `AGENTS.md`, `ops/ai-team/BOARD.md`, Mazen report, Sara cycle-001 report, D4 contract/audit files.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary / verdict: —
- Observed head / freshness: —
- Evidence reviewed: —
- Executable evidence matrix: —
- Browser evidence still required: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->