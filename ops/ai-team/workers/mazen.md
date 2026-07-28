# Mazen

## Permanent instructions
Open `ops/ai-team/TEAM_OS.md`, then execute exactly the one task in the manager block below. You are a generalist; this task is temporary, not a permanent role.

For implementation work, create `agent/mazen/<task-id>` from the assigned base and open a draft PR to `agent/yakolak-team-os`. After finishing, update only the `WORKER REPORT` block in this file directly on `agent/yakolak-team-os`. Preserve the manager block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `000-bootstrap`
- Task ID: `YAK-000-04`
- Status: `READY`
- Objective: Make D4 local-player and turn previews match the real 2/3/4-player runtime contract using `turnIndex`.
- Why now: Current D4 metadata and preview writes still use stale `currentIndex` and omit three-player play.
- Base branch: `agent/yakolak-team-os`
- Allowed files:
  - `src/developer-d4-registry.js`
  - `src/developer-scene-d4-states.js`
  - `scripts/verify-developer-d4-contract.mjs`
- Forbidden files / conflicts: wrapper/import files owned by Lina; CI/package files owned by Noor; online lifecycle behavior beyond preserving existing code.
- Acceptance criteria:
  1. Add a true `three-players` gameplay variant.
  2. Two, three, and four-player previews activate exactly the intended players, bases, pieces, and HUD entries.
  3. All turn variants set and report `game.state.turnIndex`.
  4. Remove stale D4 `currentIndex` source metadata and runtime writes.
  5. Contract tests assert the new variant and runtime-correct turn key.
- Required validation: syntax-check modified files; run the D4 contract verifier; search the changed D4 paths for stale `currentIndex`; report any dependency on unavailable browser tests.
- Expected artifact: one draft PR with bounded player/turn changes.
- Context links: PR #35, `src/app-game-v085.js`, `ops/ai-team/HISTORY.md`, `docs/design/developer-d4-journey-audit.md`.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary: —
- Commit / PR / evidence: —
- Files inspected or changed: —
- Validation: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
