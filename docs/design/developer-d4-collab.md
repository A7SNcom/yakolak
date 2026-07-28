# D4 Collaboration Log

## Current Objective
- Continue D4 as a disciplined evolution of the existing D3 workspace.
- Establish a stable definition → variant → preview URL → review key → comparison key contract.
- Resolve runtime-contract blockers before visual acceptance.

## Verified Current State
- PR #35 is open on `agent/developer-d2-workbench` against `agent/developer-d1-scene-gallery`.
- D3 already provides the core choose → preview → task/review → verify workflow.
- D4 adds broader scene/element coverage and variant-aware previewing.
- The product runtime supports local matches with 2, 3 and 4 players.
- The product runtime uses `gameState.turnIndex`; D4 currently writes `currentIndex`.
- The native online launcher is `yakolakOnlineEntry`; the actual panel is `yakolakOnlineDialog`.
- D4 currently covers online landing, room-code and waiting, but not the full native lifecycle.

## Decisions
- Prefer one shared contract resolver over duplicated preview and state special cases.
- Treat native runtime correctness as P0 and visual completeness as P1/P2.
- Keep the journey audit advisory while P0 work is active; enable `--strict` after integration.
- Do not accept substitute overlays when the real native UI can be rendered deterministically.

## Open Questions
- Will the consolidated preview contract avoid the nested D1-wrapper Blob entirely, or rewrite its relative online import to an absolute URL?
- Should online create/join color selection reuse the generic setup scene with availability metadata, or remain a dedicated online variant?

## Tasks For Other Instance
- [OUTBOUND] Task: Resolve the four P0 runtime-contract gaps
  Context: Current D4 previews can omit three-player play, activate the wrong turn, show only the online launcher, or fail on a nested relative module import.
  Files: `src/developer-d4-registry.js`, `src/developer-scene-d4-states.js`, `src/app-game-developer-d4.js`, preview-contract files
  Acceptance: `three-players` works with exactly three colors; all turn variants use `turnIndex`; native `yakolakOnlineDialog` renders requested states; both `__yakolakGame` and `__yakolakOnlineV114` become ready without module errors.
- [OUTBOUND] Task: Integrate audit expectations into the consolidated contract
  Context: The audit now records P1/P2 product states without forcing speculative UI.
  Files: `scripts/audit-developer-d4-journey.mjs`, `docs/design/developer-d4-journey-audit.md`
  Acceptance: After P0 fixes, run `node scripts/audit-developer-d4-journey.mjs --strict` and address or explicitly classify remaining gaps.

## Tasks I Am Taking
- [DONE] Task: Audit actual game journey coverage
  Result: Identified four P0 correctness blockers and seven real P1/P2 coverage gaps with source evidence.
  Files: `docs/design/developer-d4-journey-audit.md`, `scripts/audit-developer-d4-journey.mjs`, `.github/workflows/developer-d4-journey-audit.yml`
  Validation: Advisory GitHub Actions audit publishes a machine-readable JSON artifact.
- [INBOUND] Task: Monitor colleague integration and validate the audit output
  Reason: Prevent overlapping edits while checking that the preview-contract work resolves the discovered runtime gaps.
  Files: collaboration log, workflow status and audit artifact only unless reassigned
  Validation: Re-read this log and the PR head before every new write.

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

## Next Recommended Step
- Other instance: complete the consolidated preview contract and the four P0 fixes.
- This instance: watch the branch, inspect the next commit, then run/check the audit workflow before taking another implementation slice.
