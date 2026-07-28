# D4 Collaboration Log

## Current Objective
- Continue D4 as a disciplined evolution of the existing D3 workspace.
- Establish a stable definition → variant → preview URL → review key → comparison key contract.

## Verified Current State
- PR #35 is open on `agent/developer-d2-workbench` against `agent/developer-d1-scene-gallery`.
- D3 already provides the core choose → preview → task/review → verify workflow.
- D4 files are expected to extend scene coverage and variant-aware previewing without changing the game runtime.

## Decisions
- Inspect current D4 registry/router/state/variant files before choosing implementation details.
- Prefer one shared contract resolver over duplicated preview and state special cases.

## Open Questions
- Which D4 file currently owns canonical normalization of definition and variant identifiers?
- Which actual journey states remain uncovered after the current D4 work?

## Tasks For Other Instance
- [OUTBOUND] Task: Audit actual game journey coverage
  Context: D4 should add only real missing scenes, states, and elements.
  Files: `src/app-game*.js`, `src/developer-d4-registry.js`, `src/developer-scene-d4-states.js`
  Acceptance: Return a concise list of uncovered real journey states with source evidence and no speculative redesign items.

## Tasks I Am Taking
- [INBOUND] Task: Consolidate the D4 preview contract
  Reason: Deterministic variant-aware routing is the highest-value architectural guardrail before adding more coverage.
  Files: `src/developer-d4-registry.js`, `src/developer-scene-d4-router.js`, `src/developer-scene-d4-states.js`, `src/developer-scene-d4-variants.js`, related tests/scripts
  Validation: Static contract checks plus existing workspace/game regression checks where available.

## Files Touched
- `docs/design/developer-d4-collab.md`

## Validation Done
- Confirmed PR #35 metadata and active head branch.

## Next Recommended Step
- Read the current D4 implementation and identify duplicated preview/state resolution logic.
