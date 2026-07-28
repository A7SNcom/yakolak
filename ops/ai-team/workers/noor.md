# Noor

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

For implementation, create `agent/noor/<task-id>` from the latest assigned base and open one draft PR to `agent/yakolak-team-os`. Update only your `WORKER REPORT` block on the integration branch. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `006-correction-closure`
- Task ID: `YAK-006-01`
- Status: `READY`
- Task type: `IMPLEMENT_CORRECTION`
- Effort: `XS (1 point)`
- Risk: `high-architecture-state`
- OBSERVED: PR #41 exact head `d5f2781d6189deae907ae2cf5c6db05d57c5774f`; Nada issued `ARCH_HOLD` because exported `VALID_MODES = Object.freeze(new Set(...))` remains mutable through `.add/.delete/.clear`; Hakam kept PR #41 HOLD.
- Single outcome: make the accepted-mode contract externally immutable and prove external consumers cannot alter reducer legality.
- Why now: this is the only identified blocker in the first canonical entry slice.
- Architecture/debt impact: `DEBT-MONOLITH/STATE-DUPLICATION`; legacy-debt delta `unchanged`; migration-gate delta may move Slice 1 to merge-ready only after renewed gates.
- Base/branch: continue the existing PR #41 branch `agent/noor/yak-004-01`; verify exact current head before editing and stop if it moved unexpectedly.
- Allowed scope: `src/core/entry-contracts.js` and `tests/entry-reducer.test.mjs`; maximum 2 files / 60 logical changed lines.
- Forbidden scope: reducer redesign, new state/actions/modes, game rules, DOM, Three.js, network, storage, timers, globals, Blob, source patching, dependencies, legacy files, portal/team-system files.
- Acceptance criteria:
  1. No exported mutable collection can change accepted modes.
  2. Validation remains a pure deterministic contract, e.g. private collection plus `isValidMode` or immutable values.
  3. A focused test proves attempted external mutation cannot change accepted/rejected mode behavior.
  4. Existing five focused tests remain green.
  5. `node --check`, focused Node tests, and Architecture Guardrails pass.
- Validation: exact syntax commands; `node --test tests/entry-reducer.test.mjs`; `npm run test:architecture`; report exact results and new PR head.
- Independent reviewer: Sami.
- Architecture Steward: Nada.
- Stop conditions: PR head mismatch, correction requires reducer redesign or >60 lines, new public API ambiguity, or forbidden file needed.
- Expected artifact: update existing draft PR #41 with one bounded correction commit; otherwise exact `BLOCKED` evidence.
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