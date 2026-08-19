# THREEJS-034 — Deterministic board-cell picking and touch radii

Status: **LOCKED by THREEJS-034 (2026-08-19)**

THREEJS-034 resolves one normalized pointer ray against nine explicit logical board-cell hit surfaces in canonical world space. Visible board geometry is never the gameplay target authority.

## Nine canonical surfaces

`deriveBoardCellHitSurfaces(...)` derives all nine cells from the THREEJS-031 interaction layout/world-layout positions:

`board:0` through `board:8`.

All centers lie on the canonical board target plane (`Y=2` in the current definitive layout). Each surface stores the current authoritative normal/touch target radii but does not enlarge or modify visible board geometry.

The shared rules contract remains locked to exactly nine cells; 034 fails if the interaction layout drifts from that count.

## World-space ray projection

`projectRayToBoardPlane(ray, planeY)` intersects the normalized THREEJS-030 camera ray with the canonical board plane. Radius checks use the resulting world-space X/Z point, not CSS pixels, drawing-buffer pixels or decorative mesh bounds.

Parallel rays and intersections behind the ray origin are misses.

## Authoritative target radii

The definitive Portable Kit contract supplies:

- normal mouse/pen target radius: **31 world units**;
- touch target radius: **42 world units**.

Only `pointerType='touch'` receives the touch radius. Mouse, pen and unknown pointer types use the normal radius.

The 42-unit touch radius must continue to match the THREEJS-031 board interaction-proxy radius; drift fails closed.

## Deterministic overlap resolution

Overlapping hit surfaces are expected. Candidate ranking is purely geometric:

1. smallest squared X/Z distance to canonical cell center;
2. on an exact distance tie, smallest stable `cellId`.

This choice happens **before gameplay legality is considered**.

That ordering is mandatory. Filtering illegal cells first would create a magnetic effect where a touch geometrically closest to an illegal/occupied cell could silently jump to a farther legal neighbor.

Therefore:

- choose the geometric candidate first;
- validate exactly that candidate with shared `validatePlacementForSeat(...)` for the currently selected size;
- if it is illegal, return `candidate_illegal_for_selected_size` plus the shared rule rejection code;
- never search the remaining overlapping candidates for a legal substitute.

A nearby illegal slot can never become a different legal move.

## Current selection contract

THREEJS-034 consumes a current THREEJS-033 selection. Before picking it revalidates that:

- selection generation/revision/round/active seat exactly match canonical state;
- selection seat is the active seat;
- `legalCells` still exactly equal the nine shared-validator results;
- `legalTargetIds` still exactly match those cells.

A stale or tampered visual selection cannot authorize a placement candidate.

## Output boundary

A successful result contains the shared validator's normalized placement:

`{ seatId, color, cell, size }`

plus world-space pick diagnostics such as selected radius, candidate distance and overlapping candidate IDs.

THREEJS-034 does **not** submit the gameplay intent and does not mutate authority. Tap/drag confirmation tasks consume this validated candidate and route the resulting intent through the existing authority adapter.

## No decorative raycast path

This resolver imports no Three.js mesh/raycaster classes and calls no `intersectObject(s)`. THREEJS-030 provides the ray; THREEJS-031 provides canonical interaction locations; THREEJS-033 provides the selected size/legal visualization; shared rules make the final legality decision.

## Verification

Run:

- `node --test tests/threejs_board_cell_picking_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract covers all nine canonical centers, current 31/42 radii, mouse/pen vs touch behavior, board-plane projection, deterministic overlap ties, the illegal-nearest/no-magnet rule, stale selection rejection and tampered legal-target rejection.
