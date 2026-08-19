# THREEJS-042 — Revision-safe accepted piece travel

Status: **LOCKED by THREEJS-042 (2026-08-20)**

THREEJS-042 owns only the presentation sequence and presentation/input locks for a move that authority has already accepted. It does not validate legality, commit board state, award score, advance lifecycle, choose the next seat, or start/extend a deadline.

## Authority boundary

State commits before travel begins.

A travel may start only from a valid canonical snapshot whose `lastMove` is already committed and whose board contains the same color in the same `cell + size` slot.

The caller must identify one exact logical source `pieceId`. THREEJS-042 cross-checks that runtime piece identity against canonical `lastMove.color` and `lastMove.size`.

The presentation bridge supplies the exact runtime source transform and exact canonical board transform for that `pieceId + cell`. THREEJS-042 does not derive a second board layout or invent a destination from pixels.

## Approved travel

The locked accepted-placement sequence is:

- duration: **520 ms**;
- easing: `easeInOutCubic`;
- vertical arc: **18 Y**;
- start: exact current runtime piece transform;
- finish: exact canonical committed board transform.

Arc lift is presentation-only. At progress `0` and `1`, arc contribution is forced to literal zero so the endpoints are byte-for-byte numeric copies of the supplied runtime transforms rather than relying on floating-point `sin(π)` being zero.

All interpolation, RAF ownership, cancellation and reduced-motion behavior belong to THREEJS-096. THREEJS-042 only submits a numeric transform sequence to the single motion controller.

## Pending and travel locks

`beginPending(...)` applies a presentation lock before authority resolves the request. `startAcceptedTravel(...)` transitions that lock to `travel` after an accepted canonical snapshot is available.

The lock blocks only conflicting presentation/input:

- board targeting;
- piece selection;
- piece drag;
- move confirmation;
- free-camera interaction.

The lock explicitly does **not** own or delay:

- authoritative turn deadline;
- authoritative handoff;
- scoring;
- round lifecycle;
- board state;
- inventory.

This matches the authoritative local adapter, which may already have committed the next seat and its deadline before accepted presentation travel starts.

## Current generation + accepted revision

Every travel is submitted to THREEJS-096 with:

- `generation = state.lifecycle.presentationGeneration`;
- `revision = accepted state.revision`;
- the accepted round;
- the exact logical piece ID;
- the canonical destination cell.

A stale accepted snapshot is rejected. Two different canonical states under the same generation/revision/round witness fail closed.

## Newer hydration / revision cancellation

`observeSnapshot(...)` records monotonic canonical authority and synchronizes THREEJS-096.

If generation or revision changes, THREEJS-096 cancels the active travel through its authority synchronization path.

If only round changes while generation/revision are unchanged, THREEJS-042 still asks THREEJS-096 to cancel the accepted-travel scope. This matters because round advance may preserve revision.

Cancellation uses the travel's 096 `snapToCanonical` callback exactly once and snaps the accepted piece to the same canonical final transform that the travel would have reached normally.

The caller that hydrated the newer snapshot may then reconcile the rest of the scene from that newer canonical state. THREEJS-042 does not guess another rollback or perform a second canonical rebuild.

## Stale completion safety

Motion completion has presentation authority only.

A completed/cancelled handle may clear the matching presentation lock if it is still current. It cannot:

- award score;
- advance turn/lifecycle;
- mutate board/inventory;
- modify deadlines;
- submit another gameplay intent.

When a newer snapshot has already cleared/replaced the travel, late cancelled RAF callbacks and late `finished` handlers fail the current-travel identity check and no-op.

## Reduced motion

Reduced-motion execution remains inside THREEJS-096. The accepted travel record is installed before `motion.animate(...)` is called so 096 may synchronously apply the final transform without losing the update.

The result is the exact same canonical final transform and the same lock semantics, without a private scheduler in THREEJS-042.

## Verification

Run:

- `node --test tests/threejs_accepted_piece_travel_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract covers source-piece identity, canonical board consistency, pending locks, the 520 ms / arc 18 sequence, exact endpoints, reduced motion, revision cancellation, round-only cancellation, one canonical snap, stale RAF no-op, same-witness conflict rejection, and absence of gameplay-authority mutations or a private animation loop.
