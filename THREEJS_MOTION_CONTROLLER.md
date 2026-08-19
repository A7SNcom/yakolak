# THREEJS-096 — One cancellable non-camera motion controller

Status: **LOCKED by THREEJS-096 (2026-08-19)**

THREEJS-096 is the single scheduling/ownership boundary for non-camera transform, opacity and scale tweening used by gameplay interactions. Camera motion remains separate under the camera/frame-governor work.

## Required consumers

THREEJS-032, THREEJS-033, THREEJS-034, THREEJS-035, THREEJS-036, THREEJS-038 and THREEJS-039 must use this controller for every non-camera tweened interaction they add.

Those tasks must not create parallel raw `requestAnimationFrame`, `setTimeout`, `setInterval` or uncancelled Promise-based tween loops.

## Controller identity

Every motion has:

- `scope` — logical interaction/object group;
- `key` — one motion channel inside that scope;
- `generation` — the presentation generation that owns the target;
- a monotonically increasing controller-local sequence.

The active identity is `scope + key`. Starting newer motion for the same identity cancels and settles the older handle before the new one can progress.

Different scoped identities may animate independently.

## Numeric state

The controller is intentionally Three.js-independent. `from` and `to` are matching finite numeric trees made from numbers, arrays and plain objects.

A consumer may therefore tween related cosmetic state atomically, for example:

```text
{
  position: [x, y, z],
  scale: [x, y, z],
  opacity: n
}
```

Built-in easing names are `linear`, `easeOutCubic` and `easeInOutCubic`; a validated custom easing callback is also supported.

## Generation and target liveness

Every `animate(...)` call supplies the generation it observed. If it does not equal the controller generation, the returned handle settles `stale-generation` without applying or scheduling anything.

Before every cosmetic write the controller also calls the required `isTargetLive()` guard. A rebuilt/released target settles `stale-target` and receives no further writes.

`setGeneration(next)` cancels all active motion before switching generations. Even if a platform later delivers a callback that was already cancelled, that callback cannot mutate because the active-entry/generation/sequence checks no longer match.

## Resource ownership

The controller owns one THREEJS-027 transient resource scope.

All animation frames use `lifecycle.requestFrame(...)`. Frame cancellation uses the registry token returned by that call. Optional Reduced Motion media-query subscription uses `lifecycle.listen(...)`.

No raw animation-frame/timer scheduling exists in the controller. Releasing the controller cancels every active handle and releases its resource scope.

## Reduced Motion

Reduced Motion collapses cosmetic timing to the exact final state:

- starting motion while Reduced Motion is enabled applies `to` immediately and allocates no frame;
- enabling Reduced Motion during active motion cancels the pending frame, writes the exact `to` state once if the target is still live/current, and settles the handle as `reduced-motion`;
- duration `0` also commits final presentation state immediately.

Reduced Motion changes timing only. It must never change the intended committed transform/state.

## Gameplay must not wait

Gameplay selection, picking, legality, intent creation and authority submission must never depend on `handle.finished` before committing their gameplay decision.

Consumers may observe the `finished` Promise for cleanup/presentation sequencing, but the gameplay state transition must already be decided independently. Every controller-owned Promise settles on completion, cancellation, stale generation/target, Reduced Motion or controller release; there are no free-running Promise chains.

## Public operations

`createMotionController(...)` exposes:

- `animate(...)`
- `cancel(scope, key, reason?)`
- `cancelScope(scope, reason?)`
- `setGeneration(nextGeneration)`
- `setReducedMotion(boolean)`
- `snapshot()`
- `release()` / `dispose()`

`animate(...)` returns an immutable handle containing `finished` and `cancel(...)`.

## Verification

Run:

- `node --test tests/threejs_motion_controller_contract.test.mjs`
- `node --test tests/threejs_motion_controller_source_contract.test.mjs`
- `npm run test:threejs:gameplay`

The behavioral contract covers interpolation, same-key supersession, independent scopes, stale cancelled callbacks, generation replacement, target release/rebuild, Reduced Motion start/mid-flight behavior, media-query listener ownership and controller release. The source contract forbids raw frame/timer scheduling and free-running `.then(...)` chains in this controller.
