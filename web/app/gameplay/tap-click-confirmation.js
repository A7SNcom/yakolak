import {
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  assertGameplayIntent,
} from './gameplay-intent.js';
import { resolveBoardCellPick } from './board-cell-picking.js';
import { createSizeSelectionController, SIZE_SELECTION_CLEAR_REASONS } from './size-selection.js';
import { assertCanonicalSessionState } from '../session/canonical-session-state.js';

export const UX_SELECT_46_PROCESSING_P95_CEILING_MS = 50;

export const TAP_CONFIRMATION_PHASES = Object.freeze({
  IDLE: 'idle',
  SELECTED: 'selected',
  PENDING: 'pending',
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

function requireAuthority(authority) {
  if (!authority?.submit || !authority?.snapshot) fail('tap_authority_adapter_required');
  return authority;
}

function requireIntentFactory(intentFactory) {
  if (typeof intentFactory !== 'function') fail('tap_intent_factory_required');
  return intentFactory;
}

function requireFeedback(onFeedback) {
  if (typeof onFeedback !== 'function') fail('tap_feedback_callback_required');
  return onFeedback;
}

function requireInputSource(source) {
  if (source === GAMEPLAY_PRESENTATION_SOURCES.TAP || source === GAMEPLAY_PRESENTATION_SOURCES.CLICK) return source;
  fail('invalid_tap_click_source');
}

function requireClearReason(reason) {
  if (!SIZE_SELECTION_CLEAR_REASONS.includes(reason)) fail('invalid_tap_clear_reason');
  return reason;
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

function isOlderWitness(next, current) {
  if (!current) return false;
  return next.generation < current.generation || next.revision < current.revision;
}

function assertIntentMatchesTap(intent, selection, pick, source) {
  assertGameplayIntent(intent);
  if (intent.kind !== GAMEPLAY_INTENT_KINDS.MOVE) fail('tap_intent_must_be_move');
  if (intent.origin !== GAMEPLAY_INTENT_ORIGINS.HUMAN) fail('tap_intent_must_be_human');
  if (intent.presentation.source !== source) fail('tap_intent_source_mismatch');
  if (intent.authority.seat !== selection.seatId) fail('tap_intent_seat_mismatch');
  if (intent.authority.revision !== selection.witness.revision) fail('tap_intent_revision_mismatch');
  if (intent.payload.cell !== pick.candidateCell || intent.payload.size !== selection.selectedSize) fail('tap_intent_payload_mismatch');
  return intent;
}

export function createTapClickConfirmationController({
  authority,
  intentFactory,
  onFeedback,
  worldLayout,
  approvedContract,
} = {}) {
  const authorityAdapter = requireAuthority(authority);
  const makeIntent = requireIntentFactory(intentFactory);
  const feedback = requireFeedback(onFeedback);
  if (!worldLayout || typeof worldLayout !== 'object') fail('tap_world_layout_required');
  if (!approvedContract || typeof approvedContract !== 'object') fail('tap_approved_contract_required');

  const selectionController = createSizeSelectionController();
  let phase = TAP_CONFIRMATION_PHASES.IDLE;
  let pending = null;
  let diagnostic = null;
  let inputSequence = 0;
  let latestWitness = null;

  function snapshot() {
    const selection = selectionController.snapshot();
    return deepFreeze({
      phase,
      selection,
      diagnostic,
      pendingIntent: pending?.intent || null,
      pendingSource: pending?.source || null,
      inputSequence,
    });
  }

  function emit(kind, extra = {}) {
    const visible = snapshot();
    feedback(visible, deepFreeze({ kind, sameRenderOpportunity: true, ...extra }));
    return visible;
  }

  function candidateWitness(state) {
    const witness = witnessFromState(state);
    if (isOlderWitness(witness, latestWitness)) fail('stale_tap_snapshot');
    return witness;
  }

  function tapSize({ state, stackTargetId, size, source = GAMEPLAY_PRESENTATION_SOURCES.TAP } = {}) {
    assertCanonicalSessionState(state);
    const inputSource = requireInputSource(source);
    inputSequence += 1;
    if (phase === TAP_CONFIRMATION_PHASES.PENDING) return emit('pending-duplicate-size-tap', { source: inputSource });

    const witness = candidateWitness(state);
    const selection = selectionController.select(state, { stackTargetId, size });
    latestWitness = witness;
    phase = TAP_CONFIRMATION_PHASES.SELECTED;
    pending = null;
    diagnostic = null;
    return emit('size-selected', { source: inputSource, selectedSize: selection.selectedSize });
  }

  function tapBoard({
    state,
    ray,
    pointerType = 'mouse',
    source = GAMEPLAY_PRESENTATION_SOURCES.CLICK,
  } = {}) {
    assertCanonicalSessionState(state);
    const inputSource = requireInputSource(source);
    inputSequence += 1;

    if (phase === TAP_CONFIRMATION_PHASES.PENDING) {
      return deepFreeze({ status: 'pending', submission: pending.submission, snapshot: emit('pending-duplicate-cell-tap', { source: inputSource }) });
    }
    if (phase !== TAP_CONFIRMATION_PHASES.SELECTED) fail('tap_requires_size_selection');

    const witness = candidateWitness(state);
    const selection = selectionController.snapshot();
    if (!sameWitness(selection.witness, witness)) fail('tap_selection_witness_mismatch');

    const pick = resolveBoardCellPick({
      state,
      selection,
      ray,
      pointerType,
      worldLayout,
      approvedContract,
    });

    if (!pick.ok) {
      diagnostic = deepFreeze({
        code: pick.code,
        ruleCode: pick.ruleCode,
        candidateCell: pick.candidateCell,
        candidateTargetId: pick.candidateTargetId,
      });
      const visible = emit('invalid-cell-tap', { source: inputSource });
      return deepFreeze({ status: 'invalid', pick, snapshot: visible });
    }

    const intent = makeIntent(deepFreeze({
      kind: GAMEPLAY_INTENT_KINDS.MOVE,
      origin: GAMEPLAY_INTENT_ORIGINS.HUMAN,
      seat: selection.seatId,
      revision: selection.witness.revision,
      payload: { cell: pick.candidateCell, size: selection.selectedSize },
      source: inputSource,
    }));
    assertIntentMatchesTap(intent, selection, pick, inputSource);

    phase = TAP_CONFIRMATION_PHASES.PENDING;
    diagnostic = null;
    pending = { intent, source: inputSource, submission: null };
    latestWitness = witness;
    const pendingVisible = emit('authoritative-commit-pending', {
      source: inputSource,
      cell: pick.candidateCell,
      selectedSize: selection.selectedSize,
    });

    let submission;
    try {
      submission = authorityAdapter.submit(intent);
    } catch (error) {
      phase = TAP_CONFIRMATION_PHASES.SELECTED;
      pending = null;
      diagnostic = deepFreeze({ code: 'submission-start-failed', ruleCode: null });
      emit('submission-start-failed', { source: inputSource });
      throw error;
    }
    if (!submission || typeof submission.then !== 'function') {
      phase = TAP_CONFIRMATION_PHASES.SELECTED;
      pending = null;
      diagnostic = deepFreeze({ code: 'submission-start-failed', ruleCode: null });
      emit('submission-start-failed', { source: inputSource });
      fail('tap_authority_submit_must_return_promise');
    }

    pending = { intent, source: inputSource, submission };
    return deepFreeze({ status: 'pending', intent, submission, pick, snapshot: pendingVisible });
  }

  function cancel({ state = null } = {}) {
    if (phase === TAP_CONFIRMATION_PHASES.PENDING) return false;
    inputSequence += 1;
    const witness = state ? candidateWitness(state) : latestWitness;
    selectionController.clear('cancel', state);
    latestWitness = witness;
    phase = TAP_CONFIRMATION_PHASES.IDLE;
    diagnostic = null;
    pending = null;
    emit('cancelled');
    return true;
  }

  function reconcileCanonical({ state, clearReason } = {}) {
    assertCanonicalSessionState(state);
    const reason = requireClearReason(clearReason);
    const witness = candidateWitness(state);

    if (
      phase === TAP_CONFIRMATION_PHASES.PENDING
      && pending
      && latestWitness
      && sameWitness(witness, latestWitness)
      && reason !== 'rejected-resync'
      && reason !== 'reconnect'
    ) {
      fail('pending_tap_requires_authority_resolution');
    }

    selectionController.clear(reason, state);
    latestWitness = witness;
    phase = TAP_CONFIRMATION_PHASES.IDLE;
    diagnostic = null;
    pending = null;
    inputSequence += 1;
    emit('canonical-reconciled', { clearReason: reason });
    return true;
  }

  return Object.freeze({ tapSize, tapBoard, cancel, reconcileCanonical, snapshot });
}
