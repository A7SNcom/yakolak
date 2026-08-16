# Three.js Authoritative Seat and Turn Contract

Status: **LOCKED by THREEJS-008 (2026-08-16)**

Scope: `threejs-rebuild` only. This contract resolves only GAP-001 / SRC-003. It does not resolve seat types, invitation lifecycle, ready/start, deadlines, timeout triggering, TTL, restart-round, mutation coverage, recovery, telemetry, protocol migration, or cutover.

## 1. Canonical seat topology

The canonical color ring is:

`marble → blue → gold → green`

For a configured match, rotate that ring so the host's preferred color is first, then keep the configured number of seats (2, 3, or 4).

Seat IDs are stable positional identities:

- `p1` = first entry in the rotated ring and the host seat;
- `p2` = second entry;
- `p3` = third entry when configured;
- `p4` = fourth entry when configured.

Examples:

- host `marble`, 3 seats → `p1=marble, p2=blue, p3=gold`;
- host `gold`, 3 seats → `p1=gold, p2=green, p3=marble`;
- host `green`, 4 seats → `p1=green, p2=marble, p3=blue, p4=gold`.

Join arrival order, network timing, invitation claim timing, presence order, and array insertion order never redefine seat order.

The spatial material mapping remains the separate fixed presentation mapping locked by THREEJS-005 (`right=marble`, `back=blue`, `left=gold`, `front=green`). A seat's physical side is obtained from its canonical color; the frontend must not invent a second seat ring.

## 2. Turn authority

`turnSeat` is the canonical authoritative current-turn identity.

`turnIndex` remains only a compatibility mirror giving the index of `turnSeat` in the current public `players` array. New Three.js code must not derive authority by incrementing `turnIndex` locally.

The authoritative turn order is the configured `seatTopology` order. A normal accepted move scans forward cyclically from the acting seat through that order.

## 3. No-legal-move skip and draw

After an accepted non-winning move, authority scans every configured/active seat cyclically, beginning with the next seat.

- A seat with no legal move is skipped.
- Every skipped seat is recorded in order in `skippedSeats`.
- `skippedSeat` is a legacy compatibility mirror of the first entry only.
- `lastHandoff` records `fromSeat`, `toSeat`, `skippedSeats`, and a reason.
- If every other seat is unable to move but the acting seat still has a legal move, the scan completes the ring and returns the turn to that same seat. This is **not** a draw.
- A round is a draw only when a complete authoritative scan finds **no configured active seat with any legal move**.

The frontend may animate the recorded skip/handoff but may not recalculate a different result from presentation state.

## 4. Round starters

Round 1 starts at `p1`.

Each subsequent round advances the starter by exactly one seat in canonical seat order, wrapping at the end:

- 2 seats: `p1 → p2 → p1 → ...`
- 3 seats: `p1 → p2 → p3 → p1 → ...`
- 4 seats: `p1 → p2 → p3 → p4 → p1 → ...`

`roundStarterSeat` is the authoritative starter identity for the current round. `turnSeat` is set to it when the next round begins.

A full-match rematch restarts at `p1` unless a later explicit product-rule task changes that rule.

## 5. Wire/state fields introduced on the migration branch

THREEJS-008 adds these additive room-state fields on `threejs-rebuild`:

- `seatContract: 1`
- `seatTopology: [{ seat, color }, ...]`
- `turnSeat`
- `roundStarterSeat`
- `skippedSeats`
- `lastHandoff`

Legacy `turnIndex` and `skippedSeat` remain compatibility mirrors for now.

The room table name and public protocol remain version 5 in this task. Final old-room compatibility, protocol/table migration, defaults for pre-existing v5 snapshots, and cutover compatibility remain owned exclusively by THREEJS-019 / GAP-012.

## 6. Waiting-room edits are not resolved here

This task defines what a settled seat topology means; it does **not** decide the invitation/lobby invalidation lifecycle when topology-affecting settings are edited after invitations or joins exist.

That lifecycle remains GAP-003 / THREEJS-010. No frontend may use this contract to invent cancellation, remapping, invitation replacement, or lobby recreation behavior.

## 7. Invariants for later tasks

Later tasks must preserve:

1. One authoritative ordered `seatTopology` per configured match.
2. `p1` is host and first in the host-color-rotated canonical ring.
3. Join order never changes turn order.
4. `turnSeat`, not a client-side counter, owns the current turn.
5. Round starters rotate one canonical seat per round.
6. Skip evidence is authoritative and ordered.
7. A full cycle may legally return the turn to the same seat.
8. Draw requires zero legal moves across all configured active seats.
9. Later computer/online authority may change actor type, but not seat order semantics unless an explicit task reopens this contract.
