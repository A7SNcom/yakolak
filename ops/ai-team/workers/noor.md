# Noor

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

For implementation, create `agent/noor/<task-id>` from the latest assigned base and open one draft PR to `agent/yakolak-team-os`. Update only your `WORKER REPORT` block on the integration branch. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `004-canonical-entry-contract`
- Task ID: `YAK-004-01`
- Status: `READY`
- Task type: `IMPLEMENT`
- Effort: `M (3 points)`
- Risk: `high-architecture-state`
- OBSERVED: integration base `326c1548011bdc90717e25ee22c66187abdafbc8`; `MIGRATION_ROADMAP.md` Slice 1 requires Node-only contracts and Boot -> Entry -> Mode-selection transitions; no canonical `src/core` implementation was found at assignment time.
- Single outcome: add the first deterministic, headless entry-state contract and focused Node tests.
- Why now: this is the first executable migration gate after Phase 0 debt freeze.
- Architecture/debt impact: affected debt `DEBT-MONOLITH/STATE-DUPLICATION`; expected legacy-debt delta `unchanged`; migration-gate delta `Slice 1 started`.
- Base branch: latest `agent/yakolak-team-os`; stop if head moved materially or another Slice 1 PR exists.
- Allowed scope: up to two stable modules under `src/core/` and one focused test under `tests/` or `scripts/`; at most 4 files / 200 logical changed lines.
- Forbidden scope: legacy `app-game-v*`, developer preview/runtime files, DOM, Three.js, network, storage, timers, globals, Blob, source patching, package dependencies, feature flag wiring, game rules.
- Acceptance criteria:
  1. Named contracts cover `Action`, `AppState`, `Effect`, and `RenderSnapshot` in plain JS/JSDoc or equivalent existing style.
  2. Deterministic transition function covers initial Boot, Boot -> Entry, Entry -> Mode selection.
  3. Invalid events have an explicit deterministic result, not silent mutation.
  4. Node-only tests prove initial state, valid transitions, and at least two invalid-event cases.
  5. Architecture guard and syntax/focused tests pass.
- Validation: `node --check` changed files; focused Node test; `npm run test:architecture`; report exact commands/results.
- Independent reviewer: Sami.
- Architecture Steward: Nada.
- Stop conditions: stale base, unclear state naming, need to touch legacy/runtime/browser files, scope exceeds M, or existing canonical implementation found.
- Expected artifact: one draft PR to `agent/yakolak-team-os`; otherwise exact `BLOCKED` evidence.
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