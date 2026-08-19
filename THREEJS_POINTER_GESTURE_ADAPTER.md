# THREEJS-030 — Pointer/touch/gesture normalization

Status: **LOCKED by THREEJS-030 (2026-08-19)**

THREEJS-030 defines one Pointer Events adapter for the primary Three.js gameplay canvas. It normalizes client coordinates, pointer capture/cancel, tap-vs-drag classification, compatibility-click dedupe and optional camera-ray projection without introducing separate mouse/touch rules paths.

## Coordinate contract

`clientPointToCanvasNdc(canvas, clientX, clientY)` always uses the canvas's current `getBoundingClientRect()` in CSS pixels.

It returns:

- original client coordinates;
- canvas-local CSS coordinates;
- normalized device coordinates (`-1..+1` exactly on the rect edges);
- whether the point is inside the current canvas rect;
- the exact rect used for normalization.

It does not use drawing-buffer pixels, devicePixelRatio, `window.innerWidth`, guessed safe-area insets or hard-coded portrait dimensions. This makes edge touches on small portrait screens and viewport-fit safe-area layouts use the same geometry as desktop.

Captured pointers may move outside the rect. Their NDC is deliberately **not clamped**; `inside=false` is preserved so a drag outside the canvas cannot be mistaken for a legal edge hit.

`projectCanvasNdcToRay(...)` calls the supplied Three.js-compatible `Raycaster.setFromCamera(ndc, camera)` and returns an immutable origin/direction snapshot. The Pointer adapter may receive a current camera provider + raycaster and then includes that ray snapshot in every normalized point.

## Tap versus drag

The client-space disambiguation threshold is locked at **8 CSS px**:

- maximum displacement `<= 8px` through release = tap;
- maximum displacement `> 8px` = drag.

This is only an input classification threshold. It does **not** replace the portable-kit world-space placement radii (`31` normal / `42` forgiving touch) or drag height (`14`), which remain later picking/drop semantics.

Maximum displacement is tracked from pointerdown, so moving beyond the threshold and then returning near the start still remains a drag.

## Gesture ownership and browser behavior

The adapter begins with gameplay ownership disabled. In that state it does not prevent pointer/context-menu events or acquire pointer capture.

Gameplay code must call `setGameplayGestureOwnership(true)` **before the pointerdown that it intends to own**. This sets `data-gesture-owner="gameplay"` on the canvas. CSS applies `touch-action:none` only under that attribute; the default `.scene` value is `touch-action:auto`.

This matters because browsers decide touch-action behavior at gesture start. THREEJS-030 never relies on switching touch-action after a touch is already underway.

While gameplay owns the canvas gesture, handled Pointer Events call `preventDefault`, the primary pointer is captured, and canvas `contextmenu` is prevented. Releasing ownership cancels any active gesture, releases capture and restores native canvas gesture behavior.

The listeners and CSS rule target only the canvas. Buttons/inputs and other controls outside the canvas keep normal browser behavior/accessibility.

## Pointer capture and cancellation

Only the primary pointer is eligible; non-primary pointers and non-left mouse buttons do not become the gameplay gesture.

For an owned gesture:

- pointerdown captures the pointer;
- move events keep normalized client/local/NDC/ray data even outside the canvas;
- pointerup releases capture and emits deterministic `tap` or `drag` completion;
- `pointercancel`, unexpected `lostpointercapture`, ownership release and adapter release cancel the gesture explicitly;
- capture-loss cancellation uses the last known normalized point because capture-loss events may report meaningless client coordinates.

The adapter owns listeners through a THREEJS-027 transient resource-registry scope.

## Synthetic/compatibility click dedupe

The adapter itself uses Pointer Events for gameplay. After an owned pointerup it records one short compatibility-click witness (750ms, 12 CSS px around release).

A matching canvas `click` is prevented and propagation-stopped once, because the gameplay action was already represented by the Pointer Events completion. Unrelated/later clicks are not consumed, and no control outside the canvas is affected.

## Downstream rule

THREEJS-031+ must consume normalized Pointer adapter output rather than attach parallel `touchstart`, mouse or click gameplay handlers. Tap/click/drag may differ in presentation, but they must ultimately produce the same THREEJS-029 gameplay intent semantics and shared validator/authority path.

## Verification

Run:

- `node --test tests/threejs_pointer_gesture_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract covers rect/NDC edge mapping, safe-area-like offsets, ray projection, explicit ownership, capture/release/cancel/lost-capture behavior, exact 8px tap/drag boundary, outside-canvas captured movement, synthetic-click dedupe, context-menu scoping and restoration of native behavior after ownership release.
