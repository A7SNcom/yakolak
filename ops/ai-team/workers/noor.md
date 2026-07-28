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
- Summary: `CHANGED` replaced the exported mutable Set with a frozen validation facade backed by a private Set, preserving the reducer's `.has()` contract while removing external mutation methods. Added one focused test proving consumers cannot replace validation or alter accepted/rejected behavior.
- Observed head / freshness: `OBSERVED` PR #41 was open at assigned head `d5f2781d6189deae907ae2cf5c6db05d57c5774f` immediately before editing; corrected exact head is `9da9afc4e2690feab03e66ad1a19bb8621cc5f7e`.
- Commit / PR / evidence: correction commits `a60b9ae73e1b57d06226850d82e03d3367977e3e` and `9da9afc4e2690feab03e66ad1a19bb8621cc5f7e`; draft PR #41 `https://github.com/A7SNcom/yakolak/pull/41`.
- Files inspected or changed: `CHANGED` only `src/core/entry-contracts.js` and `tests/entry-reducer.test.mjs`; reducer and all forbidden areas remained untouched.
- Budget used: 2 files; 22 net additions beyond the prior PR state, within XS correction ceiling and the explicit 2-file / 60-line task budget.
- Validation: `OBSERVED` GitHub queued `Verify Architecture Guardrails` run `30395085282` for exact corrected head. `UNKNOWN` until CI completes: syntax, six focused tests, and architecture guard conclusion; no green claim is made before the run finishes.
- Acceptance evidence: `VALID_MODES` is frozen and exposes only `has`; its backing Set is module-private. The new test asserts `.add/.delete/.clear` are absent, assignment to `.has` throws, a canonical mode remains accepted, and an external mode remains rejected.
- Residual risks: renewed independent reviewer and Architecture Steward must confirm that the facade is an acceptable stable public contract; CI is still queued.
- Architecture/debt: affected `DEBT-MONOLITH/STATE-DUPLICATION`; legacy-debt delta `unchanged`; migration-gate delta `correction artifact ready`, not merge-ready until green validation plus Sami PASS, Nada ARCH_OK, and Hakam MERGE_OK.
- Recommended next task: Sami performs the renewed exact-head independent review only after the corrected artifact and CI evidence are available; Nada separately renews the architecture verdict.
- Team note: الباب الجانبي اتقفل؛ الآن ننتظر الاختبار والمراجعة المستقلة قبل أي دمج. 🔒
<!-- WORKER REPORT:END -->