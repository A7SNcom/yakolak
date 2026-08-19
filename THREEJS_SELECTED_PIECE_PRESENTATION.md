# THREEJS-039 — Selected-piece presentation semantics

Status: **LOCKED by THREEJS-039 (2026-08-20)**

THREEJS-039 recreates the proven UX-SELECT-44 behavior in Three.js: exactly one selected remaining piece receives immediate, non-color-only emphasis; every neighbor remains visually neutral; and the complete selection presentation clears atomically at every authoritative/cancel boundary.

It does not copy Godot implementation details and does not own gameplay authority, camera movement, timing, placement rules or tween scheduling.

## Canonical ownership and availability

Selected-piece presentation accepts a canonical THREEJS-045 session snapshot plus one stable logical piece ID:

`piece:<color>:<size>:<copyNumber>`

Availability is decided only from the THREEJS-045 / THREEJS-046 boundary:

1. assert the canonical session state and uninterrupted `turn-loop`;
2. require the selected piece color to belong to the active configured seat;
3. read canonical `state.inventory` and cross-check it with `deriveRemainingInventoryFromState(...)` from the shared rules package;
4. require the physical copy index to be within the canonical remaining count;
5. call the shared `validatePlacementForSeat(...)` for all nine cells and require at least one legal destination.

THREEJS-039 does not maintain a second inventory count and does not implement private board occupancy/placement rules.

The current mapping follows the already-locked canonical home-piece convention: remaining copies occupy the lowest physical copy indexes first (`copyIndex < remainingCount`).

## Exactly one selected-looking object

`createSelectedPiecePresentation(...)` owns one presentation root and replaces its target in place.

A selected state reports:

- `selectedLogicalObjectCount = 1`;
- `emphasisRenderPrimitiveCount = 3`;
- one geometry outline;
- one bright inner halo ring;
- one dark outer halo ring.

Selecting another valid remaining piece reuses the same presentation root. It cannot accumulate a second outline, halo set or selected-looking neighbor.

When no selection exists, the presentation root is hidden and both counts are zero.

## Non-color-only emphasis

The visual contract is:

- primary cue: `geometry-outline`;
- secondary cue: `double-halo-ring`;
- `colorIndependent = true`;
- hue-only indication forbidden;
- brightness-only indication forbidden;
- no filled overlay.

The outline is derived from the selected piece's actual shared geometry with `EdgesGeometry`. The two halo rings sit outside the selected silhouette. The overlay uses line primitives only; it never replaces or edits the canonical material on the piece itself.

The bright/dark line pair exists only to maintain contrast across light/dark canonical finishes. The semantic selection signal is the outline + ring geometry, not a color/material mutation.

## Neutral neighbors and unobscured geometry

Canonical player materials are immutable inputs to THREEJS-039. Selection does not alter:

- color;
- roughness;
- metalness;
- opacity;
- transparency;
- material identity of the selected piece or any neighbor.

`neighborMaterialMutationCount` is therefore locked to zero.

Because the emphasis is line-only and has no filled mesh, it leaves the original piece geometry visible. The rendered acceptance matrix additionally measures how much of the selected piece silhouette changes and fails if the cue obscures more than the bounded fraction defined by the verifier.

## Immediate feedback, independent of camera latency

`select(...)`, `refresh(...)` and `clear(...)` are synchronous presentation operations. They call the injected `requestRender()` immediately after the complete presentation replacement.

THREEJS-039 imports no camera controller, creates no RAF/timer/Promise queue and owns no motion scheduler. A camera transition may still be running, but selection feedback does not wait for it.

`refresh(...)` only re-reads the current presentation matrix for the already-selected logical piece on the same authority witness. This lets the outline follow stack/drag presentation without becoming a second motion owner.

## Authority witness and stale-callback safety

Presentation carries the canonical witness:

- presentation generation;
- authoritative revision;
- round;
- active seat.

The controller also retains the **latest observed authority witness after selection clears**. Therefore an old pre-reconnect/pre-turn snapshot cannot resurrect a highlight after hydration.

While a piece is selected, a different authority witness requires an explicit clear/reconcile boundary first. Selection never silently survives into another revision/round/seat.

## Atomic clear boundaries

The complete selected-looking presentation clears for exactly these UX-SELECT-44 acceptance reasons:

- `cancel`;
- `accepted-submit`;
- `rejected-submit`;
- `turn-change`;
- `seat-change`;
- `reconnect-hydration`;
- `timeout`;
- `round-reset`.

Clear hides the entire emphasis root, drops the selected logical target and requests one render synchronously. A newer canonical state may be supplied at the same boundary so its witness is retained even after the selection itself is gone.

## Instanced-piece presentation bridge

`createPieceInstances(...)` exposes one read-only `getSelectionPresentationDescriptor(pieceId)` bridge for state cues. It returns:

- stable logical identity;
- current instance matrix;
- current canonical/presentation destination;
- shared source geometry;
- finite bounding radius;
- shared base material identity.

It does **not** expose render-slot mutation or gameplay authority. The selected overlay can therefore follow an `InstancedMesh` piece without de-instancing the 36-piece runtime or changing canonical material ownership.

## Rendered acceptance matrix

`scripts/verify-threejs-selected-piece-matrix-browser.mjs` is wired into the existing manual `browser` / `full` optional suite.

It constructs real Three.js runtime pieces from the verified GLBs plus canonical player materials and neutral lighting, then renders **48 cases**:

- 4 canonical colors: marble, blue, gold, green;
- 3 sizes: small, medium, large;
- 4 play cameras: desktop, compact, portrait 2-seat, portrait crowded.

For every case it verifies:

- exactly one selected logical object;
- exactly three line-only emphasis primitives;
- immediate render request;
- canonical material unchanged;
- zero neighbor material mutations;
- no filled overlay;
- visible pixel difference from the neutral frame;
- selected piece silhouette remains mostly unobscured.

The verifier reports failing cases and pixel metrics instead of copying Godot screenshots or implementation details.

## Verification

Run:

- `node --test tests/threejs_selected_piece_presentation_contract.test.mjs`
- `npm run test:threejs:gameplay`
- manual optional browser/full suite, which includes `node scripts/verify-threejs-selected-piece-matrix-browser.mjs`

The Node contract proves canonical/shared-rule ownership, remaining-copy rejection, no-legal-destination rejection, one-object replacement, immutable canonical materials, synchronous rendering, stale-witness protection and all eight atomic clear reasons. The browser matrix proves the visible result across canonical colors, sizes, neutral lighting and play cameras.
