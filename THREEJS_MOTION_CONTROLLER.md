# THREEJS-096 — One stale-safe motion controller

Status: **LOCKED by THREEJS-096 (2026-08-19; Reduced Motion/audio ownership hardened 2026-08-23)**

THREEJS-096 is the single scheduling/ownership boundary for **setup, camera transition, stack, piece, travel, reveal, unboxing, win and reset motion**. Camera tasks may define camera sequence data, but interpolation/cancellation belongs here. The existing camera frame governor remains render-loop governance only and is not a second tween scheduler. Gameplay authority never waits for presentation motion.

## Required consumers

THREEJS-032/042/084/091/095 and later presentation/camera tasks may define transforms, approved normal/Reduced Motion timings and sequences, but they must submit motion through this controller. They may not create independent RAF/tween schedulers, completion queues or stale-callback mechanisms.

The controller itself never calls raw `requestAnimationFrame`, `cancelAnimationFrame`, `setTimeout` or `setInterval`; every frame handle belongs to the THREEJS-027 resource registry.

## Authority witness

Every `animate(...)` request carries both:

- `generation` — THREEJS-060 `sessionLifecycle.presentationGeneration`;
- `revision` — the authoritative gameplay/session revision observed when the sequence was derived.

A stale generation settles `stale-generation`; a stale revision settles `stale-revision`. Neither applies `from`, `to`, nor schedules a frame.

`syncSessionAuthority(sessionLifecycle, revision)` validates the THREEJS-060 lifecycle object and synchronizes both witnesses together. `setAuthority(generation, revision)`, `setGeneration(...)` and `setRevision(...)` are lower-level operations for the same boundary.

Any generation/revision change cancels all active entries before stale callbacks can write.

## Motion identity

Each motion also carries `scope + key`. This is the active channel identity. Starting newer motion for the same channel supersedes the older motion before the newer one progresses.

Different channels—including camera and object channels—may run concurrently.

## Canonical snap contract

Every motion must supply:

- `apply(value, meta)` for interpolated presentation writes;
- `isTargetLive()` so rebuilt/released targets cannot be mutated;
- `snapToCanonical(meta)` for cancellation/revision/generation/release reconciliation.

On cancellation or supersession, canonical snap is attempted **once**. If the target is still live, `snapToCanonical(...)` runs exactly once. If the target has already been released/rebuilt, the attempt is consumed but no target write is allowed.

Results expose both `snapAttempted` and `snappedCanonical` so tests can distinguish these cases.

The canonical snap callback is intentionally consumer-provided because only the consumer/current authoritative snapshot knows the correct final transform after reconnect, timeout, revision advance or rebuild. The controller owns when it may execute, not the game-specific transform.

## Numeric state

The controller is Three.js-independent. `from` and `to` are matching finite numeric trees made only from numbers, arrays and plain objects. One tween may therefore carry camera position/target fields, object transforms, scale and opacity atomically.

Built-in easing names are `linear`, `easeOutCubic` and `easeInOutCubic`.

## Reduced Motion

Reduced Motion uses the **same motion entry, handle, scope/key lock, authority witness, frame ownership and completion signal**. It is timing policy, not a second lifecycle.

`animate(...)` accepts optional `reducedDurationMs` beside normal `durationMs`:

- when an approved Reduced Motion duration exists in the Portable Kit/sequence contract, the consumer passes it and THREEJS-096 schedules the same transition at that shorter duration;
- `reducedDurationMs` must be finite, non-negative and cannot exceed the normal duration;
- changing the preference mid-flight cancels only the currently owned frame token, preserves the same motion sequence/handle/progress, retimes the remaining work and schedules again through the same THREEJS-027 scope;
- preference changes never invoke canonical cancellation snap;
- when no approved Reduced Motion duration exists, the controller invents no timing: reduced mode uses the legacy exact-final fallback (`to` immediately);
- explicit normal duration `0` also commits exact `to` immediately.

The approved contract currently includes shortened values such as `roomRevealMs: 700` and `setupSurfaceTravelMs: 850`; sequence owners must pass those values rather than bypassing this controller.

## Resource ownership and stale callbacks

The controller owns one THREEJS-027 transient resource scope. Frames use `lifecycle.requestFrame(...)`; optional `prefers-reduced-motion` listening uses `lifecycle.listen(...)`.

A cancelled platform callback that arrives late cannot mutate because the entry must still match all of:

- controller not disposed;
- active `scope + key` entry identity;
- lifecycle generation;
- authoritative revision;
- live target.

Controller release cancels active entries, canonical-snaps live targets once, and releases its resource scope.

## Audio is optional and non-authoritative

THREEJS-096 does not create, load, play or await audio. Audio cues may observe presentation events outside the controller, but they may never gate startup, authority, interpolation or `handle.finished`.

Silence is valid. Autoplay denial, decode/load failure, a muted device or a rejected audio promise must have zero effect on gameplay authority and motion completion.

## Gameplay must not wait

Picking, selection, legality, intent creation and authority submission must never depend on `handle.finished`. Motion completion is presentation-only. A consumer may observe `finished` for presentation sequencing/cleanup after gameplay is already committed.

## Public operations

`createMotionController(...)` exposes:

- `animate(...)` — including optional `reducedDurationMs`;
- `cancel(scope, key, reason?)`;
- `cancelScope(scope, reason?)`;
- `setAuthority(generation, revision)`;
- `setGeneration(nextGeneration)`;
- `setRevision(nextRevision)`;
- `syncSessionAuthority(sessionLifecycle, authoritativeRevision)`;
- `setReducedMotion(boolean)`;
- `snapshot()`;
- `release()` / `dispose()`.

## Verification

Run:

- `node --test tests/threejs_motion_controller_contract.test.mjs`;
- `node --test tests/threejs_motion_reduced_timing_contract.test.mjs`;
- `node --test tests/threejs_motion_controller_source_contract.test.mjs`;
- `npm run test:threejs:gameplay`.

The behavioral contract covers interpolation, same-key supersession, revision replacement, direct THREEJS-060 presentation-generation synchronization, late cancelled callbacks, target release/rebuild, exactly-once canonical snap, approved Reduced Motion retiming, media-query listener ownership and controller release. The source contract forbids raw scheduler ownership, guards current motion consumers from duplicating tween loops, keeps audio out of authoritative completion and requires lifecycle-generation + revision enforcement.
