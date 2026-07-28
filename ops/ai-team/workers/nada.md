# Nada

## Permanent instructions
Open `ops/ai-team/TEAM_OS.md`, then execute exactly the one task in the manager block below. You are a generalist; this task is temporary, not a permanent role.

This task is read-only. Do not create a code branch or edit project files. Update only the `WORKER REPORT` block in this file directly on `agent/yakolak-team-os`. Preserve the manager block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `000-bootstrap`
- Task ID: `YAK-000-05`
- Status: `READY`
- Objective: Design a deterministic native-online preview matrix that covers the real dialog lifecycle without fake overlays.
- Why now: The next implementation must expose real online states, but the data seam and fixtures are not yet clearly bounded.
- Base branch: `agent/developer-d2-workbench`
- Allowed files: read-only inspection of `src/online-client-v114.js`, room APIs, `src/developer-scene-d4-states.js`, `src/developer-d4-registry.js`, relevant HTML, tests, and docs.
- Forbidden files / conflicts: no code changes; do not overlap Mazen's player/turn implementation.
- Acceptance criteria:
  1. Enumerate native lifecycle states: landing, room-code/join, loading, waiting, playing, finished/rematch, cancelled, recoverable offline/error, and status pill.
  2. Identify the exact DOM nodes, state fields, and functions controlling each state.
  3. Propose the smallest deterministic fixture/adapter seam.
  4. Define acceptance evidence for desktop and mobile.
  5. Flag states that cannot be deterministic yet and explain the missing seam.
- Required validation: cite exact file paths, symbols, and state values; compare the plan against the D4 audit gaps.
- Expected artifact: an implementation-ready matrix in your report block, with no code changes.
- Context links: PR #35, `docs/design/developer-d4-journey-audit.md`, `ops/ai-team/HISTORY.md`.
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
