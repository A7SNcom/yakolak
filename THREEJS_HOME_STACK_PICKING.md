# THREEJS-031 — Home-stack picking and remaining-piece targets

Status: **LOCKED by current THREEJS-031 task (2026-08-19)**

This task builds on the dedicated invisible stack hit proxies already present on the THREEJS-031 interaction layer. It adds canonical-state-aware logical targets for the active seat's nested home pieces without moving pieces or committing selection state.

## Active-seat boundary

Home-stack targets are available only during an uninterrupted canonical `turn-loop` and only for `state.activeSeatId`.

A request for another configured seat fails before selection with `home_stack_not_active_seat`. UI/presentation code may therefore not expose or activate another seat's home pieces merely because their meshes are visible.

## Canonical availability

Availability comes only from canonical `state.inventory`, which itself is validated against board occupancy by the canonical session schema.

Each size has three identical copies and gameplay state does not assign authoritative copy IDs. THREEJS-031 therefore uses one deterministic **presentation-only** home-copy allocation:

- if a size has `N` remaining copies, home copy indices `0..N-1` remain available;
- copy indices `N..2` are treated as already used/placed.

This convention does not change placement rules, inventory counts or gameplay identity. It only prevents hydration/rebuild from arbitrarily moving the remaining identical home copies between the three canonical stack centers.

## Nested logical targets

For the active seat, each canonical stack proxy `stack:<seatId>:<stackIndex>` derives three nested logical descriptors in outer-to-inner semantic order:

`large → medium → small`

Target IDs are:

`home-piece:<seatId>:<stackIndex>:<size>`

Each descriptor records stable seat/color/stack/copy/size, current remaining count, `available`, and `unavailableReason`.

Used copies remain describable for deterministic presentation layout but are not selectable. `resolveHomePieceTarget(...)` rejects them with `home_piece_already_used` before any selection mutation.

`remainingHomeSizeTargetsForStack(...)` returns only currently available L/M/S logical targets for the activated canonical stack.

## Hit-area boundary

The visible piece geometry is not enlarged. Pointer picking first resolves the generous invisible stack proxy from THREEJS-031 (`stack:<seatId>:<stackIndex>`, current radius 24 derived from canonical stack spacing). This module then derives the remaining nested L/M/S logical piece targets from canonical inventory.

THREEJS-032 may separate/open those remaining targets visually through the single THREEJS-096 motion controller. THREEJS-033 may choose exactly one size. Neither task needs to raycast overlapping visible piece meshes or invent another inventory source.

## Purity and resync

This module stores no selected piece and mutates no canonical or presentation state. Re-running it after hydration, timeout, move, reconnect or any authoritative snapshot deterministically derives the current remaining targets from that snapshot.

## Verification

Run:

- `node --test tests/threejs_home_stack_picking_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract covers active-seat enforcement, canonical inventory derivation, deterministic remaining-copy allocation, used-size rejection, another-seat rejection, nested L/M/S ordering and full-size exhaustion.
