# THREEJS-040 — Last-accepted-move marker

Status: **LOCKED by THREEJS-040 (2026-08-20)**

THREEJS-040 projects canonical `lastMove` into one presentation-only marker. The marker is rebuilt from authoritative snapshots after refresh/reconnect and has no independent gameplay or lifecycle authority.

## Source of truth

The only move source is THREEJS-045 canonical `state.lastMove`:

`{ seatId, color, cell, size }`

The marker does not listen to pointer/selection events and does not infer a move from rendered pieces.

Before displaying a marker, the presentation verifies that the canonical board contains the same `lastMove.color` at the exact `cell` + `size` slot. A mismatch fails closed as `last_move_board_mismatch`.

## Distinct visual language

The last-move cue is a **floating inverted-pyramid pointer** above the canonical board-cell target.

It is intentionally not any of the visual languages used elsewhere:

- current selection: geometry outline + double halo ring (THREEJS-039);
- legal target: board ring (THREEJS-033);
- last move: inverted-pyramid pointer (THREEJS-040);
- winning highlight: reserved for its own winning-state presentation and must not reuse the last-move pointer.

The pointer shape, not its color, is the semantic signal. A light fill plus dark edge only preserves contrast. Piece size changes marker scale (`small 0.82`, `medium 1`, `large 1.18`) while the pointer shape remains the same.

The marker uses the canonical interaction target center from `deriveGameplayInteractionTargets(...)`, not decorative board geometry.

## Revision + move identity

Every visible marker carries a deterministic identity:

`revision:<revision>|round:<round>|move:<seatId>:<color>:<cell>:<size>`

This does not pretend that canonical `lastMove` stores its original acceptance revision—it does not. Instead it binds the currently hydrated authoritative revision/round to the exact move tuple being presented.

Within one identical generation + revision + round witness, the move identity is immutable. If another snapshot attempts to present a different `lastMove` at the same witness, the marker fails closed as `last_move_revision_identity_conflict`.

A newer revision may legitimately carry the same `lastMove` (for example after unrelated authoritative lifecycle work); that snapshot rebuilds the same cell marker under its new revision binding.

## Snapshot rebuild and stale protection

`applySnapshot(state)` is the only presentation update path.

It records:

- THREEJS-060 presentation generation;
- authoritative revision;
- round.

Older generation/revision/round snapshots are rejected and cannot resurrect a marker after reconnect or a round reset.

Round is included deliberately: the authoritative round-advance path may clear `lastMove` while preserving the current revision/generation before the next authority revision is committed.

## Authority-owned clear boundary

THREEJS-040 exposes **no `clear(reason)` API**.

The marker remains visible while the canonical snapshot contains `lastMove`, including ordinary turn/lifecycle changes where authority has not cleared it.

It disappears only when authority supplies a valid canonical snapshot with:

`lastMove = null`

This matches authoritative round/reset behavior, which clears `lastMove` alongside the board lifecycle reset.

Resource disposal may of course hide/destroy the marker when the scene generation itself is released; that is not gameplay clearing.

## Presentation-only implementation

The marker owns one group with two render primitives:

- filled 4-sided cone/pyramid mesh;
- dark edge lines.

It never mutates board state, inventory, turn, selection, score or piece materials. It owns no RAF/timer/Promise queue or tween scheduler.

`requestRender()` is called synchronously when a visible marker is rebuilt/moved or when an authoritative `lastMove=null` snapshot hides a previously visible marker.

Repeated hidden snapshots do not request redundant rendering.

## Verification

Run:

- `node --test tests/threejs_last_move_marker_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract proves canonical cell projection, board/lastMove consistency, size scaling, revision/move binding, reconnect rebuild, stale rejection, one-marker replacement, same-revision round-reset clearing, no stale resurrection, and the absence of a local clear API or private animation loop.
