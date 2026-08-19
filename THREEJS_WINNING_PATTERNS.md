# THREEJS-047 — Exact winning patterns and winning slots

Status: **LOCKED by THREEJS-047 (2026-08-19)**

All win detection remains in the shared browser/backend-safe rules package. THREEJS-047 verifies every target win pattern deterministically and binds scoring evaluation to the exact accepted placement that completed the pattern.

## Exhaustive pattern matrix

The contract covers exactly 49 primitive winning patterns:

- **24 same-size lines:** 8 board lines × `small` / `medium` / `large`;
- **16 graded lines:** 8 board lines × both orders `small→medium→large` and `large→medium→small`;
- **9 complete-cell wins:** all three sizes occupied by one color in each of the 9 cells.

`tests/threejs_winning_patterns_contract.test.mjs` constructs each fixture from pure placements, verifies the exact pattern object and verifies the exact unique slot list.

## Accepted-placement boundary

Canonical reducers use:

`winningOutcomeAfterAcceptedPlacement(board, color, { cell, size })`

The function requires the named normalized slot to contain the player's just-committed piece and returns only winning patterns that contain that exact slot. Therefore:

- a rejected placement cannot trigger win evaluation;
- a stale/pre-existing winning pattern elsewhere cannot be resurrected by a later unrelated legal move;
- only patterns completed by the accepted placement are returned.

The historical `winner(board, color)` boolean query remains for protocol-v5 compatibility, but shared move transitions now use the accepted-placement outcome boundary.

## Presentation result

The outcome is deeply frozen and contains:

- `won`: boolean;
- `patterns`: every winning pattern completed by the accepted placement;
- `winningSlots`: the exact de-duplicated `{ cell, size }` slots across those patterns.

Presentation may highlight `winningSlots` directly. It must not rediscover or reinterpret winning geometry independently.

## Multiple patterns, one round point

One accepted placement may complete several patterns simultaneously. The shared move transition evaluates all such patterns but invokes `finishRoundTransition` only once.

The deterministic overlap fixture completes both:

- small same-size line `[0,1,2]`; and
- complete cell `2`.

It returns five unique winning slots while incrementing the winner's round score by exactly **one**, never once per pattern.

## Verification

Run:

- `node --test tests/threejs_winning_patterns_contract.test.mjs`
- `node --test tests/threejs_placement_inventory_contract.test.mjs`

The exhaustive contract reports `patterns=49` and also verifies rejected-placement guarding, stale-pattern filtering, exact unique slots and one-point scoring for multi-pattern completion.
