# THREEJS-045 — Canonical session state and reducer boundary

Status: **LOCKED by THREEJS-045 (2026-08-19); lifecycle locked by THREEJS-060; inventory/placement centralized by THREEJS-046; stable seat order/skips resolved by THREEJS-048; exact round-end revision added by THREEJS-051; win scoring/wins-to-match locked by THREEJS-052**

Canonical gameplay/session state is the JSON-only `yakolak.session-state/v1` object implemented by `web/app/session/canonical-session-state.js`.

## State shape

The canonical object contains only normalized application data:

- `lobbyGeneration`: non-negative configuration generation;
- `preferredColor`: `null` before setup, otherwise the host preference used to rotate the canonical configured-seat ring;
- `targetPlayers`: `null` or 2/3/4;
- `winsToMatch`: `null` or the locked 3/5 wins-to-match value;
- `seats[]`: exact `{ seatId, type, color, ready }` records in THREEJS-048 configured order;
- `board`: exact shared-rules 9-cell/3-size board;
- `inventory`: remaining pieces by seat/size, derived from `board` and never independently authoritative;
- `activeSeatId`: `null` or one configured stable seat identity;
- `deadlineAtMs`: `null` or one absolute epoch-millisecond deadline;
- `scores`, `round`, `completedRounds`;
- `roundEndRevision`: `null` during an unresolved round, otherwise the exact gameplay revision recorded when that round ended;
- `lastMove`;
- `skips[]`: ordered exact `{ seatId, reason }` handoff evidence;
- `winner`, `draw`, `matchComplete`, `matchWinner`, `matchWinners`;
- `restart` and `rematch`: per-seat boolean vote maps;
- `revision`: non-negative current canonical state revision;
- `lifecycle`: `{ phase, interrupt, recoveryTarget, presentationGeneration }`, validated by THREEJS-060.

Every object level uses a closed key set. Unknown fields are rejected.

## Stable configured seats

THREEJS-048 locks stable physical seat/color identity:

- `right = marble`
- `back = blue`
- `left = gold`
- `front = green`

The base ring is `right → back → left → front`. `preferredColor` rotates configured order only; physical slot/color identity never rotates. `turnIndex` is not canonical state.

The old singular `skippedSeat` / `skipReason` shape is not canonical. One handoff can skip multiple seats, so authoritative evidence is the ordered `skips[]` array.

## Derived inventory

THREEJS-046 centralizes inventory math in `web/app/shared/rules.js`. Canonical validation recomputes expected remaining counts from the board and rejects stale inventory. Placement legality never trusts the serialized inventory snapshot.

## Round-end revision and outcome

THREEJS-051 adds `roundEndRevision` so a completed round preserves the exact revision at which its result became authoritative even if live `revision` later advances.

Both authoritative outcomes now record:

`roundEndRevision = revision`

without incrementing `revision`; THREEJS-072 still owns revision/mutation advancement semantics.

- THREEJS-051 draw: `draw=true`, zero score delta, lifecycle `draw`.
- THREEJS-052 win: exactly one winner score increments by one, lifecycle `win`, and `matchComplete` depends only on reaching configured `winsToMatch`.

`completedRounds` is history only. It never triggers match completion. Match completion occurs only when a configured seat score reaches 3 or 5 wins as selected by `winsToMatch`.

## Pure reducer boundary

`runCanonicalSessionReducer(state, event, reducer)` validates canonical input, JSON-clones/deep-freezes state and event, runs one synchronous pure reducer, rejects input mutation/non-canonical output, and returns a deep-frozen canonical clone.

The boundary deliberately does not define gameplay revision increments. `lifecycle.presentationGeneration` is a separate THREEJS-060 stale-presentation boundary, not gameplay revision.

## Authority boundaries still open

- `seat.type` vocabulary / Computer online authority: THREEJS-062/071.
- authoritative readiness/start: THREEJS-069.
- online absolute deadline/timeout reconciliation: THREEJS-062/070.
- restart/rematch consensus: THREEJS-076.
- mutation/revision/exactly-once envelope: THREEJS-072.

Local deadline/timeout behavior is separately locked by THREEJS-049/050 and must not be projected onto Online authority.

## Runtime objects are forbidden

Canonical state may never contain meshes, Three.js objects, DOM nodes, animation callbacks/handles, service-worker state, request objects, timer handles or other class instances. Rendering/transport/session credentials remain outside gameplay state.

## Verification

Run:

- `node --test tests/threejs_canonical_session_state_contract.test.mjs`
- `node --test tests/threejs_session_lifecycle_contract.test.mjs`
- `node --test tests/threejs_placement_inventory_contract.test.mjs`
- `node --test tests/threejs_turn_ring_contract.test.mjs`
- `node --test tests/threejs_true_draw_contract.test.mjs`
- `node --test tests/threejs_win_scoring_contract.test.mjs`

Together these contracts cover JSON round-trip, stable configured seats, ordered skip evidence, board-derived inventory, lifecycle legality, pure reducer behavior, exact round-end revision, true draws, one-point winning-round scoring and locked 3/5 wins-to-match semantics.
