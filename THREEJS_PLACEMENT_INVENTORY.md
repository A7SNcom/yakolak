# THREEJS-046 — Centralized placement and inventory legality

Status: **LOCKED by THREEJS-046 (2026-08-19), backend authority alignment verified 2026-08-23**

All cell/size/occupancy/piece-availability legality now comes from the shared browser/backend-safe rules package in `web/app/shared/rules.js`.

## Stable canonical rejection codes

Canonical callers use these machine-readable codes:

- `unknown_seat`
- `invalid_cell`
- `invalid_size`
- `occupied_slot`
- `no_piece_remaining`

`validatePlacementForSeat(state, seatId, move)` is source-independent: human input, bot choice and local authority pass the same normalized seat/move data through the same validator. Backend authority uses the same strict legality core through `applyCanonicalMoveTransition(...)` → `placeCanonicalPiece(...)`. Actor origin, input device and transport do not create alternate rule branches.

The canonical validator is intentionally strict. `cell` must already be an integer `0..8` and `size` must already be one of `small`, `medium`, `large`. Input-device/transport coercion is outside gameplay legality. The authoritative network envelope preserves raw `cell`/`size` JSON values and does not redefine their legal domain; invalid values are rejected by shared rules as `invalid_cell` or `invalid_size`.

## Inventory is derived, never independently authoritative

Remaining inventory is computed from canonical `board` plus configured seat color using `deriveRemainingInventory*`. The shared rule `copiesPerSizePerColor` is the only stock limit.

`yakolak.session-state/v1` still serializes an `inventory` snapshot for convenient hydration/rendering, but canonical validation recomputes it from the board and rejects stale counts. Placement legality itself never trusts the serialized counter: changing `state.inventory` cannot allow an exhausted piece or reject a piece that the board says remains.

## Protocol-v5 compatibility boundary

The historical `validatePlacement(board, color, move)` export remains only as a v5 input-envelope adapter. It preserves the observed legacy behavior that coerces `cell`/`size` and groups invalid cell/size as `invalid_move`.

That wrapper does **not** carry a second occupancy or inventory rules engine. After its historical normalization, it uses the same shared occupancy/piece-availability core as canonical validation. `api/game-rules.js` remains a thin re-export of this shared package. Legacy `applyMoveTransition(...)` keeps that v5 envelope, while authoritative backend mutations use the strict `applyCanonicalMoveTransition(...)` path.

## Authority boundary

THREEJS-046 centralizes placement legality only. It does not decide:

- whose turn is active or stable seat order (THREEJS-048);
- readiness/start authority (THREEJS-069);
- online Computer authority (THREEJS-071);
- authoritative deadline/timeout behavior (THREEJS-070);
- mutation/revision/exactly-once semantics (THREEJS-072).

Those adapters may decide whether a placement request is eligible to reach the validator, but they may not redefine cell, size, occupancy or piece-availability legality.

## Verification

Run:

- `node --test tests/threejs_placement_inventory_contract.test.mjs`
- `node --test tests/threejs046_backend_authority_placement_contract.test.mjs`
- `node --test tests/threejs_canonical_session_state_contract.test.mjs`
- `node --test tests/threejs_session_lifecycle_contract.test.mjs`

The contracts prove identical source-independent legality, strict canonical types, stable rejection codes, board-derived inventory, tampered-counter immunity, current backend-authority alignment, and preservation of the historical v5 input/error envelope without duplicating rule semantics.
