import {
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  assertGameplayIntent,
} from './gameplay-intent.js';
import { resolveBoardCellPick } from './board-cell-picking.js';
import { resolveHomePieceTarget } from './home-stack-picking.js';
import { SIZE_SELECTION_CLEAR_REASONS } from './size-selection.js';
import { assertCanonicalSessionState } from '../session/canonical-session-state.js';

export const DRAG_PHASES = Object.freeze({
  IDLE: 'idle',
  DRAGGING: 'dragging',
  PENDING: 'pending',
});

export const DRAG_RETURN_EASING = 'easeInOutCubic';

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

function finiteTriple(value, code) {
  if (!Array.isArray(value) || value.length !== 3) fail(code);
  const triple = value.map(Number);
  if (triple.some(number => !Number.isFinite(number))) fail(code);
  return Object.freeze(triple);
}

function normalizeTransform(value, code = 'invalid_drag_transform') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return deepFreeze({
    position: finiteTriple(value.position, `${code}_position`),
    rotationDegrees: finiteTriple(value.rotationDegrees, `${code}_rotation`),
    scale: finiteTriple(value.scale, `${code}_scale`),
  });
}

function requireMotionController(motionController) {
  if (!motionController?.animate || !motionController?.snapshot || !motionController?.syncSessionAuthority || !motionController?.cancelScope) {
    fail('drag_motion_controller_required');
  }
  return motionController;
}

function requireAuthority(authority) {
  if (!authority?.submit || !authority?.snapshot) fail('drag_authority_adapter_required');
  return authority;
}

function requireIntentFactory(intentFactory) {
  if (typeof intentFactory !== 'function') fail('drag_intent_factory_required');
  return intentFactory;
}

function requirePresentation(presentation) {
  for (const method of [
    'readPieceTransform',
    'readCanonicalPieceTransform',
    'applyDragTransform',
    'snapPieceCanonical',
    'isPieceLive',
  ]) {
    if (typeof presentation?.[method] !== 'function') fail(`drag_presentation_${method}_required`);
  }
  return presentation;
}

function requireCameraGestureToggle(setCameraGesturesEnabled) {
  if (typeof setCameraGesturesEnabled !== 'function') fail('drag_camera_gesture_toggle_required');
  return setCameraGesturesEnabled;
}

function requireClearSelection(clearSelection) {
  if (typeof clearSelection !== 'function') fail('drag_clear_selection_required');
  return clearSelection;
}

function requireClearReason(reason) {
  if (!SIZE_SELECTION_CLEAR_REASONS.includes(reason)) fail('invalid_drag_clear_reason');
  return reason;
}

function requireContract(approvedContract) {
  const rules = approvedContract?.rules;
  const motion = approvedContract?.motion;
  if (!rules || !motion) fail('drag_approved_contract_required');
  const dragHeight = Number(rules.dragHeight);
  const invalidReturnMs = Number(motion.invalidReturnMs);
  if (!Number.isFinite(dragHeight) || dragHeight <= 0) fail('invalid_drag_height');
  if (!Number.isFinite(invalidReturnMs) || invalidReturnMs < 0) fail('invalid_drag_return_duration');
  return deepFreeze({ dragHeight, invalidReturnMs });
}

function pieceIdForTarget(target) {
  return `piece:${target.color}:${target.size}:${target.copyIndex + 1}`;
}

function witnessFromState(state) {
  assertCanonicalSessionState(state);
  return deepFreeze({
    generation: state.lifecycle.presentationGeneration,
    revision: state.revision,
    round: state.round,
    activeSeatId: state.activeSeatId,
  });
}

function sameWitness(left, right) {
  return Boolean(left && right)
    && left.generation === right.generation
    && left.revision === right.revision
    && left.round === right.round
    && left.activeSeatId === right.activeSeatId;
}

function selectionMatchesState(selection, state) {
  return selection?.witness
    && sameWitness(selection.witness, witnessFromState(state))
    && selection.seatId === state.activeSeatId
    && typeof selection.selectedSize === 'string'
    && typeof selection.stackTargetId === 'string'
    && typeof selection.selectedPieceTargetId === 'string';
}

function requirePointerId(pointerId) {
  if (!Number.isInteger(pointerId) || pointerId < 0) fail('invalid_drag_pointer_id');
  return pointerId;
}

function requirePointerType(pointerType) {
  if (typeof pointerType !== 'string' || !pointerType) fail('invalid_drag_pointer_type');
  return pointerType;
}

