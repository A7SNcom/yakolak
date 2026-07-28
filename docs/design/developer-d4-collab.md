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
- The product runtime supports local matches with 2, 3 and 4 players.
- The product runtime uses `gameState.turnIndex`; D4 still needs verified migration away from `currentIndex` in every preview path.
- The native online launcher is `yakolakOnlineEntry`; the actual panel is `yakolakOnlineDialog`.
- D4 currently covers online landing, room-code and waiting, but not the full native lifecycle.
- The advisory audit completed successfully with 0 integrity failures, 4 P0 blockers and 7 P1/P2 coverage gaps.
- Current head CI has failures in legacy game/D3 workflows after the D4 contract refactor; these must be repaired without disabling or weakening regression checks.

## Decisions
- Prefer one shared contract resolver over duplicated preview and state special cases.
- Treat native runtime correctness as P0 and visual completeness as P1/P2.
- Keep the journey audit advisory while P0 work is active; enable `--strict` after integration.
- Do not accept substitute overlays when the real native UI can be rendered deterministically.
- Keep PR #35 in draft while any P0 blocker remains.
- Other instance owns the preview-contract and P0 implementation files until it posts completion or reassigns them.
- This instance will not edit those implementation files while ownership is active.
- Never silence, skip, or delete a regression workflow merely to make CI green.
- After completing a task, the owning instance must update this file with the commit SHA, validation evidence, remaining risk, and the next task it started. It should not wait for acknowledgment before taking the next unblocked queue item.
- When blocked, record the blocker and continue with the first non-overlapping unblocked task.
- Do not merge PR #35 without explicit user authorization.

## Open Questions
- Will the consolidated preview contract avoid the nested D1-wrapper Blob entirely, or rewrite its relative online import to an absolute URL?
- Should online create/join color selection reuse the generic setup scene with availability metadata, or remain a dedicated online variant?
- Which legacy structural verifier should remain as a D3 fixture check, and which assertions should move into a dedicated D4 verifier?

## Tasks For Other Instance
### Active Queue
- [OUTBOUND][ACTIVE][P0] Task: Repair the CI contract after the D4 shell/contract refactor
  Context: At head `11e65d2c...`, `Verify Developer D3 UX`, v112, v118, v125 and Build 126 workflows fail while the D4 journey audit passes. The failure began after centralizing the D4 contract. Preserve regression intent; do not disable workflows or replace assertions with unconditional success.
  Files: `package.json`, D3/D4 verify scripts, related workflow YAML, `developer.html`, D4 contract files only where required.
  Acceptance:
  1. Identify and document the exact common root cause from Actions logs.
  2. Separate legacy D3 structural coverage from active D4 shell coverage cleanly.
  3. `npm test` and all existing game regression workflows pass on the PR merge ref.
  4. Add a dedicated static D4 contract verifier if one does not exist.
  5. Record run IDs and job IDs here.

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
- Confirmed the latest D4 audit passes while multiple legacy/game workflows fail, making CI repair the immediate ACTIVE task.

## Next Recommended Step
- Other instance: repair the CI contract first, update this log with exact root cause and green run IDs, then immediately begin the Blob/import P0 task.
- This instance: monitor the branch and workflows, validate each claimed completion, reject weakened tests, and continuously replenish the queue.