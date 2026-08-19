import { RESOURCE_OWNERSHIP } from '../core/resource-registry.js';

export const POINTER_GESTURE_POLICY = Object.freeze({
  dragThresholdCssPx: 8,
  compatClickDedupeMs: 750,
  compatClickDistanceCssPx: 12,
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function finite(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(code);
  return number;
}

function requireCanvas(canvas) {
  if (!canvas || typeof canvas.getBoundingClientRect !== 'function' || typeof canvas.addEventListener !== 'function') {
    fail('pointer_canvas_required');
  }
  return canvas;
}

function requireRegistry(resourceRegistry) {
  if (!resourceRegistry?.createScope) fail('pointer_resource_registry_required');
  return resourceRegistry;
}

function requireClock(clock) {
  if (typeof clock !== 'function') fail('pointer_clock_required');
  return clock;
}

function requireCallback(callback) {
  if (typeof callback !== 'function') fail('pointer_gesture_callback_required');
  return callback;
}

function requirePositivePolicy(value, code) {
  const number = finite(value, code);
  if (number <= 0) fail(code);
  return number;
}

function rectSnapshot(rect) {
  const left = finite(rect?.left, 'invalid_canvas_rect_left');
  const top = finite(rect?.top, 'invalid_canvas_rect_top');
  const width = finite(rect?.width, 'invalid_canvas_rect_width');
  const height = finite(rect?.height, 'invalid_canvas_rect_height');
  if (width <= 0 || height <= 0) fail('invalid_canvas_rect_size');
  return deepFreeze({
    left,
    top,
    width,
    height,
    right: Number.isFinite(Number(rect?.right)) ? Number(rect.right) : left + width,
    bottom: Number.isFinite(Number(rect?.bottom)) ? Number(rect.bottom) : top + height,
  });
}

export function clientPointToCanvasNdc(canvas, clientX, clientY) {
  requireCanvas(canvas);
  const x = finite(clientX, 'invalid_pointer_client_x');
  const y = finite(clientY, 'invalid_pointer_client_y');
  const rect = rectSnapshot(canvas.getBoundingClientRect());
  const localX = x - rect.left;
  const localY = y - rect.top;
  const ndcX = (localX / rect.width) * 2 - 1;
  const ndcY = 1 - (localY / rect.height) * 2;

  return deepFreeze({
    client: { x, y },
    local: { x: localX, y: localY },
    ndc: { x: ndcX, y: ndcY },
    inside: localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height,
    rect,
  });
}

function vectorSnapshot(vector, code) {
  if (!vector) fail(code);
  return Object.freeze([
    finite(vector.x, code),
    finite(vector.y, code),
    finite(vector.z, code),
  ]);
}

export function projectCanvasNdcToRay(ndc, {
  camera,
  raycaster,
} = {}) {
  if (!raycaster || typeof raycaster.setFromCamera !== 'function') fail('pointer_raycaster_required');
  if (!camera) fail('pointer_camera_required');
  const x = finite(ndc?.x, 'invalid_pointer_ndc_x');
  const y = finite(ndc?.y, 'invalid_pointer_ndc_y');
  raycaster.setFromCamera({ x, y }, camera);
  return deepFreeze({
    origin: vectorSnapshot(raycaster.ray?.origin, 'invalid_pointer_ray_origin'),
    direction: vectorSnapshot(raycaster.ray?.direction, 'invalid_pointer_ray_direction'),
  });
}

function pointerIdOf(event) {
  const pointerId = Number(event?.pointerId);
  if (!Number.isInteger(pointerId) || pointerId < 0) fail('invalid_pointer_id');
  return pointerId;
}

function pointerTypeOf(event) {
  const pointerType = typeof event?.pointerType === 'string' && event.pointerType ? event.pointerType : 'unknown';
  return pointerType;
}

function primaryPointerAllowed(event) {
  if (event?.isPrimary === false) return false;
  const pointerType = pointerTypeOf(event);
  if (pointerType === 'mouse' && Number(event?.button) !== 0) return false;
  return true;
}

function callPreventDefault(event) {
  if (event?.cancelable !== false && typeof event?.preventDefault === 'function') event.preventDefault();
}

function callStopImmediate(event) {
  if (typeof event?.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  else if (typeof event?.stopPropagation === 'function') event.stopPropagation();
}

function distanceSquared(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

function releaseCapture(canvas, pointerId) {
  try {
    if (typeof canvas.hasPointerCapture === 'function' && !canvas.hasPointerCapture(pointerId)) return false;
    if (typeof canvas.releasePointerCapture === 'function') {
      canvas.releasePointerCapture(pointerId);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function acquireCapture(canvas, pointerId) {
  try {
    if (typeof canvas.setPointerCapture === 'function') canvas.setPointerCapture(pointerId);
    if (typeof canvas.hasPointerCapture === 'function') return canvas.hasPointerCapture(pointerId);
    return typeof canvas.setPointerCapture === 'function';
  } catch {
    return false;
  }
}

export function createPointerEventsAdapter({
  canvas,
  resourceRegistry,
  onGesture,
  getCamera = null,
  raycaster = null,
  clock = () => performance.now(),
  dragThresholdCssPx = POINTER_GESTURE_POLICY.dragThresholdCssPx,
  compatClickDedupeMs = POINTER_GESTURE_POLICY.compatClickDedupeMs,
  compatClickDistanceCssPx = POINTER_GESTURE_POLICY.compatClickDistanceCssPx,
} = {}) {
  const target = requireCanvas(canvas);
  const registry = requireRegistry(resourceRegistry);
  const emit = requireCallback(onGesture);
  const now = requireClock(clock);
  const dragThreshold = requirePositivePolicy(dragThresholdCssPx, 'invalid_pointer_drag_threshold');
  const clickDedupeMs = requirePositivePolicy(compatClickDedupeMs, 'invalid_pointer_click_dedupe_ms');
  const clickDistance = requirePositivePolicy(compatClickDistanceCssPx, 'invalid_pointer_click_dedupe_distance');
  if ((getCamera === null) !== (raycaster === null)) fail('pointer_ray_dependencies_must_be_paired');
  if (getCamera !== null && typeof getCamera !== 'function') fail('pointer_camera_provider_required');

  const lifecycle = registry.createScope('pointer-events-adapter', {
    ownership: RESOURCE_OWNERSHIP.TRANSIENT,
  });
  const dragThresholdSq = dragThreshold * dragThreshold;
  const clickDistanceSq = clickDistance * clickDistance;

  let gameplayOwnsGestures = false;
  let active = null;
  let compatClick = null;
  let disposed = false;

  function clockNow() {
    const value = Number(now());
    if (!Number.isFinite(value) || value < 0) fail('invalid_pointer_clock');
    return value;
  }

  function rayFor(ndc) {
    if (!raycaster) return null;
    const camera = getCamera();
    return projectCanvasNdcToRay(ndc, { camera, raycaster });
  }

  function pointFromEvent(event) {
    const point = clientPointToCanvasNdc(target, event.clientX, event.clientY);
    return deepFreeze({ ...point, ray: rayFor(point.ndc) });
  }

  function packet(phase, event, point, {
    gesture = 'pending',
    reason = null,
    durationMs = null,
  } = {}) {
    return deepFreeze({
      phase,
      gesture,
      reason,
      pointerId: active?.pointerId ?? pointerIdOf(event),
      pointerType: active?.pointerType ?? pointerTypeOf(event),
      ownedByGameplay: true,
      captured: Boolean(active?.captured),
      start: active?.startPoint ?? point,
      current: point,
      deltaCss: active
        ? { x: point.client.x - active.startPoint.client.x, y: point.client.y - active.startPoint.client.y }
        : { x: 0, y: 0 },
      durationMs,
    });
  }

  function clearActive() {
    if (!active) return null;
    const previous = active;
    active = null;
    delete target.dataset.pointerGestureActive;
    return previous;
  }

  function cancelActive(reason, event = null) {
    if (!active) return false;
    const previous = active;
    const point = event ? pointFromEvent(event) : previous.lastPoint;
    const durationMs = Math.max(0, clockNow() - previous.startedAtMs);
    releaseCapture(target, previous.pointerId);
    const cancelledPacket = deepFreeze({
      phase: 'cancel',
      gesture: previous.dragged ? 'drag' : 'pending',
      reason,
      pointerId: previous.pointerId,
      pointerType: previous.pointerType,
      ownedByGameplay: true,
      captured: false,
      start: previous.startPoint,
      current: point,
      deltaCss: {
        x: point.client.x - previous.startPoint.client.x,
        y: point.client.y - previous.startPoint.client.y,
      },
      durationMs,
    });
    clearActive();
    emit(cancelledPacket);
    return true;
  }

  function onPointerDown(event) {
    if (disposed || !gameplayOwnsGestures || !primaryPointerAllowed(event)) return;
    callPreventDefault(event);
    if (active) return;

    const pointerId = pointerIdOf(event);
    const point = pointFromEvent(event);
    const startedAtMs = clockNow();
    active = {
      pointerId,
      pointerType: pointerTypeOf(event),
      startedAtMs,
      startPoint: point,
      lastPoint: point,
      maxDistanceSq: 0,
      dragged: false,
      captured: acquireCapture(target, pointerId),
    };
    target.dataset.pointerGestureActive = 'true';
    emit(packet('start', event, point, { durationMs: 0 }));
  }

  function onPointerMove(event) {
    if (disposed || !active || pointerIdOf(event) !== active.pointerId) return;
    callPreventDefault(event);
    const point = pointFromEvent(event);
    active.lastPoint = point;
    active.maxDistanceSq = Math.max(
      active.maxDistanceSq,
      distanceSquared(
        active.startPoint.client.x,
        active.startPoint.client.y,
        point.client.x,
        point.client.y,
      ),
    );
    if (active.maxDistanceSq > dragThresholdSq) active.dragged = true;
    emit(packet('move', event, point, {
      gesture: active.dragged ? 'drag' : 'pending',
      durationMs: Math.max(0, clockNow() - active.startedAtMs),
    }));
  }

  function onPointerUp(event) {
    if (disposed || !active || pointerIdOf(event) !== active.pointerId) return;
    callPreventDefault(event);
    const point = pointFromEvent(event);
    active.lastPoint = point;
    active.maxDistanceSq = Math.max(
      active.maxDistanceSq,
      distanceSquared(
        active.startPoint.client.x,
        active.startPoint.client.y,
        point.client.x,
        point.client.y,
      ),
    );
    if (active.maxDistanceSq > dragThresholdSq) active.dragged = true;
    const previous = active;
    const gesture = previous.dragged ? 'drag' : 'tap';
    const durationMs = Math.max(0, clockNow() - previous.startedAtMs);
    releaseCapture(target, previous.pointerId);
    const endPacket = deepFreeze({
      phase: 'end',
      gesture,
      reason: null,
      pointerId: previous.pointerId,
      pointerType: previous.pointerType,
      ownedByGameplay: true,
      captured: false,
      start: previous.startPoint,
      current: point,
      deltaCss: {
        x: point.client.x - previous.startPoint.client.x,
        y: point.client.y - previous.startPoint.client.y,
      },
      durationMs,
    });
    clearActive();
    compatClick = {
      expiresAtMs: clockNow() + clickDedupeMs,
      clientX: point.client.x,
      clientY: point.client.y,
    };
    emit(endPacket);
  }

  function onPointerCancel(event) {
    if (disposed || !active || pointerIdOf(event) !== active.pointerId) return;
    callPreventDefault(event);
    cancelActive('pointercancel', event);
  }

  function onLostPointerCapture(event) {
    if (disposed || !active || pointerIdOf(event) !== active.pointerId) return;
    cancelActive('lostpointercapture', event);
  }

  function onClick(event) {
    if (disposed || !compatClick) return;
    const time = clockNow();
    if (time > compatClick.expiresAtMs) {
      compatClick = null;
      return;
    }
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (distanceSquared(x, y, compatClick.clientX, compatClick.clientY) > clickDistanceSq) return;

    // This click is the compatibility/synthetic click following an already-owned
    // Pointer Events gesture. Consume only this duplicate; unrelated canvas clicks
    // and all controls outside the canvas remain untouched.
    callPreventDefault(event);
    callStopImmediate(event);
    compatClick = null;
  }

  function onContextMenu(event) {
    if (disposed || !gameplayOwnsGestures) return;
    callPreventDefault(event);
  }

  lifecycle.listen(target, 'pointerdown', onPointerDown, { passive: false }, { label: 'gameplay-pointerdown' });
  lifecycle.listen(target, 'pointermove', onPointerMove, { passive: false }, { label: 'gameplay-pointermove' });
  lifecycle.listen(target, 'pointerup', onPointerUp, { passive: false }, { label: 'gameplay-pointerup' });
  lifecycle.listen(target, 'pointercancel', onPointerCancel, { passive: false }, { label: 'gameplay-pointercancel' });
  lifecycle.listen(target, 'lostpointercapture', onLostPointerCapture, undefined, { label: 'gameplay-lostpointercapture' });
  lifecycle.listen(target, 'click', onClick, { capture: true }, { label: 'gameplay-compat-click-dedupe' });
  lifecycle.listen(target, 'contextmenu', onContextMenu, { capture: true }, { label: 'gameplay-contextmenu' });

  function setGameplayGestureOwnership(owned) {
    if (typeof owned !== 'boolean') fail('invalid_gameplay_gesture_ownership');
    if (disposed) fail('pointer_events_adapter_disposed');
    if (owned === gameplayOwnsGestures) return gameplayOwnsGestures;
    gameplayOwnsGestures = owned;
    if (owned) {
      target.dataset.gestureOwner = 'gameplay';
    } else {
      delete target.dataset.gestureOwner;
      cancelActive('ownership-released');
    }
    return gameplayOwnsGestures;
  }

  function snapshot() {
    return deepFreeze({
      gameplayOwnsGestures,
      activePointer: active ? {
        pointerId: active.pointerId,
        pointerType: active.pointerType,
        captured: active.captured,
        dragged: active.dragged,
        startClient: { ...active.startPoint.client },
        lastClient: { ...active.lastPoint.client },
      } : null,
      compatClickPending: Boolean(compatClick && clockNow() <= compatClick.expiresAtMs),
      policy: {
        dragThresholdCssPx: dragThreshold,
        compatClickDedupeMs: clickDedupeMs,
        compatClickDistanceCssPx: clickDistance,
      },
    });
  }

  function release() {
    if (disposed) return false;
    if (gameplayOwnsGestures) {
      gameplayOwnsGestures = false;
      delete target.dataset.gestureOwner;
    }
    cancelActive('released');
    compatClick = null;
    disposed = true;
    lifecycle.release('pointer-events-adapter-released');
    return true;
  }

  return Object.freeze({
    setGameplayGestureOwnership,
    snapshot,
    release,
    dispose: release,
  });
}
