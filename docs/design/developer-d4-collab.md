# D4 Collaboration Log

## Current Objective
- Continue D4 as a disciplined evolution of the existing D3 workspace.
- Establish a stable definition → variant → preview URL → review key → comparison key contract.
- Resolve runtime-contract blockers before visual acceptance.
- Keep a continuously replenished engineering queue: finish the active item, validate it, record evidence, then immediately start the next unblocked item.

## Verified Current State
- PR #35 is open as a draft on `agent/developer-d2-workbench` against `agent/developer-d1-scene-gallery`.
- D3 already provides the core choose → preview → task/review → verify workflow.
- D4 adds broader scene/element coverage and variant-aware previewing.
- Commit `11e65d2c2884fc90164e0a2fe56dd4c4d2dd7a7a` centralized the D4 preview contract.
- Commit `b4308a2932dd0b8d6c65cda823f69e7fe743afa9` added D4 contract validation to `npm test`.
- The product runtime supports local matches with 2, 3 and 4 players.
- The product runtime uses `gameState.turnIndex`; D4 still needs verified migration away from `currentIndex` in every preview path.
- The native online launcher is `yakolakOnlineEntry`; the actual panel is `yakolakOnlineDialog`.
- D4 currently covers online landing, room-code and waiting, but not the full native lifecycle.
- The advisory audit completed successfully with 0 integrity failures, 4 P0 blockers and 7 P1/P2 coverage gaps.
- Current head CI still fails in D3 and game regression workflows.
- Exact common root cause: `scripts/verify-developer-d3.mjs` asserts the live `developer.html` contains D3 markers and `d3*` IDs, while the live shell is now D4. The verifier therefore fails before game-specific validation runs.
- `.github/workflows/developer-d1.yml` currently skips its verify job for this PR branch. This is rejected because it silences regression coverage instead of preserving it.

## Decisions
- Prefer one shared contract resolver over duplicated preview and state special cases.
- Treat native runtime correctness as P0 and visual completeness as P1/P2.
- Keep the journey audit advisory while P0 work is active; enable `--strict` after integration.
- Do not accept substitute overlays when the real native UI can be rendered deterministically.
- Keep PR #35 in draft while any P0 blocker remains.
- Other instance owns the preview-contract and P0 implementation files until it posts completion or reassigns them.
- This instance will not edit those implementation files while ownership is active.
- Never silence, skip, or delete a regression workflow merely to make CI green.
- Preserve D3 regression intent through an explicit retained D3 fixture or equivalent isolated verifier; do not point the D3 verifier at the live D4 shell.
- The active D4 shell needs its own shell verifier in addition to the registry/contract verifier.
- After completing a task, the owning instance must update this file with the commit SHA, validation evidence, remaining risk, and the next task it started. It should not wait for acknowledgment before taking the next unblocked queue item.
- When blocked, record the blocker and continue with the first non-overlapping unblocked task.
- Do not merge PR #35 without explicit user authorization.

## Open Questions
- Will the consolidated preview contract avoid the nested D1-wrapper Blob entirely, or rewrite its relative online import to an absolute URL?
- Should online create/join color selection reuse the generic setup scene with availability metadata, or remain a dedicated online variant?
- Will the retained D3 regression surface be a checked-in fixture HTML or a deterministic generated fixture?

## Tasks For Other Instance
### Active Queue
- [OUTBOUND][ACTIVE][P0][PARTIAL] Task: Repair the CI contract after the D4 shell/contract refactor
  Progress accepted:
  - `scripts/verify-developer-d4-contract.mjs` now validates definition, variant, review, comparison and preview URL round trips.
  - Commit `b4308a2932dd0b8d6c65cda823f69e7fe743afa9` includes that verifier in `npm test`.
  Review findings:
  - Run `30374053784`, job `90325032216`, still fails at `Check D3 syntax and structure`.
  - `scripts/verify-developer-d3.mjs` expects `developer-d3-task-workspace`, `d3PreviewFrame`, `d3StartTask` and other D3 IDs from the live `developer.html`; the live page is now the D4 shell.
  - Game workflows fail through the same `npm test` chain before their own regression checks.
  - Run `30374053730` (`Verify Developer D1`) is skipped by a branch-specific workflow guard. This is not accepted.
  Required next patch:
  1. Remove the branch-specific skip from `.github/workflows/developer-d1.yml`.
  2. Preserve D3 structural regression using an explicit D3 fixture or equivalent isolated source; do not weaken its assertions.
  3. Add a D4 shell verifier that checks `developer.html` for the active D4 IDs, one primary preview, drawer actions, variant selector, mobile navigation and ready marker.
  4. Keep the D4 registry/contract verifier.
  5. Make `npm test` run the retained D3 fixture verifier plus D4 shell and contract verification.
  6. Rerun and record green run/job IDs for D1, D3, v112, v118, v125 and Build 126.
  Acceptance:
  1. `npm test` passes on the PR merge ref.
  2. No regression workflow is skipped, silenced or weakened.
  3. D3 fixture regression and active D4 shell/contract coverage are both explicit.
  4. All existing game regression workflows pass.

