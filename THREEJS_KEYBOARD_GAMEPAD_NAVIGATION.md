# THREEJS-037 — Keyboard and gamepad target navigation

Status: **LOCKED by THREEJS-037 (2026-08-20)**

THREEJS-037 adds deterministic keyboard/gamepad focus and confirmation over the same canonical remaining-piece selection, legal-cell derivation and engine-neutral gameplay intent path already used by pointer input.

It does not create a second rules engine, board-picking path, animation scheduler or authority adapter.

## Deterministic focus order

Remaining-size focus is derived from THREEJS-031 canonical home inventory.

The order is the physical nested stack order:

1. `large`
2. `medium`
3. `small`

Exhausted sizes are omitted. Exactly one focus target exists per remaining size; when multiple copies remain, the lowest available `stackIndex` represents that size so duplicate copies do not create duplicate keyboard/gamepad choices.

After size confirmation, THREEJS-033 becomes the sole legal-cell source. Cell focus order is the frozen `selection.legalCells` order, currently ascending canonical cell ID (`0..8` with illegal cells absent).

Navigation wraps deterministically at both ends.

## Input mapping

Keyboard:

- Right / Down → next target
- Left / Up → previous target
- Enter / Space → Confirm
- Escape → Cancel

Standard gamepad:

- A / button 0 → Confirm
- B / button 1 → Cancel
- D-pad Right / Down → next target
- D-pad Left / Up → previous target
- left stick axis beyond the configured threshold maps to the same next/previous actions

`gamepadNavigationAction(...)` is edge-aware: holding the same direction/button across consecutive snapshots does not emit duplicate actions.

## Confirm and Cancel semantics

Confirm on a size:

1. previews selection through `deriveSizeSelection(...)`;
2. refuses a size with zero legal cells;
3. commits the same THREEJS-033 selection controller state;
4. immediately moves focus to the first legal cell.

Confirm on a cell:

1. requires that cell to exist in the current THREEJS-033 `legalCells`;
2. constructs one THREEJS-029 human `move` intent through the injected `intentFactory`;
3. uses `keyboard-confirm` or `gamepad-confirm` only as presentation source;
4. locks `pending` before entering `authority.submit(intent)` so repeated/re-entrant Confirm cannot duplicate a mutation.

Pending confirmation cannot be locally cancelled. Accepted/rejected authority reconciliation follows the same generation/revision witness discipline used by pointer confirmation.

Cancel from legal-cell focus clears THREEJS-033 selection atomically and returns to deterministic size focus. Cancel from size focus exits navigation to idle.

## Same gameplay semantics as pointer input

THREEJS-037 never calls `validatePlacementForSeat(...)`, reads board occupancy directly or invents a keyboard/gamepad legality path.

- remaining sizes come from THREEJS-031;
- legal cells come from THREEJS-033;
- authority context and move serialization come from THREEJS-029.

For the same seat, size and cell, pointer/click, keyboard and gamepad intents must have identical `gameplayRuleSemantics(...)`; only `presentation.source` differs.

## Visible non-color-only focus

Every focus target exposes:

- `focusCue.marker = "focus-ring"`;
- `focusCue.colorIndependent = true`;
- no focus color field.

Renderers may style the ring accessibly, but color must never be the only focus signal.

## DOM accessibility contract

When a focus target participates through a DOM control, use the target's `dom` descriptor / `navigationDomProps(...)`:

- `role="button"`;
- an explicit `aria-label` describing the remaining size or exact board cell;
- focused target `tabIndex=0`, all peer targets `tabIndex=-1`;
- `dataFocusMarker="focus-ring"` and focused state metadata for the presentation bridge.

Examples:

- `Select medium remaining piece`
- `Place medium piece in board cell 6`

This keeps the control name available to screen readers independently of rendered color/material state.

## Authority and resync

Navigation carries the same canonical witness used by THREEJS-033:

- presentation generation;
- authoritative revision;
- round;
- active seat.

A newer authority witness requires explicit reconciliation before focus/selection can continue. Older snapshots fail closed and cannot resurrect stale focus.

While pending, a same-witness fake accepted reconciliation is rejected. Trusted `rejected-resync` or `reconnect` may reconcile the same revision; accepted ownership/round transitions require the newer canonical witness.

## Verification

Run:

- `node --test tests/threejs_keyboard_gamepad_navigation_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract covers exhausted-size omission, physical size order, legal-cell order, wrapping navigation, keyboard/gamepad mappings, held-gamepad edge suppression, Confirm/Cancel, non-color focus, DOM labels/tab order, re-entrant pending exactly-once behavior, pointer/keyboard/gamepad rule-semantic equivalence and stale-authority rejection.
