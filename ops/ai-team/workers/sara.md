# Sara

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `001-hardening`
- Task ID: `YAK-001-07`
- Status: `READY`
- Task type: `TEST/REVIEW`
- Effort: `M (3 points)`
- Risk: `high-game-state`
- Objective: Independently review Mazen's player/turn contract and map the exact evidence needed to prevent a false-green D4 state preview.
- Why now: Player counts and turn ownership affect real game correctness, and static contract checks alone may miss broken rendered state.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; observed `2026-07-28T16:16Z`.
- Base branch: read-only latest source/integration and Mazen PR if available.
- Allowed files: Mazen PR/diff/checks; D4 registry/state/contract tests; actual game player/turn runtime; workflows and browser evidence scripts.
- Forbidden files / conflicts: no repository writes except this report block; no code changes; no online lifecycle review assigned to Nada.
- Change budget: read-only.
- Acceptance criteria:
  1. Verify `three-players` activates exactly three players/bases/piece sets/HUD entries.
  2. Verify all four turn variants use `turnIndex` and visibly identify the correct active color.
  3. Search changed D4 scope for stale `currentIndex` and distinguish unrelated legacy occurrences.
  4. Issue `PASS`, `CONDITIONAL`, or `FAIL` on Mazen's PR.
  5. Map static, deterministic, browser, desktop/mobile, and real-game evidence still required before release.
- Required validation: exact paths/symbols/assertions, Mazen PR/commit/check IDs, and current workflow/script behavior.
- Independent reviewer: none; Hakam audits this review.
- Expected artifact: review verdict plus compact release-evidence matrix.
- Context links: `AGENTS.md`, `ops/ai-team/BOARD.md`, Mazen task/PR, current game runtime, D4 registry/state/tests/audit.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary / verdict: —
- Observed head / freshness: —
- Commit / PR / evidence reviewed: —
- Files and symbols inspected: —
- Validation/evidence matrix: —
- Residual risks: —
- Required merge checks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
