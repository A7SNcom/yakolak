# D4 Collaboration Log

## Current Objective
- Continue D4 as a disciplined evolution of D3.
- Keep one stable definition → variant → preview URL → review key → comparison key contract.
- Resolve runtime P0 blockers before visual acceptance.
- Preserve all D1/D3/game regression intent while the live workspace advances to D4.

## Verified Current State
- PR #35 is open and draft on `agent/developer-d2-workbench` against `agent/developer-d1-scene-gallery`.
- PR head is `27cf7cdd0626ba5995f457022de4a311b62b833e` and is mergeable.
- Commit `11e65d2c2884fc90164e0a2fe56dd4c4d2dd7a7a` centralized the D4 preview contract.
- Commit `b4308a2932dd0b8d6c65cda823f69e7fe743afa9` added registry/variant contract validation.
- Commit `62c8c2f28fafced53d7311724235ca147c253761` added the missing active D4 workspace controller.
- Commit `fa144ad2bf1dd84b62140b2904b21c752a54b6a6` isolated retained D1/D3 regression shells and added active D4 shell verification.
- Commit `27cf7cdd0626ba5995f457022de4a311b62b833e` merged the latest six D1 baseline commits without dropping D4 work.
- D1 workflow no longer has a branch-specific skip.
- D1 uses a checked-in retained shell; D3 uses a deterministic generated fixture; live `developer.html` remains D4.
- D4 contract validation covers 30 definitions and 64 unique review/comparison targets.
- The journey audit still reports four P0 runtime blockers and seven P1/P2 coverage gaps.

## Decisions
- Prefer one shared contract resolver over duplicated preview/state special cases.
- Keep native runtime correctness P0 and visual completeness P1/P2.
- Never silence, skip or weaken a regression workflow to make CI green.
- Preserve D1 as `developer-d1.html` and generate D3 deterministically from the active shell contract.
- Verify the active D4 shell separately from retained D1/D3 shells.
- Keep PR #35 draft while any P0 blocker remains.
- Do not merge PR #35 without explicit user authorization.

## Open Questions
- Will the consolidated game preview remove the nested Blob wrapper or rewrite all relative imports against a stable module base?
- Should online create/join color selection reuse the generic setup scene or remain a dedicated online variant?
- GitHub Actions PR runs for merge commit `ec32649b5009f8a1919a64b165f12cfd1be38268` have not surfaced through the connector yet.

## Tasks For Other Instance
- [OUTBOUND][ACTIVE][P0] Task: Validate restored CI without weakening checks
  Context: CI isolation and base synchronization are implemented; PR-triggered run evidence is still pending.
  Files: workflow runs/jobs/logs, `docs/design/developer-d4-collab.md`
  Acceptance: Record green run/job IDs for D1, D3, v112, v118, v125 and Build 126, or record the exact first failing step and assign the smallest clean patch.

- [OUTBOUND][NEXT][P0] Task: Remove the nested relative-module Blob failure mode
  Context: D4 must load game and online hooks deterministically from `developer-scene.html`.
  Files: `src/app-game-developer-d4.js`, preview loader contract, focused verifier
  Acceptance: `__yakolakGame` and `__yakolakOnlineV114` become ready with no module-resolution error on desktop or mobile.

- [OUTBOUND][QUEUED][P0] Task: Correct local player and turn variants
  Context: Runtime supports 2, 3 and 4 players and uses `turnIndex`.
  Files: `src/developer-d4-registry.js`, `src/developer-scene-d4-states.js`, contract/tests
  Acceptance: Add a real three-player variant; all turn variants use and assert `turnIndex`; remove stale `currentIndex` writes.

- [OUTBOUND][QUEUED][P0] Task: Render real native online states
  Context: `yakolakOnlineEntry` is the launcher; `yakolakOnlineDialog` is the actual state surface.
  Files: `src/developer-scene-d4-states.js`, online fixtures/adapters, registry/tests
  Acceptance: Landing, room-code and waiting use the native dialog; no substitute overlay; deterministic lifecycle states are covered.

- [OUTBOUND][QUEUED][P1] Task: Promote journey audit to strict
  Context: Convert the advisory audit into a release gate after P0 completion.
  Files: journey audit script/workflow, registry/state previews
  Acceptance: `node scripts/audit-developer-d4-journey.mjs --strict` passes with desktop/mobile and machine-readable evidence.

## Tasks I Am Taking
- [DONE] Task: Consolidate the D4 preview contract
  Reason: Make definition, variant, preview, review and comparison deterministic.
  Files: D4 registry/router/state/variant files and contract verifier
  Validation: 30 definitions and 64 review/comparison targets passed round-trip checks.

- [DONE] Task: Activate the D4 workspace controller
  Reason: `developer.html` referenced a missing `src/developer-d4.js`.
  Files: `src/developer-d4.js`
  Validation: Controller now consumes the shared contract and exposes variant-aware preview, task, review, brief, comparison and mobile flows.

- [DONE] Task: Repair the CI shell contract
  Reason: D3 verification targeted the live D4 shell and D1 regression was skipped.
  Files: retained D1 shell, deterministic D3 fixture builder/verifier, D4 shell verifier, D1/D3 workflows, `package.json`
  Validation: New scripts pass syntax checks; branch-specific skip removed; latest D1 baseline merged; PR returned to mergeable.

## Files Touched
- `docs/design/developer-d4-collab.md`
- `developer-d1.html`
- `package.json`
- `.github/workflows/developer-d1.yml`
- `.github/workflows/developer-d3.yml`
- `scripts/build-developer-d3-fixture.mjs`
- `scripts/verify-developer-d1.mjs`
- `scripts/verify-developer-d1-workspace.mjs`
- `scripts/verify-developer-d3.mjs`
- `scripts/verify-developer-d4-shell.mjs`
- `scripts/verify-developer-d4-contract.mjs`
- `scripts/visual-developer-d1-workspace.mjs`
- `src/developer-d4-registry.js`
- `src/developer-d4.js`
- `src/developer-scene-d4-router.js`
- `src/developer-scene-d4-states.js`
- `src/developer-scene-d4-variants.js`
- Latest D1 board-v2 baseline files from base branch

## Validation Done
- D4 registry/variant/review/comparison round-trip verifier passed: 30 definitions, 64 unique targets.
- JavaScript syntax checks passed for the new fixture and shell verification scripts.
- D4 shell verifier asserts one primary preview, variant selector, drawer actions, mobile navigation, ready marker and CSS guardrails.
- D1 branch-specific workflow skip was removed.
- Latest six D1 baseline commits were merged explicitly; PR #35 returned to mergeable.
- Existing advisory journey audit remains green with 0 registry integrity failures.
- Full GitHub Actions regression evidence is pending; no green CI claim is made yet.
- Vercel reports an external build-rate-limit failure unrelated to repository test logic.

## Next Recommended Step
- Validate the newly triggered regression workflows and record run/job IDs.
- After CI is green, start the nested Blob/import P0 task before any visual expansion.
