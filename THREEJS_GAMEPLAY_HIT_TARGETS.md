# THREEJS-031 — Explicit gameplay hit targets

Status: **LOCKED by THREEJS-031 (2026-08-19)**

THREEJS-031 adds a dedicated interaction-only Three.js layer for gameplay picking. Visible board, pieces, room, table, score and decorative meshes remain presentation-only and are not the raycast target set.

## Interaction layer

All gameplay hit proxies use Three.js layer **31**. The default render camera remains on layer 0, so these proxies are not rendered. `createGameplayInteractionLayer(...)` raycasts only its own interaction root and temporarily switches the supplied `Raycaster.layers` to layer 31, restoring the caller's previous mask afterward.

The interaction material is shared, transparent with `opacity=0`, `colorWrite=false`, `depthWrite=false` and `depthTest=false`. It exists only so Three.js mesh raycasting has geometry/material; it does not alter the visible look.

## Board targets

The nine board zones come directly from canonical `world-layout.json` positions/IDs.

Board proxies use a cylinder radius of **42**, exactly the portable-kit forgiving touch target radius. Adjacent board proxies can overlap. Picking therefore does not trust raw raycast array order: candidates are resolved by nearest target center in the board plane, then ray distance, then stable target ID.

Target IDs are stable:

`board:0` through `board:8`.

The nine logical proxies are represented by one `InstancedMesh`, so picking does not require raycasting nine visible board/decorative objects.

## Piece-stack targets

Each physical seat has the three canonical `homeStacks` centers from `world-layout.json`, producing twelve targets:

`stack:<seatId>:<stackIndex>`

The stack touch radius is derived, not guessed: half the nearest canonical spacing between stack centers. Current spacing is 48 units, so the radius is **24**. This covers the full adjacent selection corridor without dead gaps while retaining deterministic nearest-center resolution.

The twelve logical stack proxies are represented by one second `InstancedMesh`.

THREEJS-032 will decide which logical playable piece/size a stack interaction selects. THREEJS-031 only supplies stable stack-area identity.

## Later controls

`addControlTarget({ id, center, size })` supports later 3D controls through the same interaction layer using IDs prefixed `control:`. Controls reuse one unit-box geometry plus the same invisible material and scale the proxy to the requested hit volume.

No visible control material is modified by this registration.

## Hover / press / focus

`createInteractionStateStore(...)` owns independent boolean `hovered`, `pressed` and `focused` state per target. Updating those states does not mutate hit geometry, interaction material or any visible render material.

Later presentation tasks may read this state and decide how to show feedback, but interaction state itself is not presentation styling.

## Performance boundary

Base gameplay picking has only two raycast mesh roots:

- `interaction-zones` — 9 instances;
- `interaction-piece-stacks` — 12 instances.

Decorative room meshes, table, board artwork and visible piece instances are not supplied to the gameplay raycaster. Later explicit control proxies may add only their dedicated interaction objects.

## Verification

Run:

- `node --test tests/threejs_interaction_targets_contract.test.mjs`
- `npm run test:threejs:gameplay`
- manual browser suite: `node scripts/verify-threejs-interaction-layer-browser.mjs`

The Node contract locks canonical zone/stack IDs/centers/radii and state separation. The browser verifier constructs real Three.js proxy geometry, proves default camera invisibility, raycasts board/overlap/stack/gap/control cases, verifies the raycaster layer mask is restored, confirms state changes do not alter material identity, and checks GPU proxy resources release through THREEJS-027.
