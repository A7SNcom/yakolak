# Mazen

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This cycle is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `002-evidence-first`
- Task ID: `YAK-002-05`
- Status: `READY`
- Task type: `RESEARCH`
- Effort: `S (2 points)`
- Risk: `high-game-state`
- Objective: Produce an implementation-ready map of the real 2/3/4-player and turn ownership contract without changing code.
- Why now: Cycle 001 produced no implementation artifact, and Sara proved the current static verifier can be false-green.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; integration snapshot `b5279840c52722d60c69069e7f05e05dd458cda0`; observed `2026-07-28T17:01Z`.
- Base branch: repository-wide read-only inspection.
- Allowed files: current game runtime player setup, turn state, HUD, D4 registry/state files, focused tests/audits.
- Forbidden files / conflicts: no code or test changes; no wrapper/import or online lifecycle work.
- Change budget: read-only.
- Acceptance criteria:
  1. Identify exact source-of-truth symbols for player count, player order, active bases/pieces, HUD rows, `turnIndex`, and active color.
  2. Map expected values for 2/3/4-player previews and all four turns.
  3. Identify every stale D4 `currentIndex` use relevant to this contract.
  4. Propose one smallest future implementation slice within S effort.
  5. Define deterministic assertions that would fail the current baseline.
- Required validation: exact paths/symbols and current baseline values; no claims without source evidence.
- Independent reviewer: none; Sara independently challenges the map and Hakam audits both.
- Expected artifact: compact contract table and smallest implementation slice.
- Context links: `AGENTS.md`, `ops/ai-team/BOARD.md`, Sara cycle-001 report, current runtime and D4 contract files.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary: —
- Observed head / freshness: —
- Evidence inspected: —
- Runtime contract map: —
- Deterministic assertions: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->