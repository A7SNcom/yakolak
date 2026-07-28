# Lina

## Permanent instructions
Open `ops/ai-team/TEAM_OS.md`, then execute exactly the one task in the manager block below. You are a generalist; this task is temporary, not a permanent role.

For implementation work, create `agent/lina/<task-id>` from the assigned base and open a draft PR to `agent/yakolak-team-os`. After finishing, update only the `WORKER REPORT` block in this file directly on `agent/yakolak-team-os`. Preserve the manager block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `000-bootstrap`
- Task ID: `YAK-000-03`
- Status: `READY`
- Objective: Remove the nested relative-module Blob failure mode from the D4 game wrapper with the smallest clean change.
- Why now: D4 state previews must deterministically expose both game and online hooks before visual work is trustworthy.
- Base branch: `agent/yakolak-team-os`
- Allowed files:
  - `src/app-game-developer-d4.js`
  - one new focused verifier under `scripts/` if needed
  - `developer-scene.html` only if the wrapper contract cannot be fixed cleanly without it
- Forbidden files / conflicts:
  - `package.json` and all CI workflows (owned by Noor)
  - `src/developer-d4-registry.js`
  - `src/developer-scene-d4-states.js`
- Acceptance criteria:
  1. No Blob-created module is left resolving `./online-client-v114.js` relative to a Blob URL.
  2. The real game module and online client can both resolve from `developer-scene.html`.
  3. No duplicate runtime bootstrap is introduced.
  4. The change is isolated from production entry behavior.
  5. A focused static or executable verifier proves the import contract.
- Required validation: syntax-check every changed file; run the focused verifier; inspect resulting import URLs; report if browser execution is unavailable.
- Expected artifact: one draft PR with exact before/after import behavior.
- Context links: PR #35, `src/app-game-developer-d4.js`, `src/app-game-v085.js`, `src/online-client-v114.js`, `docs/design/developer-d4-collab.md`.
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
