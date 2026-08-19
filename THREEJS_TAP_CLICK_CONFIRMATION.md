# THREEJS-036 — Tap/click selection and confirmation

Status: **LOCKED by THREEJS-036 (2026-08-19)**

THREEJS-036 implements the non-drag tap/click path on top of THREEJS-031/033/034 and the engine-neutral THREEJS-029 authority interface. It shares rule semantics with drag and does not wait on camera, lighting or move animation.

## Immediate remaining-size feedback

`tapSize(...)` resolves selection through THREEJS-033. A successful size tap/click replaces the one selected size/legal-cell model synchronously and invokes `onFeedback(snapshot, meta)` **inside the same call stack** with `sameRenderOpportunity=true`.

There is no timeout, RAF, Promise completion, camera transition, lighting operation or piece-travel animation between input handling and this feedback callback.

## Legal cell confirmation

`tapBoard(...)` reuses THREEJS-034 world-space picking and the current THREEJS-033 selection.

An invalid/outside/occupied pre-submit tap:

- submits nothing;
- preserves selected size/legal targets for correction;
- reports the deterministic THREEJS-034 diagnostic immediately.

A valid tap/click creates one checked THREEJS-029 human `move` through the injected intent factory. Tap vs click changes only presentation source; `gameplayRuleSemantics(...)` remains identical.

## Exactly-once pending gate

The controller changes phase to `pending` and emits pending feedback **before** entering `authority.submit(intent)`.

That ordering prevents duplicate submission even if the authority adapter performs synchronous/re-entrant work before returning its Promise. While pending:

- repeated cell taps observe the pending state;
- size taps cannot replace the selected move;
- cancel cannot locally undo it;
- authority submit is not repeated.

Same-witness fake `accepted-resync` cannot clear pending. Same-witness pending may be reconciled only by trusted `rejected-resync` or `reconnect`; normal accepted/ownership/round transitions require authoritative witness movement.

No `.then(...)`/await callback in THREEJS-036 mutates presentation after submission. Canonical reconciliation owns resolution.

## Authority-neutral boundary

THREEJS-036 receives `{ snapshot(), submit(intent) }` plus an injected THREEJS-029 intent factory. It does not branch on Local vs Network authority and does not implement a second legality path.

The deterministic regression uses Local-schema intents and proves tap/click yield identical rule semantics.

## UX-SELECT-46 regression reference

The historical selection-processing p95 is preserved only as a regression ceiling/reference:

**processing p95 ≤ 50 ms**.

THREEJS-036 does **not** copy historical Godot animation timing as current Three.js visible-feedback latency.

## Fresh Three.js tap→visible-feedback measurement

`scripts/verify-threejs-tap-feedback-browser.mjs` measures the current browser path using Chromium at a mobile portrait viewport.

After 10 warm-up events it records 60 real DOM touch `PointerEvent('pointerup')` samples through the THREEJS-036 size-selection path. The feedback callback updates a real DOM `role=status` marker.

For the fresh candidate it prints:

- event→feedback processing p50/p95/max;
- `tapToVisibleFeedbackMs` p50/p95/max, measured from event start to the first `requestAnimationFrame` where the new marker content is present and has non-zero visible layout.

The verifier checks:

- feedback was synchronous;
- the marker was visible at the first render opportunity for every sample;
- processing p95 stayed ≤50 ms;
- fresh visible-feedback p50/p95/max are finite.

The percentile helper executes inside the Chromium evaluation context, so the metric does not depend on Node-scope closures. The size-feedback probe intentionally does not depend on board/world asset lookup; unrelated asset registry naming cannot invalidate the latency measurement.

No unrun p50/p95 numbers are recorded here. The verifier outputs the fresh measured values when executed against the served candidate.

## Verification

Deterministic:

`node --test tests/threejs_tap_click_confirmation_contract.test.mjs`

Browser metric/regression:

`node scripts/verify-threejs-tap-feedback-browser.mjs`

The deterministic contract covers synchronous feedback, invalid correction, pending-before-submit re-entrancy protection, rapid-tap dedupe, same-witness pending protection, tap/click semantic equivalence and stale snapshot rejection.
