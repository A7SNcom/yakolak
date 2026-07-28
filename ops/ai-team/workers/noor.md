# Noor

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

For implementation, create `agent/noor/<task-id>` from the exact assigned base and open one draft PR to `agent/yakolak-team-os`. Update only your `WORKER REPORT` block on the integration branch. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `004-canonical-entry-contract`
- Task ID: `YAK-004-01`
- Status: `READY`
- Task type: `IMPLEMENT`
- Effort: `M (3 points)`
- Risk: `high-architecture-state`
- Blueprint Node ID: `track-canonical-architecture`
- Blueprint Revision: `2`
- Objective: Add the first deterministic, headless entry-state contract and focused Node tests for Boot → Entry → Mode selection.
- Why now: This is the first executable migration gate after the architecture debt freeze and directly implements the documented blueprint node.
- Observed base/head: `agent/yakolak-team-os` at `5d3871544031a84c553b27768ef00ef2a382b55d`; blueprint `track-canonical-architecture@2`; observed `2026-07-28T21:24+03:00`. Recheck both immediately before writing.
- Base branch: exact current `agent/yakolak-team-os`; stop if the head moves materially, the blueprint revision changes, or another Slice 1 PR exists.
- Allowed files: up to two stable modules under `src/core/` and one focused test under `tests/` or `scripts/`; at most 4 tightly related files.
- Forbidden files / conflicts: legacy `app-game-v*`, developer preview/runtime files, DOM, Three.js, network, storage, timers, globals, Blob, source patching, dependencies, feature-flag wiring, game rules, President portal files, and files owned by another task.
- Change budget: at most 4 files / 200 logical changed lines.
- Acceptance criteria:
  1. Named contracts cover `Action`, `AppState`, `Effect`, and `RenderSnapshot` in readable plain JS/JSDoc or the existing canonical style.
  2. A deterministic transition function covers initial Boot, Boot → Entry, and Entry → Mode selection.
  3. Invalid events return an explicit deterministic result without silent mutation.
  4. Node-only tests prove initial state, valid transitions, and at least two invalid-event cases.
  5. No DOM, Three.js, network, storage, timer, Blob, global, source-patching, or legacy runtime dependency exists.
  6. Blueprint intent remains unchanged; report `blueprint delta: status only` if the artifact reaches review.
- Required validation: `node --check` on changed files; focused Node test; `npm run test:architecture`; exact commands/results in the report.
- Independent reviewer: `Sami`.
- Architecture Steward: `Nada`.
- Stop conditions: unread/unreconciled President input affecting the node, blueprint revision mismatch, stale base, unclear state naming, existing canonical implementation, need to touch forbidden files, or scope exceeding M.
- Expected artifact: one draft PR to `agent/yakolak-team-os` with `blueprintNodeId=track-canonical-architecture` and `blueprintRevision=2`; otherwise exact `BLOCKED` evidence.
- Context links: `AGENTS.md`, `ops/ai-team/development-blueprint.json`, `ops/ai-team/PROMPT_STANDARD.md`, `docs/architecture/GAME_ARCHITECTURE.md`, `docs/architecture/MIGRATION_ROADMAP.md`, `docs/architecture/DEBT_REGISTER.md`, `ops/ai-team/BOARD.md`.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary: —
- Observed head / freshness: —
- Blueprint node / revision: —
- Commit / PR / evidence: —
- Files inspected or changed: —
- Budget used: —
- Validation: —
- Blueprint / debt / migration deltas: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
