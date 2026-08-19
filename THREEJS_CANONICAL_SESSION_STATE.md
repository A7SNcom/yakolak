# THREEJS-045 — Canonical session state and reducer boundary

Status: **LOCKED by THREEJS-045 (2026-08-19); lifecycle vocabulary/transition graph refined and locked by THREEJS-060 (2026-08-19)**

Canonical gameplay/session state is the JSON-only `yakolak.session-state/v1` object implemented by `web/app/session/canonical-session-state.js`.

## State shape

The canonical object contains only normalized application data:

- `lobbyGeneration`: non-negative configuration generation;
- `targetPlayers`: `null` or 2/3/4;
- `winsToMatch`: `null` or the locked 3/5 wins-to-match value;
- `seats[]`: exact `{ seatId, type, color, ready }` records;
- `board`: the exact 9-cell/3-size shared-rules board;
- `inventory`: remaining pieces by seat and size, derived from `board` and never independently authoritative;
- `activeSeatId`: `null` or the exact configured seat identity whose turn is active;
- `deadlineAtMs`: `null` or one absolute epoch-millisecond deadline;
- `scores`, `round`, `completedRounds`;
- `lastMove`, `skippedSeat`, `skipReason`;
- `winner`, `draw`, `matchComplete`, `matchWinner`, `matchWinners`;
- `restart` and `rematch`: per-seat boolean vote maps;
- `revision`: non-negative canonical state revision value;
- `lifecycle`: `{ phase, interrupt, recoveryTarget, presentationGeneration }`, validated by the THREEJS-060 lifecycle state machine.

Every object level uses a closed key set. Unknown fields are rejected rather than silently retained.

`turnIndex` is intentionally **not** canonical state. The current protocol-v5 adapter may still expose an array index, but encoding that index into the new state would silently make `seats[]` order authoritative before THREEJS-048 resolves stable seat topology/turn order. Adapters must translate their current representation to `activeSeatId`; future canonical ordering must come from the THREEJS-048 contract rather than accidental array position.

## Derived inventory

`inventory` is serialized for snapshot convenience but is not a second mutable count. `deriveCanonicalInventory(board, seats)` computes it from placed board pieces and the locked `copiesPerSizePerColor` rule. Canonical validation rejects stale inventory or more placed pieces of a size/color than the rules allow.

This is the boundary THREEJS-046 must consume when it centralizes placement/inventory legality.

## Pure reducer boundary

`runCanonicalSessionReducer(state, event, reducer)`:

1. validates canonical input;
2. JSON-clones and deep-freezes state;
3. accepts only plain JSON event data;
4. calls a synchronous pure reducer;
5. rejects mutation of the input or any non-canonical output;
6. returns a deep-frozen JSON clone.

The boundary deliberately does **not** require a particular gameplay `revision` increment. Mutation/revision/exactly-once semantics remain owned by THREEJS-072/GAP-009.

THREEJS-060 adds one separate `lifecycle.presentationGeneration` boundary for presentation callbacks. It invalidates stale animation/network completion events without pretending to be the authoritative gameplay revision.

## Explicit authority non-resolutions

This schema stores data needed by later authority tasks without deciding their unresolved semantics:

- `seat.type` is an opaque normalized token. THREEJS-062 owns the authoritative configured-seat/type vocabulary and Computer authority semantics.
- `ready` is `null` or boolean. THREEJS-069 owns what makes a seat authoritative-ready and when Start may commit.
- `deadlineAtMs` is an internal absolute representation only. THREEJS-062/070 own where the authoritative deadline comes from, clock semantics and timeout reconciliation.
- `skipReason` is an opaque reason token. THREEJS-048/070 own legal-move and timeout skip semantics.
- `restart`/`rematch` serialize per-seat approvals but do not define required voters or consensus. THREEJS-076 owns that contract.
- stable seat topology/turn-ring meaning is not inferred from `seats[]` order; THREEJS-048 owns it.

Lifecycle **is no longer an open vocabulary** after THREEJS-060: normal phases, interrupt states, recovery rules and legal phase edges are locked in `web/app/session/session-lifecycle.js`. That lifecycle machine still does not grant browser-side gameplay authority; it only orders canonical application states and rejects stale presentation callbacks.

## Runtime objects are forbidden

Canonical state may never contain meshes, Three.js objects, DOM nodes, animation handles/callbacks, service-worker state, request objects, local timer handles or other class instances. Exact-key validation plus plain-JSON validation keeps those concerns outside gameplay state.

`web/app/session/canonical-online-session.js` remains a separate identity/transport helper; callbacks, credential/session transport state and compatibility gates are not embedded in canonical gameplay state.

## Verification

Run:

- `node --test tests/threejs_canonical_session_state_contract.test.mjs`
- `node --test tests/threejs_session_lifecycle_contract.test.mjs`

Together these contracts cover JSON round-trip, seat/color normalization, seat-identity active turns without array-order authority, deadline consistency, derived inventory, board ownership, scores/votes, last move/skip/outcome fields, pure reducer behavior, lifecycle legality, presentation-generation staleness, JSON coercion protection and explicit rejection of rendering/DOM/service-worker/timer state.