function directTransformFromWorldPoint(originTransform, worldPoint, dragHeight) {
  return deepFreeze({
    position: [worldPoint[0], worldPoint[1] + dragHeight, worldPoint[2]],
    rotationDegrees: originTransform.rotationDegrees,
    scale: originTransform.scale,
  });
}

function normalizeCandidate(result) {
  if (!result?.ok) return null;
  return deepFreeze({
    targetId: result.candidateTargetId,
    cell: result.candidateCell,
    radius: result.radius,
    candidateDistance: result.candidateDistance,
    worldPoint: result.worldPoint,
    placement: result.placement,
  });
}

function assertIntentMatchesDrag(intent, drag, candidate) {
  assertGameplayIntent(intent);
  if (intent.kind !== GAMEPLAY_INTENT_KINDS.MOVE) fail('drag_intent_must_be_move');
  if (intent.origin !== GAMEPLAY_INTENT_ORIGINS.HUMAN) fail('drag_intent_must_be_human');
  if (intent.presentation.source !== GAMEPLAY_PRESENTATION_SOURCES.DRAG_RELEASE) fail('drag_intent_source_mismatch');
  if (intent.authority.seat !== drag.seatId) fail('drag_intent_seat_mismatch');
  if (intent.authority.revision !== drag.witness.revision) fail('drag_intent_revision_mismatch');
  if (intent.payload.cell !== candidate.cell || intent.payload.size !== drag.size) fail('drag_intent_payload_mismatch');
  return intent;
}

function isOlderAuthority(nextState, controllerSnapshot) {
  return nextState.lifecycle.presentationGeneration < controllerSnapshot.generation
    || nextState.revision < controllerSnapshot.revision;
}

