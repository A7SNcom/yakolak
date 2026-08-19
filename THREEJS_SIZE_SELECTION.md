# THREEJS-033 — Size selection and legal-cell visualization

Status: **LOCKED by THREEJS-033 (2026-08-19)**

THREEJS-033 owns one ephemeral local selection: exactly one remaining size plus the board cells that are legal for that size under the current canonical authority snapshot.

It does not own placement authority, picking radii, drag state or motion scheduling.

## One selected remaining size

`deriveSizeSelection(state, { stackTargetId, size })` first resolves the requested nested home piece through THREEJS-031. This guarantees that:

- the stack belongs to the current active seat;
- the requested size/copy still remains in canonical inventory;
- a used/exhausted copy cannot become selected.

The selection controller stores one frozen replacement object. Selecting another valid size replaces the previous selected size, piece target and legal-cell model; selections never accumulate.

## Immediate legal-cell derivation

Legal cells are computed synchronously by calling the shared `validatePlacementForSeat(...)` for cells `0..8` with the selected size.

THREEJS-033 does not duplicate occupancy or remaining-inventory rules. Only validator results with `ok=true` enter:

- `legalCells`;
- `legalTargetIds` (`board:<cell>`);
- `legalCellCues`.

Invalid cells have no visualization entry at all. THREEJS-034 will own deterministic physical board-cell picking/radius validation against this legal set.

## Color-independent visual contract

Selection/legality must remain understandable without color. The logical presentation contract therefore exposes geometry/shape semantics:

- selected remaining piece: `outline` marker;
- legal board target: `ring` marker;
- `colorIndependent=true`.

The selected cue carries the size and selected state explicitly; it does not carry a color field. Legal-cell cues are emitted only for valid cells.

A downstream renderer may choose accessible styling for these semantic markers, but it may not make color the only indication of selection or legality.

## Authority witness

Each selected state carries:

- THREEJS-060 presentation generation;
- authoritative revision;
- round;
- active seat.

Once a controller has observed a newer generation/revision, an older canonical snapshot is rejected as `stale_size_selection_snapshot` and cannot resurrect old targets.

While a selection is active, crossing to a different authority witness requires a clear boundary first (`size_selection_requires_boundary_clear`). This prevents an old selected size from silently surviving a turn/revision/round ownership transition.

Selection derivation is completed before controller state is changed. A failed/illegal selection therefore cannot pair a new authority witness with old visuals.

## Atomic clear boundaries

The required clear reasons are locked as:

- `cancel`;
- `timeout`;
- `accepted-resync`;
- `rejected-resync`;
- `ownership-change`;
- `reconnect`;
- `round-reset`.

`clear(reason, canonicalState?)` replaces the complete selection object once. The replacement simultaneously clears:

- selected size;
- selected logical piece target;
- selected stack/seat;
- legal cell IDs;
- legal target IDs;
- selected outline cue;
- legal ring cues.

`cancel`/`timeout` may clear immediately before a newer snapshot is available. Resync/ownership/reconnect/round-reset callers should pass the newest canonical state so the cleared state also records the new authority witness.

## No animation or delayed legality

This module has no timeout, interval, RAF, Promise queue or motion ownership. Selection and legal target feedback are synchronous. Stack opening/closing remains THREEJS-032 through THREEJS-096; drag/travel belongs to later tasks through the same motion authority.

## Verification

Run:

- `node --test tests/threejs_size_selection_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract covers shared-validator legal cells, occupied-slot exclusion, exactly-one replacement, used-size rejection, color-independent marker semantics, every required atomic clear reason and stale snapshot rejection after reconnect/resync.
