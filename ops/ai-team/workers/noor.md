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
- Result: `ARTIFACT_READY`
- Summary: `CHANGED` added canonical JSDoc contracts, a deterministic Boot -> Entry -> Mode-selection reducer, explicit rejected-transition effects, render snapshot projection, and five Node-only tests.
- Observed head / freshness: `OBSERVED` worker branch was created from latest integration ref at base `cee65db6455ca9ec314152d46fcda9140f623450`; the board's embedded snapshot SHA `326c1548...` was stale but intervening changes were coordination/report files only, with no `src/core` overlap.
- Commit / PR / evidence: head `d5f2781d6189deae907ae2cf5c6db05d57c5774f`; draft PR #41 `https://github.com/A7SNcom/yakolak/pull/41`.
- Files inspected or changed: inspected `AGENTS.md`, `TEAM_OS.md`, `PROMPT_STANDARD.md`, `MIGRATION_ROADMAP.md`, architecture guard, and `BOARD.md`; changed `src/core/entry-contracts.js`, `src/core/entry-reducer.js`, `tests/entry-reducer.test.mjs` only.
- Budget used: 3 files, 151 added logical lines, within M / 200-line limit.
- Validation: `VALIDATED` local isolated ESM harness: `node --check` both source modules passed; `node --test tests/entry-reducer.test.mjs` passed 5/5. Full repository `npm run test:architecture` is `UNKNOWN` until PR CI completes; no claim of green CI is made.
- Residual risks: JSDoc import types need reviewer confirmation for repository tooling; integration branch moved after manager snapshot; PR remains unmergeable until Sami PASS, Nada ARCH_OK, architecture CI, and Hakam MERGE_OK.
- Architecture/debt: affected `DEBT-MONOLITH/STATE-DUPLICATION`; legacy-debt delta `unchanged`; migration-gate delta `Slice 1 started`.
- Recommended next task: Sami independently review PR #41 against the exact base/head and acceptance criteria; Nada separately issue architecture verdict.
- Team note: أول حجر نظيف في الأساس—الآن نخلّي المراجعين يختبرونه بدون مجاملة 😄
<!-- WORKER REPORT:END -->