export function createDragInteractionController({
  motionController,
  authority,
  intentFactory,
  presentation,
  setCameraGesturesEnabled,
  clearSelection,
  approvedContract,
  worldLayout,
} = {}) {
  const motion = requireMotionController(motionController);
  const authorityAdapter = requireAuthority(authority);
  const makeIntent = requireIntentFactory(intentFactory);
  const view = requirePresentation(presentation);
  const setCameraEnabled = requireCameraGestureToggle(setCameraGesturesEnabled);
  const clearSizeSelection = requireClearSelection(clearSelection);
  const contract = requireContract(approvedContract);
  if (!worldLayout || typeof worldLayout !== 'object') fail('drag_world_layout_required');

  let sequence = 0;
  let current = null;

  function publicSnapshot() {
    if (!current) return deepFreeze({ phase: DRAG_PHASES.IDLE });
    return deepFreeze({
      phase: current.phase,
      dragId: current.dragId,
      pointerId: current.pointerId,
      pointerType: current.pointerType,
      pieceId: current.pieceId,
      seatId: current.seatId,
      size: current.size,
      witness: current.witness,
      candidate: current.candidate,
      diagnostic: current.diagnostic,
      pendingIntent: current.phase === DRAG_PHASES.PENDING ? current.intent : null,
      travelRequest: current.phase === DRAG_PHASES.PENDING ? current.travelRequest : null,
    });
  }

  function returnScope(pieceId) {
    return `drag-return:${pieceId}`;
  }

  function cancelExistingReturn(pieceId, reason = 'drag-began') {
    motion.cancelScope(returnScope(pieceId), reason);
  }

  function begin({ state, selection, pointerId, pointerType } = {}) {
    assertCanonicalSessionState(state);
    if (current) fail(current.phase === DRAG_PHASES.PENDING ? 'drag_submission_pending' : 'drag_already_active');
    if (!selectionMatchesState(selection, state)) fail('drag_selection_witness_mismatch');
    const target = resolveHomePieceTarget(state, {
      stackTargetId: selection.stackTargetId,
      size: selection.selectedSize,
    });
    if (target.id !== selection.selectedPieceTargetId) fail('drag_selected_piece_target_mismatch');
    const pieceId = pieceIdForTarget(target);
    const live = view.isPieceLive(pieceId);
    if (typeof live !== 'boolean') fail('drag_piece_liveness_invalid');
    if (!live) fail('drag_piece_not_live');
    const originTransform = normalizeTransform(view.readPieceTransform(pieceId), 'invalid_drag_origin_transform');
    const canonicalTransform = normalizeTransform(view.readCanonicalPieceTransform(pieceId), 'invalid_drag_canonical_transform');
    if (JSON.stringify(originTransform) !== JSON.stringify(canonicalTransform)) fail('drag_piece_not_at_canonical_start');

    const witness = witnessFromState(state);
    const motionSnapshot = motion.snapshot();
    if (witness.generation < motionSnapshot.generation || witness.revision < motionSnapshot.revision) fail('stale_drag_authority');
    motion.syncSessionAuthority(state.lifecycle, state.revision);
    cancelExistingReturn(pieceId, 'new-drag');

    const drag = {
      phase: DRAG_PHASES.DRAGGING,
      dragId: ++sequence,
      pointerId: requirePointerId(pointerId),
      pointerType: requirePointerType(pointerType),
      pieceId,
      seatId: target.seatId,
      size: target.size,
      stackTargetId: target.stackTargetId,
      selectedPieceTargetId: target.id,
      witness,
      originTransform,
      lastTransform: originTransform,
      candidate: null,
      diagnostic: null,
      intent: null,
      travelRequest: null,
      submission: null,
    };

    setCameraEnabled(false);
    current = drag;
    return publicSnapshot();
  }

  function assertActiveInput(state, selection, pointerId) {
    if (!current || current.phase !== DRAG_PHASES.DRAGGING) fail('drag_not_active');
    if (requirePointerId(pointerId) !== current.pointerId) fail('drag_pointer_mismatch');
    if (!selectionMatchesState(selection, state)) fail('drag_selection_witness_mismatch');
    const witness = witnessFromState(state);
    if (!sameWitness(witness, current.witness)) fail('drag_authority_changed');
    if (
      selection.selectedPieceTargetId !== current.selectedPieceTargetId
      || selection.selectedSize !== current.size
      || selection.stackTargetId !== current.stackTargetId
    ) fail('drag_selection_changed');
    return current;
  }

  function update({ state, selection, pointerId, ray, pointerType = current?.pointerType } = {}) {
    assertCanonicalSessionState(state);
    const drag = assertActiveInput(state, selection, pointerId);
    const normalizedPointerType = requirePointerType(pointerType);
    if (normalizedPointerType !== drag.pointerType) fail('drag_pointer_type_changed');

    // THREEJS-034 validates selection/layout and projects the ray before any direct
    // presentation write. Its worldPoint exists even when the point is outside all
    // valid radii, which still allows pointer-follow while exposing no candidate.
    const pick = resolveBoardCellPick({
      state,
      selection,
      ray,
      pointerType: normalizedPointerType,
      worldLayout,
      approvedContract,
    });

    let directTransform = drag.lastTransform;
    if (pick.worldPoint) {
      directTransform = directTransformFromWorldPoint(drag.originTransform, pick.worldPoint, contract.dragHeight);
      const live = view.isPieceLive(drag.pieceId);
      if (typeof live !== 'boolean') fail('drag_piece_liveness_invalid');
      if (!live) fail('drag_piece_not_live');
      view.applyDragTransform(drag.pieceId, directTransform, deepFreeze({
        dragId: drag.dragId,
        phase: DRAG_PHASES.DRAGGING,
        directPointerFollow: true,
        dragHeight: contract.dragHeight,
      }));
    }

    drag.lastTransform = directTransform;
    drag.candidate = normalizeCandidate(pick);
    drag.diagnostic = drag.candidate ? null : deepFreeze({
      code: pick.code,
      ruleCode: pick.ruleCode,
      candidateCell: pick.candidateCell,
      candidateTargetId: pick.candidateTargetId,
    });
    return publicSnapshot();
  }

  function requestCanonicalReturn(drag, reason) {
    const live = view.isPieceLive(drag.pieceId);
    if (typeof live !== 'boolean') fail('drag_piece_liveness_invalid');
    if (!live) return null;
    const from = normalizeTransform(view.readPieceTransform(drag.pieceId), 'invalid_drag_return_from');
    const to = normalizeTransform(view.readCanonicalPieceTransform(drag.pieceId), 'invalid_drag_return_to');
    return motion.animate({
      scope: returnScope(drag.pieceId),
      key: 'canonical-return',
      generation: drag.witness.generation,
      revision: drag.witness.revision,
      durationMs: contract.invalidReturnMs,
      from,
      to,
      easing: DRAG_RETURN_EASING,
      apply(value, meta) {
        view.applyDragTransform(drag.pieceId, value, deepFreeze({
          ...meta,
          dragReturn: true,
          reason,
        }));
      },
      isTargetLive: () => view.isPieceLive(drag.pieceId),
      snapToCanonical(meta) {
        view.snapPieceCanonical(drag.pieceId, meta);
      },
    });
  }

  function invalidRelease(drag, reason = 'invalid-release') {
    setCameraEnabled(true);
    const returnHandle = requestCanonicalReturn(drag, reason);
    current = null;
    return Object.freeze({
      status: 'returned',
      reason,
      returnHandle,
    });
  }

  function release({ state, selection, pointerId, ray, pointerType = current?.pointerType } = {}) {
    assertCanonicalSessionState(state);
    if (current?.phase === DRAG_PHASES.PENDING) {
      return Object.freeze({ status: 'pending', intent: current.intent, submission: current.submission, travelRequest: current.travelRequest });
    }
    const drag = assertActiveInput(state, selection, pointerId);
    update({ state, selection, pointerId, ray, pointerType });
    if (!drag.candidate) return invalidRelease(drag);

    const intent = makeIntent(deepFreeze({
      kind: GAMEPLAY_INTENT_KINDS.MOVE,
      origin: GAMEPLAY_INTENT_ORIGINS.HUMAN,
      seat: drag.seatId,
      revision: drag.witness.revision,
      payload: { cell: drag.candidate.cell, size: drag.size },
      source: GAMEPLAY_PRESENTATION_SOURCES.DRAG_RELEASE,
    }));
    assertIntentMatchesDrag(intent, drag, drag.candidate);

    const travelRequest = deepFreeze({
      owner: 'THREEJS-042',
      pieceId: drag.pieceId,
      fromTransform: drag.lastTransform,
      candidate: drag.candidate,
      intent,
      generation: drag.witness.generation,
      revision: drag.witness.revision,
    });

    let submission;
    try {
      submission = authorityAdapter.submit(intent);
    } catch (error) {
      invalidRelease(drag, 'submission-start-failed');
      throw error;
    }
    if (!submission || typeof submission.then !== 'function') {
      invalidRelease(drag, 'submission-start-failed');
      fail('drag_authority_submit_must_return_promise');
    }

    setCameraEnabled(true);
    drag.phase = DRAG_PHASES.PENDING;
    drag.intent = intent;
    drag.travelRequest = travelRequest;
    drag.submission = submission;
    drag.candidate = null;
    drag.diagnostic = null;
    current = drag;

    return Object.freeze({
      status: 'pending',
      intent,
      submission,
      travelRequest,
    });
  }

  function cancel({ state = null, reason = 'cancel' } = {}) {
    if (!current) return false;
    if (current.phase === DRAG_PHASES.PENDING) return false;
    const drag = current;
    setCameraEnabled(true);
    requestCanonicalReturn(drag, reason);
    current = null;
    clearSizeSelection('cancel', state);
    return true;
  }

  function pointerCancel({ reason = 'pointer-cancel', clearState = null } = {}) {
    if (!current) return false;
    if (current.phase === DRAG_PHASES.PENDING) return false;
    const drag = current;
    setCameraEnabled(true);
    motion.cancelScope(returnScope(drag.pieceId), reason);
    const live = view.isPieceLive(drag.pieceId);
    if (typeof live !== 'boolean') fail('drag_piece_liveness_invalid');
    if (live) view.snapPieceCanonical(drag.pieceId, deepFreeze({ reason, immediate: true }));
    current = null;
    clearSizeSelection('cancel', clearState);
    return true;
  }

  function reconcileCanonical({ state, clearReason, reason = 'canonical-resync' } = {}) {
    assertCanonicalSessionState(state);
    const normalizedClearReason = requireClearReason(clearReason);
    const before = motion.snapshot();
    if (isOlderAuthority(state, before)) fail('stale_drag_canonical_snapshot');

    motion.syncSessionAuthority(state.lifecycle, state.revision);
    if (!current) {
      clearSizeSelection(normalizedClearReason, state);
      return false;
    }

    const drag = current;
    setCameraEnabled(true);
    const live = view.isPieceLive(drag.pieceId);
    if (typeof live !== 'boolean') fail('drag_piece_liveness_invalid');
    if (live) {
      view.snapPieceCanonical(drag.pieceId, deepFreeze({
        reason,
        immediate: true,
        controllerGeneration: state.lifecycle.presentationGeneration,
        controllerRevision: state.revision,
      }));
    }
    current = null;
    clearSizeSelection(normalizedClearReason, state);
    return true;
  }

  return Object.freeze({
    begin,
    update,
    release,
    cancel,
    pointerCancel,
    reconcileCanonical,
    snapshot: publicSnapshot,
  });
}
