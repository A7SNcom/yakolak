import { assertCanonicalSessionState } from '../session/canonical-session-state.js';

export const ACCEPTED_PIECE_TRAVEL_POLICY = Object.freeze({
  scope: 'accepted-piece-travel',
  durationMs: 520,
  arcHeight: 18,
  easing: 'easeInOutCubic',
  conflictLocks: Object.freeze([
    'board-targeting',
    'piece-selection',
    'piece-drag',
    'move-confirmation',
    'free-camera',
  ]),
  authorityUnaffected: Object.freeze([
    'turn-deadline',
    'turn-handoff',
    'score',
    'round-lifecycle',
    'board-state',
    'inventory',
  ]),
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

function requireString(value, code, max = 256) {
  if (typeof value !== 'string' || !value || value.length > max) fail(code);
  return value;
}

function finiteTriple(value, code) {
  if (!Array.isArray(value) || value.length !== 3) fail(code);
  const triple = value.map(Number);
  if (triple.some(number => !Number.isFinite(number))) fail(code);
  return Object.freeze(triple);
}

function normalizeTransform(value, code = 'invalid_accepted_travel_transform') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return deepFreeze({
    position: finiteTriple(value.position, `${code}_position`),
    rotationDegrees: finiteTriple(value.rotationDegrees, `${code}_rotation`),
    scale: finiteTriple(value.scale, `${code}_scale`),
  });
}

function requireMotionController(value) {
  if (
    !value?.animate
    || !value?.cancelScope
    || !value?.snapshot
    || !value?.syncSessionAuthority
  ) fail('accepted_travel_motion_controller_required');
  return value;
}

function requirePresentation(value) {
  for (const method of [
    'readPieceIdentity',
    'readPieceTransform',
    'readCanonicalBoardTransform',
    'applyPieceTransform',
    'snapPieceToTransform',
    'isPieceLive',
    'setMovePresentationLock',
  ]) {
    if (typeof value?.[method] !== 'function') fail(`accepted_travel_presentation_${method}_required`);
  }
  return value;
}

function witnessFromState(state) {
  assertCanonicalSessionState(state);
  return deepFreeze({
    generation: state.lifecycle.presentationGeneration,
    revision: state.revision,
    round: state.round,
  });
}

function compareWitness(left, right) {
  if (!right) return 1;
  if (left.generation !== right.generation) return left.generation > right.generation ? 1 : -1;
  if (left.round !== right.round) {
    if (left.round > right.round && left.revision < right.revision) fail('accepted_travel_authority_order_conflict');
    if (left.round < right.round && left.revision > right.revision) fail('accepted_travel_authority_order_conflict');
    return left.round > right.round ? 1 : -1;
  }
  if (left.revision !== right.revision) return left.revision > right.revision ? 1 : -1;
  return 0;
}

function sameCanonicalSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function runtimePieceFor({ presentation, pieceId, cellId }) {
  const identity = presentation.readPieceIdentity(pieceId);
  if (!identity || typeof identity !== 'object') fail('accepted_travel_piece_identity_missing');
  if (identity.pieceId !== pieceId) fail('accepted_travel_piece_identity_mismatch');
  const fromTransform = normalizeTransform(
    presentation.readPieceTransform(pieceId),
    'invalid_accepted_travel_source_transform',
  );
  const destination = presentation.readCanonicalBoardTransform(pieceId, cellId);
  if (!destination || typeof destination !== 'object') fail('accepted_travel_destination_missing');
  if (destination.cellId !== cellId) fail('accepted_travel_destination_cell_mismatch');
  return deepFreeze({
    pieceId,
    colorId: requireString(identity.colorId, 'accepted_travel_piece_color_missing'),
    size: requireString(identity.size, 'accepted_travel_piece_size_missing'),
    fromTransform,
    canonicalDestination: deepFreeze({
      cellId,
      transform: normalizeTransform(destination.transform, 'invalid_accepted_travel_destination_transform'),
    }),
  });
}

export function deriveAcceptedPieceTravelPlan({
  state,
  pieceId,
  runtimePiece,
} = {}) {
  assertCanonicalSessionState(state);
  const logicalPieceId = requireString(pieceId, 'accepted_travel_piece_id_required');
  if (!runtimePiece || typeof runtimePiece !== 'object' || Array.isArray(runtimePiece)) fail('accepted_travel_runtime_piece_required');
  if (runtimePiece.pieceId !== logicalPieceId) fail('accepted_travel_runtime_piece_mismatch');
  if (state.lastMove === null) fail('accepted_travel_requires_last_move');

  const move = state.lastMove;
  const boardCell = state.board?.[String(move.cell)];
  if (!boardCell || boardCell[move.size] !== move.color) fail('accepted_travel_last_move_board_mismatch');
  if (runtimePiece.colorId !== move.color) fail('accepted_travel_piece_color_mismatch');
  if (runtimePiece.size !== move.size) fail('accepted_travel_piece_size_mismatch');
  if (runtimePiece.canonicalDestination?.cellId !== move.cell) fail('accepted_travel_destination_cell_mismatch');

  const witness = witnessFromState(state);
  return deepFreeze({
    scope: ACCEPTED_PIECE_TRAVEL_POLICY.scope,
    key: `piece:${logicalPieceId}`,
    pieceId: logicalPieceId,
    seatId: move.seatId,
    color: move.color,
    size: move.size,
    cell: move.cell,
    generation: witness.generation,
    acceptedRevision: witness.revision,
    round: witness.round,
    durationMs: ACCEPTED_PIECE_TRAVEL_POLICY.durationMs,
    arcHeight: ACCEPTED_PIECE_TRAVEL_POLICY.arcHeight,
    easing: ACCEPTED_PIECE_TRAVEL_POLICY.easing,
    fromTransform: normalizeTransform(runtimePiece.fromTransform, 'invalid_accepted_travel_source_transform'),
    canonicalFinalTransform: normalizeTransform(
      runtimePiece.canonicalDestination.transform,
      'invalid_accepted_travel_destination_transform',
    ),
    conflictLocks: ACCEPTED_PIECE_TRAVEL_POLICY.conflictLocks,
    authorityUnaffected: ACCEPTED_PIECE_TRAVEL_POLICY.authorityUnaffected,
    lifecycle: state.lifecycle,
  });
}

function arcAdjustedTransform(value, easedProgress, arcHeight) {
  const position = [...value.position];
  position[1] += Math.sin(Math.PI * easedProgress) * arcHeight;
  return deepFreeze({
    ...value,
    position: Object.freeze(position),
  });
}

export function createAcceptedPieceTravelController({
  motionController,
  presentation,
} = {}) {
  const motion = requireMotionController(motionController);
  const view = requirePresentation(presentation);

  let latestCanonical = null;
  let latestWitness = null;
  let pendingLock = null;
  let activeTravel = null;
  let sequence = 0;
  let released = false;

  function assertLive() {
    if (released) fail('accepted_travel_controller_released');
  }

  function motionAuthorityIsAhead(state) {
    const snapshot = motion.snapshot();
    return state.lifecycle.presentationGeneration < snapshot.generation
      || state.revision < snapshot.revision;
  }

  function syncMotionAuthority(state) {
    if (motionAuthorityIsAhead(state)) fail('accepted_travel_canonical_behind_motion_authority');
    return motion.syncSessionAuthority(state.lifecycle, state.revision);
  }

  function recordCanonical(state) {
    assertCanonicalSessionState(state);
    const witness = witnessFromState(state);
    const comparison = compareWitness(witness, latestWitness);
    if (comparison < 0) fail('stale_accepted_travel_snapshot');
    if (comparison === 0 && latestCanonical && !sameCanonicalSnapshot(state, latestCanonical)) {
      fail('accepted_travel_same_witness_snapshot_conflict');
    }
    if (comparison > 0 || latestCanonical === null) {
      latestCanonical = state;
      latestWitness = witness;
    }
    return comparison;
  }

  function lockModel({ phase, state, pendingId, pieceId = null }) {
    const witness = witnessFromState(state);
    return deepFreeze({
      id: `accepted-travel-lock:${pendingId}`,
      phase,
      pendingId,
      pieceId,
      generation: witness.generation,
      revision: witness.revision,
      round: witness.round,
      blocks: ACCEPTED_PIECE_TRAVEL_POLICY.conflictLocks,
      authorityUnaffected: ACCEPTED_PIECE_TRAVEL_POLICY.authorityUnaffected,
    });
  }

  function applyLock(lock, reason) {
    view.setMovePresentationLock(lock, deepFreeze({ reason }));
  }

  function clearLockIfId(lockId, reason) {
    const current = activeTravel?.lock || pendingLock;
    if (!current || current.id !== lockId) return false;
    if (activeTravel?.lock?.id === lockId) activeTravel = null;
    if (pendingLock?.id === lockId) pendingLock = null;
    applyLock(null, reason);
    return true;
  }

  function beginPending({ state, pendingId } = {}) {
    assertLive();
    assertCanonicalSessionState(state);
    const normalizedPendingId = requireString(pendingId, 'accepted_travel_pending_id_required');
    recordCanonical(state);
    syncMotionAuthority(state);
    if (activeTravel) fail('accepted_travel_already_active');
    const lock = lockModel({ phase: 'pending', state, pendingId: normalizedPendingId });
    pendingLock = lock;
    applyLock(lock, 'move-pending');
    return lock;
  }

  function cancelPending(reason = 'move-pending-cancelled') {
    assertLive();
    if (!pendingLock || activeTravel) return false;
    const lock = pendingLock;
    pendingLock = null;
    applyLock(null, reason);
    return Boolean(lock);
  }

  function startAcceptedTravel({ state, pieceId, pendingId = null } = {}) {
    assertLive();
    assertCanonicalSessionState(state);
    const logicalPieceId = requireString(pieceId, 'accepted_travel_piece_id_required');
    const normalizedPendingId = pendingId == null
      ? `accepted:${state.lifecycle.presentationGeneration}:${state.revision}:${++sequence}`
      : requireString(pendingId, 'accepted_travel_pending_id_required');

    if (pendingLock && pendingLock.pendingId !== normalizedPendingId) fail('accepted_travel_pending_id_mismatch');
    const comparison = recordCanonical(state);
    if (comparison < 0) fail('stale_accepted_travel_snapshot');
    if (activeTravel) fail('accepted_travel_already_active');

    const live = view.isPieceLive(logicalPieceId);
    if (typeof live !== 'boolean') fail('accepted_travel_piece_liveness_invalid');
    if (!live) fail('accepted_travel_piece_not_live');
    const runtimePiece = runtimePieceFor({
      presentation: view,
      pieceId: logicalPieceId,
      cellId: state.lastMove?.cell,
    });
    const plan = deriveAcceptedPieceTravelPlan({ state, pieceId: logicalPieceId, runtimePiece });
    syncMotionAuthority(state);

    const lock = lockModel({
      phase: 'travel',
      state,
      pendingId: normalizedPendingId,
      pieceId: logicalPieceId,
    });
    pendingLock = null;
    applyLock(lock, 'move-accepted-travel');

    let handle;
    try {
      handle = motion.animate({
        scope: plan.scope,
        key: plan.key,
        generation: plan.generation,
        revision: plan.acceptedRevision,
        durationMs: plan.durationMs,
        from: plan.fromTransform,
        to: plan.canonicalFinalTransform,
        easing: plan.easing,
        apply(value, meta) {
          if (!activeTravel || activeTravel.id !== lock.id) return;
          view.applyPieceTransform(
            plan.pieceId,
            arcAdjustedTransform(value, meta.easedProgress, plan.arcHeight),
            meta,
          );
        },
        isTargetLive() {
          const value = view.isPieceLive(plan.pieceId);
          if (typeof value !== 'boolean') fail('accepted_travel_piece_liveness_invalid');
          return value;
        },
        snapToCanonical(meta) {
          view.snapPieceToTransform(plan.pieceId, plan.canonicalFinalTransform, deepFreeze({
            ...meta,
            reason: meta.reason || 'accepted-travel-canonical-snap',
            acceptedRevision: plan.acceptedRevision,
            cell: plan.cell,
          }));
        },
      });
    } catch (error) {
      applyLock(null, 'accepted-travel-start-failed');
      throw error;
    }

    activeTravel = {
      id: lock.id,
      lock,
      plan,
      handle,
      witness: witnessFromState(state),
    };

    handle.finished.then(result => {
      if (!activeTravel || activeTravel.id !== lock.id) return;
      clearLockIfId(lock.id, `accepted-travel-${result.status}`);
    });

    return Object.freeze({ plan, lock, handle });
  }

  function observeSnapshot(state, { reason = 'canonical-snapshot' } = {}) {
    assertLive();
    assertCanonicalSessionState(state);
    const previousWitness = latestWitness;
    const comparison = recordCanonical(state);
    if (comparison === 0) return deepFreeze({ status: 'unchanged', witness: latestWitness });

    const previousTravel = activeTravel;
    syncMotionAuthority(state);
    if (previousTravel) {
      const motionStillActive = motion.snapshot().active.some(entry => (
        entry.scope === previousTravel.plan.scope && entry.key === previousTravel.plan.key
      ));
      if (motionStillActive) motion.cancelScope(previousTravel.plan.scope, 'newer-canonical-snapshot');
      clearLockIfId(previousTravel.id, reason);
    } else if (pendingLock) {
      const pending = pendingLock;
      pendingLock = null;
      applyLock(null, reason);
      void pending;
    }

    return deepFreeze({
      status: 'advanced',
      previousWitness,
      witness: latestWitness,
    });
  }

  function cancelTravel(reason = 'accepted-travel-cancelled') {
    assertLive();
    if (!activeTravel) return false;
    const travel = activeTravel;
    motion.cancelScope(travel.plan.scope, reason);
    clearLockIfId(travel.id, reason);
    return true;
  }

  function snapshot() {
    return deepFreeze({
      released,
      latestWitness,
      pendingLock,
      activeTravel: activeTravel
        ? {
          id: activeTravel.id,
          pieceId: activeTravel.plan.pieceId,
          cell: activeTravel.plan.cell,
          acceptedRevision: activeTravel.plan.acceptedRevision,
          generation: activeTravel.plan.generation,
          round: activeTravel.plan.round,
          lock: activeTravel.lock,
        }
        : null,
    });
  }

  function release() {
    if (released) return false;
    if (activeTravel) cancelTravel('accepted-travel-controller-released');
    if (pendingLock) cancelPending('accepted-travel-controller-released');
    released = true;
    latestCanonical = null;
    latestWitness = null;
    return true;
  }

  return Object.freeze({
    beginPending,
    cancelPending,
    startAcceptedTravel,
    observeSnapshot,
    cancelTravel,
    snapshot,
    release,
    dispose: release,
  });
}