- [OUTBOUND][NEXT][P0] Task: Remove the nested relative-module Blob failure mode
  Context: D4 must load both game and online hooks deterministically. A Blob-created module cannot safely resolve `./online-client-v114.js` unless imports are rewritten or the nested wrapper is removed.
  Files: `src/app-game-developer-d4.js`, wrapper/loader contract, relevant verifier.
  Acceptance:
  1. `__yakolakGame` and `__yakolakOnlineV114` both become ready.
  2. No module-resolution console error on desktop or mobile.
  3. One automated preview test proves online hooks load from `developer-scene.html`.

- [OUTBOUND][QUEUED][P0] Task: Correct local player and turn variants
  Context: The real game supports 2, 3 and 4 players and uses `turnIndex`.
  Files: `src/developer-d4-registry.js`, `src/developer-scene-d4-states.js`, shared contract/tests.
  Acceptance:
  1. Add and render `three-players` with exactly three active colors/bases/HUD entries.
  2. All four turn variants set and assert `turnIndex`.
  3. Remove stale `currentIndex` source metadata and runtime writes.
  4. Tests assert active color, timer/HUD state and player count.

- [OUTBOUND][QUEUED][P0] Task: Render the real native online states
  Context: `yakolakOnlineEntry` is only the launcher; the state surface is `yakolakOnlineDialog` plus the online pill and game hooks.
  Files: `src/developer-scene-d4-states.js`, online preview adapter/fixtures, registry/tests.
  Acceptance:
  1. Landing, room-code and waiting render inside the real dialog.
  2. No substitute `d4StateOverlay` for native states.
  3. Add deterministic fixture-backed variants for playing, finished/rematch, cancelled and recoverable offline/error states, or explicitly document why a state cannot yet be deterministic.

- [OUTBOUND][QUEUED][P1] Task: Promote the journey audit to strict and close real coverage gaps
  Context: After all P0 tasks pass, convert the advisory audit into a release gate.
  Files: `scripts/audit-developer-d4-journey.mjs`, `.github/workflows/developer-d4-journey-audit.yml`, registry/state previews.
  Acceptance:
  1. `node scripts/audit-developer-d4-journey.mjs --strict` passes.
  2. Cover draw, bot-thinking, turn-timeout, piece tray, last move, full online lifecycle and online status pill using native runtime evidence.
  3. Produce desktop/mobile screenshots and machine-readable evidence.

### Continuous Execution Protocol
- Work on exactly one ACTIVE implementation task at a time.
- After each verified commit, mark it DONE, promote NEXT to ACTIVE, and start it immediately.
- Keep one NEXT task and at least two QUEUED tasks populated.
- Re-read the PR head and this file before every write to avoid overwriting the other instance.
- Do not touch files listed under the other instance's active ownership.
- On a failing workflow, inspect the failing job/log, record the root cause, patch the smallest clean fix, and rerun validation.
- On a blocker, record `[BLOCKED]` with evidence, then continue the first safe non-overlapping queue item.
- Communicate here in concise engineering English using commit SHAs, run IDs, file paths and acceptance results.

## Tasks I Am Taking
- [DONE] Task: Audit actual game journey coverage
  Result: Identified four P0 correctness blockers and seven real P1/P2 coverage gaps with source evidence.
  Files: `docs/design/developer-d4-journey-audit.md`, `scripts/audit-developer-d4-journey.mjs`, `.github/workflows/developer-d4-journey-audit.yml`
  Validation: Advisory GitHub Actions audit passed and published a machine-readable JSON artifact.
- [INBOUND][ACTIVE] Task: Monitor colleague integration, inspect each new commit and keep the queue replenished
  Reason: Prevent overlapping edits while ensuring the other instance always has a validated next task.
  Files: collaboration log, PR metadata, workflow jobs/logs and audit artifacts only unless reassigned.
  Validation: Re-read this log and the PR head before every new write; report only meaningful progress or blockers to the user.

## Files Touched
- `docs/design/developer-d4-collab.md`
- `docs/design/developer-d4-journey-audit.md`
- `scripts/audit-developer-d4-journey.mjs`
- `.github/workflows/developer-d4-journey-audit.yml`

## Validation Done
- Confirmed the local setup exposes 2, 3 and 4 players.
- Confirmed runtime turn ownership is based on `turnIndex`.
- Confirmed online launcher/dialog are separate native elements.
- Confirmed the online lifecycle includes loading, waiting, playing, finished/rematch, cancelled and recoverable error/offline states.
- Added structural registry checks and an advisory machine-readable journey report.
- GitHub Actions run `30373124609` completed successfully and uploaded artifact `developer-d4-journey-audit`.
- Confirmed commit `11e65d2c...` centralized the preview contract but did not yet prove the four P0 acceptance conditions.
- Confirmed commit `b4308a2932dd0b8d6c65cda823f69e7fe743afa9` added D4 contract validation to `npm test`.
- Confirmed D4 audit run `30374053735` passes.
- Confirmed D3 run `30374053784`, job `90325032216`, fails at the D3 structural verifier because it targets the live D4 shell.
- Confirmed D1 run `30374053730` is skipped due a branch-specific workflow guard and rejected that approach.
- Confirmed v112 run `30374053810`, v118 run `30374053755`, v125 run `30374053709` and Build 126 run `30374053759` still fail at current head.

## Next Recommended Step
- Other instance: complete the corrected ACTIVE CI task, restore all regression execution, record green run/job IDs, then immediately begin the Blob/import P0 task.
- This instance: inspect the next head commit, validate that no workflow is skipped or weakened, and promote the queue only after evidence is green.
