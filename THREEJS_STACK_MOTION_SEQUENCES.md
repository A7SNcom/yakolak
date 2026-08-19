# THREEJS-032 — Stack open/close targets and sequences

Status: **LOCKED by THREEJS-032 (2026-08-19)**

THREEJS-032 defines stack-specific presentation targets and motion sequence data. It does not own animation scheduling. Every sequence is executed exclusively through the single THREEJS-096 motion controller.

## Authoritative inputs

A stack sequence is derived only from:

- canonical session state and inventory;
- THREEJS-031 active-seat home-stack targets;
- authoritative `world-layout.json` home centers and piece rotation;
- the definitive Portable Kit motion contract.

The active stack must belong to the current canonical active seat. Pieces already consumed from canonical inventory are excluded before motion derivation.

## Exact stack motion contract

The definitive rebuild guide locks:

- stack open: **360 ms**;
- stack close: **360 ms**;
- default easing: smooth cubic ease-in-out (`easeInOutCubic`);
- remaining sizes separate vertically by **19 Y**;
- close return uses **arc 10**;
- cancelled/skipped presentation snaps once to the exact canonical final state.

Remaining nested targets arrive from THREEJS-031 in `large → medium → small` order. Their open positions are:

`homeY + 19 × remaining-rank`

The first remaining piece is the stack anchor and stays at the home center. Only pieces whose rank is greater than zero were actually separated; only those pieces receive the 10-unit close arc. Every normal close finishes exactly at the canonical home transform.

## Authority witness

Every plan carries:

- `generation = state.lifecycle.presentationGeneration` from THREEJS-060;
- `revision = state.revision`.

Before synchronizing THREEJS-096, `submitStackMotionPlan(...)` compares the plan with the controller snapshot. A plan older than the controller generation or revision is rejected locally as stale, so an old snapshot cannot move motion authority backward.

The plan is then submitted with `motionController.syncSessionAuthority(plan.lifecycle, plan.revision)` and every piece motion carries the same generation/revision witness.

## Atomic sequence preflight

Before authority sync or the first tween, THREEJS-032 preflights **every** piece in the stack:

- target is still live;
- current transform exists;
- current transform has the required finite numeric shape.

If any piece fails preflight, no frame is allocated and no partial stack sequence begins.

## Execution ownership

THREEJS-032 owns only sequence data and stack intent wiring. It contains no:

- `requestAnimationFrame` / `cancelAnimationFrame`;
- timeout/interval tween loop;
- Promise aggregation/completion queue;
- local stale-callback scheduler.

Every remaining piece is submitted independently to `motionController.animate(...)` under the same stack scope. THREEJS-096 owns all frame handles, cancellation, revision/generation invalidation, target liveness and stale callback suppression.

## Presentation adapter boundary

A scene/presentation adapter supplies four hooks:

- `readPieceTransform(pieceId)`;
- `applyPieceTransform(pieceId, transform, meta)`;
- `isPieceLive(pieceId)`;
- `snapPieceCanonical(pieceId, meta)`.

The last hook must reconcile from the **latest authoritative snapshot**. It must not blindly return a cancelled piece to home: a newer revision may already have committed that formerly-home piece to a board cell.

This keeps THREEJS-032 free of mesh identity and renderer ownership. Stable logical piece IDs come from THREEJS-031 and match the existing piece catalog IDs.

## Cancellation and resync

Explicit stack cancellation delegates to `motionController.cancelScope(stackTargetId, reason)`.

Turn/seat change, timeout, reconnect, lifecycle generation change or newer authoritative revision is represented by THREEJS-096 authority synchronization. Active stack motion is cancelled there and each still-live target canonical-snaps once from the latest snapshot. Released/rebuilt targets receive no stale writes.

No stack completion callback commits gameplay state.

## State commits before presentation

Gameplay authority and selection legality are decided independently of this animation. A caller must never await `handle.finished` before accepting/rejecting an intent, updating authority, changing turn, or applying a newer snapshot.

`finished` may be observed only for presentation sequencing or cleanup after the authoritative decision already exists.

## Reduced Motion

Reduced Motion submits the exact same plan through THREEJS-096. The controller collapses timing and writes the same exact final transforms. It does not create a separate stack lifecycle or selection path.

Because the close arc is derived from controller progress, final progress `1` always produces zero arc and the exact normal-close target.

## Verification

Run:

- `node --test tests/threejs_stack_motion_sequences_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract covers canonical remaining-piece filtering, exact 19-Y separation, 360/360 timing, close arc 10, exact normal-close home completion, active-seat rejection, atomic preflight, explicit cancellation, revision invalidation, canonical board resync after a newer revision, stale-plan rejection, Reduced Motion and source-level prohibition of a second scheduler.
