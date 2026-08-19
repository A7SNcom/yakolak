# THREEJS-053 — Persistent physical score markers

Status: **LOCKED by THREEJS-053 (2026-08-19)**

Physical score markers are presentation derived only from canonical authoritative `state.scores`. No renderer-local counter, round-local score cache, animation count, or hydration guess may become a second score authority.

## Canonical physical layout

THREEJS-053 reuses the already definitive score layout from `YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json` through `deriveAuthoritativeScoreLayout(...)`:

- radius: `85`
- gap: `11`
- order: `[0, -1, 1, -2, 2, -3, 3]`
- score plane: the canonical zone/contact plane (`Y=2`)
- stable physical seat/color identity from THREEJS-048:
  - `right = marble`
  - `back = blue`
  - `left = gold`
  - `front = green`

Host-preference turn rotation never rotates physical score-marker positions.

## Resource reuse

`createScoreMarkerInstances(...)` remains the physical renderer primitive:

- one decoded `score-marker.glb` geometry is reused by every seat;
- one `THREE.InstancedMesh` is created per stable physical seat/color;
- every seat mesh precomputes the canonical seven score-slot matrices;
- marker visibility is controlled only by `mesh.count`;
- playable-color materials are shared through the THREEJS-027 resource registry, not recreated per score point;
- decoded geometry remains asset-cache owned and is not cloned per marker.

THREEJS-053 does not create another marker geometry or material system.

## Authoritative score projection

`derivePersistentScoreMarkerState(state)` converts canonical stable-seat scores to all four physical marker counts. Configured seats use their authoritative `state.scores[seatId]`; unconfigured physical seats render zero.

`syncPersistentScoreMarkerInstances(instances, state)` validates that the renderer's physical seat/color records still match the THREEJS-048 bindings and that each authoritative score fits the physical slot capacity, then applies the canonical counts.

The presentation layer never increments/decrements score itself. Every sync is a full projection of the supplied canonical snapshot.

## Hydration and GPU rebuild

`rebuildPersistentScoreMarkerInstances(instances, canonicalSnapshot)` is intentionally stateless. A new GPU instance bundle after hydration/context/resource-generation rebuild must be populated from the supplied authoritative canonical snapshot.

There is no hidden presentation score cache to replay. Serializing/hydrating the same canonical state and rebuilding new score instances therefore produces the same physical counts deterministically.

## Round reset persistence

Round reset does not clear physical score markers. If authoritative cumulative scores remain unchanged while board/round/lifecycle reset, another sync renders the same marker counts.

There is deliberately no `clearRoundScoreMarkers()` presentation API.

## Fresh match/rematch reset

Markers disappear only when authoritative match/rematch state itself begins with reset scores. When the canonical scores become zero, the next full sync sets the physical instance counts to zero.

Presentation never decides that a round, animation, camera transition, visibility event, hydration event, or context rebuild is permission to erase score.

## Verification

Run:

- `node --test tests/threejs_persistent_score_markers_contract.test.mjs`
- `node scripts/verify-threejs-table-score-browser.mjs`

The Node contract verifies stable seat/color projection, hydration determinism, round-reset retention, fresh-match zeroing, unconfigured-seat zeroing, capacity failure and absence of presentation-side score accumulation.

The browser verifier proves the canonical radius/gap/order/contact plane, committed GLB usage, one shared geometry across all physical seats, one material per seat/color rather than per point, authoritative canonical counts, deterministic hydration, retained counts after round reset and zero counts only after an authoritative fresh-match score reset.
