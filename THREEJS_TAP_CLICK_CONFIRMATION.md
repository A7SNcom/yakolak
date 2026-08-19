# THREEJS-036 — Tap/click selection and confirmation

Status: **LOCKED by THREEJS-036 (2026-08-19)**

THREEJS-036 implements the non-drag tap/click path on top of THREEJS-031/033/034 and the engine-neutral THREEJS-029 authority interface. It shares rule semantics with drag and does not wait on camera, lighting or move animation.

## Size tap/click

`tapSize(...)` resolves the requested remaining home piece through the existing THREEJS-033 selection controller. Another seat, used copy or stale authority witness therefore fails through the same canonical inventory/selection rules.

A successful size tap replaces the one selected size/legal-cell model synchronously and invokes the injected `onFeedback(snapshot, meta)` callback **inside the same call stack** with `sameRenderOpportunity=true`.

No timeout, RAF, Promise chain, camera transition, lighting change or piece-travel animation gates this feedback.

## Legal cell tap/click

`tapBoard(...)` reuses THREEJS-034 world-space picking and the current THREEJS-033 selection. An invalid/outside/occupied tap:

- submits nothing;
- leaves the selected size/legal targets intact for correction;
- reports the deterministic THREEJS-034 diagnostic immediately.

A valid tap/click creates one THREEJS-029 `move` through the injected `intentFactory`. The resulting intent is asserted to match:

- human origin;
- selected seat + authoritative revision;
- selected size + exact picked cell;
- presentation source `tap` or `click`.

Tap vs click changes presentation source only. Rule semantics are identical.

## Pending exactly-once gate

The controller changes phase to `pending` and emits visible pending feedback **before** entering `authority.submit(intent)`.

This ordering closes duplicate/re-entrant rapid taps even when an authority adapter performs synchronous work before returning its Promise. While pending:

- repeated cell taps return the same pending state;
- size taps cannot replace the selected move;
- cancel cannot locally undo the move;
- authority submit is never repeated.

A same-witness caller cannot falsely claim `accepted-resync` and clear pending. Same-witness pending may be reconciled only by trusted `rejected-resync` or `reconnect`; normal acceptance/ownership/round changes require the authoritative witness to move.

The controller never attaches a completion callback to the submission Promise. Canonical reconciliation remains the only presentation/state-resolution path.

## Authority-neutral UI boundary

THREEJS-036 receives the existing authority interface `{ snapshot(), submit(intent) }` and an injected THREEJS-029 intent factory. It does not branch on Local vs Network authority and does not add a second gameplay rule path.

The deterministic contract uses a Local-schema intent factory and proves tap/click produce identical `gameplayRuleSemantics(...)`.

## Latency contract

UX-SELECT-46 is retained only as a **processing regression ceiling/reference**:

- historical selection-processing p95 ceiling: **≤ 50 ms**.

THREEJS-036 does **not** copy historical Godot animation/timing numbers as the new user-visible latency.

`scripts/verify-threejs-tap-feedback-browser.mjs` collects fresh Three.js/browser measurements from 60 warmed touch `pointerup` samples on the current served candidate:

- synchronous event→feedback processing p50/p95/max;
- fresh `tapToVisibleFeedbackMs` p50/p95/max measured from pointer event start to the first `requestAnimationFrame` where an actual DOM status marker contains the new selection feedback and has non-zero visible layout.

The browser regression requires:

- feedback callback completed synchronously;
- marker is visible at the first render opportunity;
- processing p95 stays ≤50 ms;
- fresh tap→visible p50/p95 are finite and are **reported as measured values**, not hard-coded from Godot.

No unrun p50/p95 values are recorded in this document.

## Browser regression

Run against the current Three.js candidate served at `SHELL_URL` (default `http://127.0.0.1:4173/`):

`node scripts/verify-threejs-tap-feedback-browser.mjs`

The script boots Chromium at a mobile portrait viewport, uses a real DOM button + touch `PointerEvent`, updates a visible DOM feedback marker through the real THREEJS-036 callback, and prints JSON containing the fresh p50/p95 metrics and regression checks.

## Deterministic regression

Run:

`node --test tests/threejs_tap_click_confirmation_contract.test.mjs`

It locks synchronous size feedback, invalid pre-submit correction, pending-before-submit re-entrancy protection, rapid-tap dedupe, same-witness pending guard, tap/click semantic equivalence and stale snapshot rejection.
