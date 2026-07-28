# Mazen

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

For implementation, create `agent/mazen/<task-id>` from the latest assigned base and open one draft PR to `agent/yakolak-team-os`. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `001-hardening`
- Task ID: `YAK-001-04`
- Status: `READY`
- Task type: `IMPLEMENT`
- Effort: `M (3 points)`
- Risk: `high-game-state`
- Objective: Make D4 local-player and turn previews use the real 2/3/4-player and `turnIndex` runtime contract.
- Why now: Current D4 metadata/state writes omit three-player play and still reference stale `currentIndex`.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; integration implementation head `fbadc7de98303651c0e4f8c96117c602b59c23bf`; observed `2026-07-28T16:16Z`.
- Base branch: latest `agent/yakolak-team-os` after confirming target paths are materially unchanged.
- Allowed files:
  - `src/developer-d4-registry.js`
  - player/turn-only portions of `src/developer-scene-d4-states.js`
  - `scripts/verify-developer-d4-contract.mjs`
- Forbidden files / conflicts: D4 wrapper/import files; package/CI/D1 files; online lifecycle implementation; unrelated state/visual redesign.
- Change budget: at most 3 files and 180 logical changed lines.
- Acceptance criteria:
  1. Add a true `three-players` gameplay variant.
  2. 2/3/4-player previews activate exactly intended players, bases, pieces, and HUD state using existing runtime helpers/contracts.
  3. All four turn variants set and report `game.state.turnIndex`.
  4. Remove stale D4 player/turn `currentIndex` metadata/writes without touching unrelated legacy runtime code.
  5. Contract tests assert the variant set and runtime-correct turn key.
- Required validation: syntax-check changed files; run D4 contract verifier; search changed D4 paths for stale `currentIndex`; browser functional evidence if available.
- Independent reviewer: Sara.
- Expected artifact: one bounded draft PR with deterministic contract evidence.
- Context links: `AGENTS.md`, `ops/ai-team/BOARD.md`, actual player/turn contract in current game runtime, D4 registry/state/audit files.
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
