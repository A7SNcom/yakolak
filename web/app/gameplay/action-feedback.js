import { assertCanonicalSessionState } from '../session/canonical-session-state.js';

export const ACTION_FEEDBACK_POLICY = Object.freeze({
  semanticScope: 'action-feedback:semantic',
  cue: 'brief-cross-badge',
  durationMs: 480,
  easing: 'easeOutCubic',
  from: Object.freeze({ opacity: 1, scale: 1 }),
  to: Object.freeze({ opacity: 0, scale: 0.96 }),
  ariaLive: 'polite',
  role: 'status',
});

export const ACTION_FEEDBACK_KINDS = Object.freeze({
  PRE_SUBMIT_INVALID: 'pre-submit-invalid',
  AUTHORITY_REJECTED: 'authority-rejected',
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

function requireFunction(value, code) {
  if (typeof value !== 'function') fail(code);
  return value;
}

function requireMotionController(motionController) {
  if (
    !motionController?.animate
    || !motionController?.cancelScope
    || !motionController?.snapshot
    || !motionController?.syncSessionAuthority
  ) fail('action_feedback_motion_controller_required');
  return motionController;
}

function requireAuthority(authority) {
  if (typeof authority?.snapshot !== 'function') fail('action_feedback_authority_snapshot_required');
  return authority;
}

function requirePresentation(presentation) {
  for (const [method, code] of [
    ['showFeedback', 'action_feedback_show_required'],
    ['applyFeedback', 'action_feedback_apply_required'],
    ['clearFeedback', 'action_feedback_clear_required'],
    ['isFeedbackLive', 'action_feedback_liveness_required'],
  ]) requireFunction(presentation?.[method], code);
  return presentation;
}

function requireReasonCode(value, fallback = 'move-unavailable') {
  const normalized = String(value ?? fallback).trim();
  if (!normalized || normalized.length > 160) fail('invalid_action_feedback_reason_code');
  return normalized;
}

function optionalTargetId(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 256) fail('invalid_action_feedback_target_id');
  return normalized;
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
  const leftWitness = left.generation === undefined ? witnessFromState(left) : left;
  const rightWitness = right.generation === undefined ? witnessFromState(right) : right;
  const deltas = [
    leftWitness.generation - rightWitness.generation,
    leftWitness.revision - rightWitness.revision,
    leftWitness.round - rightWitness.round,
  ];
  const hasPositive = deltas.some(value => value > 0);
  const hasNegative = deltas.some(value => value < 0);
  if (hasPositive && hasNegative) fail('action_feedback_authority_order_conflict');
  if (hasPositive) return 1;
  if (hasNegative) return -1;
  return 0;
}

function sameCanonicalSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function messageKeyFor(kind, reasonCode) {
  if (kind === ACTION_FEEDBACK_KINDS.AUTHORITY_REJECTED) return 'move-not-accepted-board-refreshed';
  if (reasonCode === 'occupied_slot') return 'target-slot-occupied';
  if (reasonCode === 'no_piece_remaining') return 'selected-piece-unavailable';
  if (reasonCode === 'move_after_deadline') return 'turn-time-expired';
  if (reasonCode === 'move_not_active_seat') return 'not-active-turn';
  return 'move-unavailable';
}

function rejectionCode(rejection) {
  return requireReasonCode(
    rejection?.code
      || rejection?.error?.code
      || rejection?.status
      || rejection?.message,
    'authority-rejected',
  );
}

function returnedSnapshotFrom(rejection, explicitSnapshot) {
  if (explicitSnapshot != null) return explicitSnapshot;
  if (rejection?.snapshot != null) return rejection.snapshot;
  if (rejection?.currentSnapshot != null) return rejection.currentSnapshot;
  return null;
}

function requireReturnMotion(returnMotion) {
  if (returnMotion == null) return null;
  if (!returnMotion || typeof returnMotion !== 'object' || Array.isArray(returnMotion)) fail('invalid_action_return_motion');
  if (returnMotion.scope === ACTION_FEEDBACK_POLICY.semanticScope) fail('action_return_scope_conflicts_with_semantic_feedback');
  return returnMotion;
}

export function createActionFeedbackController({
  motionController,
  authority,
  presentation,
  cancelSpeculativePresentation,
  rebuildFromCanonical,
} = {}) {
  const motion = requireMotionController(motionController);
  const authorityAdapter = requireAuthority(authority);
  const view = requirePresentation(presentation);
  const cancelSpeculative = requireFunction(cancelSpeculativePresentation, 'action_feedback_cancel_speculative_required');
  const rebuildCanonical = requireFunction(rebuildFromCanonical, 'action_feedback_rebuild_required');

  let latestCanonical = null;
  let activeFeedback = null;
  let feedbackSequence = 0;
  const activeReturnScopes = new Set();
  let released = false;

  function assertLive() {
    if (released) fail('action_feedback_controller_released');
  }

  function motionAuthorityIsAhead(state) {
    const current = motion.snapshot();
    return state.lifecycle.presentationGeneration < current.generation
      || state.revision < current.revision;
  }

  function syncMotionAuthority(state) {
    if (motionAuthorityIsAhead(state)) fail('action_feedback_canonical_behind_motion_authority');
    return motion.syncSessionAuthority(state.lifecycle, state.revision);
  }

  function recordCanonical(state, { staleIsError = true } = {}) {
    assertCanonicalSessionState(state);
    if (latestCanonical === null) {
      latestCanonical = state;
      return 1;
    }
    const comparison = compareWitness(state, latestCanonical);
    if (comparison < 0) {
      if (staleIsError) fail('stale_action_feedback_snapshot');
      return -1;
    }
    if (comparison === 0) {
      if (!sameCanonicalSnapshot(state, latestCanonical)) fail('action_feedback_same_witness_snapshot_conflict');
      return 0;
    }
    latestCanonical = state;
    return 1;
  }

  function clearFeedbackIfCurrent(feedbackId, reason) {
    if (!activeFeedback || activeFeedback.id !== feedbackId) return false;
    const live = view.isFeedbackLive(feedbackId);
    if (typeof live !== 'boolean') fail('action_feedback_liveness_must_return_boolean');
    if (live) view.clearFeedback(feedbackId, deepFreeze({ reason }));
    activeFeedback = null;
    return true;
  }

  function cancelSemanticFeedback(reason = 'feedback-cancelled') {
    const count = motion.cancelScope(ACTION_FEEDBACK_POLICY.semanticScope, reason);
    if (activeFeedback) clearFeedbackIfCurrent(activeFeedback.id, reason);
    return count;
  }

  function cancelPhysicalReturns(reason = 'physical-return-cancelled') {
    let cancelled = 0;
    for (const scope of [...activeReturnScopes]) {
      cancelled += motion.cancelScope(scope, reason);
      activeReturnScopes.delete(scope);
    }
    return cancelled;
  }

  function feedbackModel(state, kind, reasonCode, targetId) {
    const witness = witnessFromState(state);
    const sequence = ++feedbackSequence;
    return deepFreeze({
      id: `action-feedback:${witness.generation}:${witness.revision}:${witness.round}:${sequence}`,
      kind,
      cue: ACTION_FEEDBACK_POLICY.cue,
      reasonCode,
      messageKey: messageKeyFor(kind, reasonCode),
      targetId: optionalTargetId(targetId),
      generation: witness.generation,
      revision: witness.revision,
      round: witness.round,
      role: ACTION_FEEDBACK_POLICY.role,
      ariaLive: ACTION_FEEDBACK_POLICY.ariaLive,
      mutationSubmitted: kind === ACTION_FEEDBACK_KINDS.AUTHORITY_REJECTED,
      authoritativeStateChangedByFeedback: false,
    });
  }

  function startSemanticFeedback(state, kind, reasonCode, targetId = null) {
    syncMotionAuthority(state);
    cancelSemanticFeedback('superseded-by-newer-feedback');
    const model = feedbackModel(state, kind, reasonCode, targetId);
    view.showFeedback(model);
    activeFeedback = { id: model.id, witness: witnessFromState(state), model };

    const handle = motion.animate({
      scope: ACTION_FEEDBACK_POLICY.semanticScope,
      key: 'semantic-cue',
      generation: model.generation,
      revision: model.revision,
      durationMs: ACTION_FEEDBACK_POLICY.durationMs,
      from: ACTION_FEEDBACK_POLICY.from,
      to: ACTION_FEEDBACK_POLICY.to,
      easing: ACTION_FEEDBACK_POLICY.easing,
      apply(value, meta) {
        if (!activeFeedback || activeFeedback.id !== model.id) return;
        view.applyFeedback(model.id, value, meta);
      },
      isTargetLive() {
        if (!activeFeedback || activeFeedback.id !== model.id) return false;
        const live = view.isFeedbackLive(model.id);
        if (typeof live !== 'boolean') fail('action_feedback_liveness_must_return_boolean');
        return live;
      },
      snapToCanonical(meta) {
        clearFeedbackIfCurrent(model.id, meta.reason || 'feedback-authority-cancelled');
      },
    });

    handle.finished.then(result => {
      if (!activeFeedback || activeFeedback.id !== model.id) return;
      clearFeedbackIfCurrent(model.id, `feedback-${result.status}`);
    });
    return deepFreeze({ model, handle });
  }

  function schedulePhysicalReturn(state, returnMotion) {
    const descriptor = requireReturnMotion(returnMotion);
    if (descriptor === null) return null;
    syncMotionAuthority(state);
    const scope = String(descriptor.scope || '').trim();
    if (!scope) fail('action_return_motion_scope_required');
    cancelPhysicalReturns('superseded-by-newer-invalid-return');
    activeReturnScopes.add(scope);
    const handle = motion.animate({
      ...descriptor,
      generation: state.lifecycle.presentationGeneration,
      revision: state.revision,
    });
    handle.finished.then(() => activeReturnScopes.delete(scope));
    return handle;
  }

  function preSubmitInvalid({
    state,
    reasonCode,
    targetId = null,
    returnMotion = null,
  } = {}) {
    assertLive();
    assertCanonicalSessionState(state);
    const comparison = recordCanonical(state);
    if (comparison > 0) syncMotionAuthority(state);
    const normalizedReason = requireReasonCode(reasonCode);
    const physicalReturn = schedulePhysicalReturn(state, returnMotion);
    const semantic = startSemanticFeedback(
      state,
      ACTION_FEEDBACK_KINDS.PRE_SUBMIT_INVALID,
      normalizedReason,
      targetId,
    );
    return deepFreeze({
      status: 'invalid-pre-submit',
      mutationSubmitted: false,
      authoritativeStateChangedByFeedback: false,
      feedback: semantic.model,
      feedbackHandle: semantic.handle,
      returnHandle: physicalReturn,
    });
  }

  function newerHydratedThanAttempt(state, attemptedState) {
    if (!state) return false;
    return compareWitness(state, attemptedState) > 0;
  }

  function chooseNewestCanonical(candidates) {
    let chosen = null;
    for (const candidate of candidates.filter(Boolean)) {
      assertCanonicalSessionState(candidate);
      if (chosen === null) {
        chosen = candidate;
        continue;
      }
      const comparison = compareWitness(candidate, chosen);
      if (comparison > 0) chosen = candidate;
      else if (comparison === 0 && !sameCanonicalSnapshot(candidate, chosen)) {
        fail('action_feedback_same_witness_snapshot_conflict');
      }
    }
    return chosen;
  }

  function observeHydration(state, { reason = 'hydration' } = {}) {
    assertLive();
    assertCanonicalSessionState(state);
    const comparison = recordCanonical(state);
    if (comparison === 0) return deepFreeze({ status: 'unchanged', snapshot: state });

    cancelSemanticFeedback('newer-hydration');
    cancelPhysicalReturns('newer-hydration');
    syncMotionAuthority(state);
    cancelSpeculative(reason);
    rebuildCanonical(state, deepFreeze({ reason, source: 'hydration' }));
    return deepFreeze({ status: 'rebuilt', snapshot: state });
  }

  async function authoritativeRejected({
    attemptedState,
    rejection,
    returnedSnapshot = null,
    targetId = null,
  } = {}) {
    assertLive();
    assertCanonicalSessionState(attemptedState);
    const normalizedReason = rejectionCode(rejection);
    const explicitReturned = returnedSnapshotFrom(rejection, returnedSnapshot);
    if (explicitReturned !== null) assertCanonicalSessionState(explicitReturned);

    // Stop speculative/pending presentation immediately. Do not animate a guessed rollback
    // while waiting for the authoritative/current canonical snapshot.
    cancelSpeculative('authority-rejected');
    cancelSemanticFeedback('authority-rejected');
    cancelPhysicalReturns('authority-rejected');

    let currentSnapshot = null;
    let snapshotError = null;
    try {
      currentSnapshot = await authorityAdapter.snapshot();
      assertCanonicalSessionState(currentSnapshot);
    } catch (error) {
      snapshotError = error;
    }

    const newerHydration = newerHydratedThanAttempt(latestCanonical, attemptedState)
      ? latestCanonical
      : null;
    const chosen = chooseNewestCanonical([
      newerHydration,
      explicitReturned,
      currentSnapshot,
    ]);
    if (chosen === null) {
      if (snapshotError) {
        const error = new Error('authority_rejection_snapshot_unavailable', { cause: snapshotError });
        error.code = 'authority_rejection_snapshot_unavailable';
        throw error;
      }
      fail('authority_rejection_snapshot_unavailable');
    }

    recordCanonical(chosen, { staleIsError: false });
    syncMotionAuthority(chosen);
    rebuildCanonical(chosen, deepFreeze({
      reason: 'authority-rejected',
      rejectionCode: normalizedReason,
      source: chosen === newerHydration
        ? 'newer-hydration'
        : chosen === explicitReturned
          ? 'returned-snapshot'
          : 'current-snapshot',
    }));

    const semantic = startSemanticFeedback(
      chosen,
      ACTION_FEEDBACK_KINDS.AUTHORITY_REJECTED,
      normalizedReason,
      targetId,
    );
    return deepFreeze({
      status: 'authority-rejected',
      rejectionCode: normalizedReason,
      canonicalSnapshot: chosen,
      feedback: semantic.model,
      feedbackHandle: semantic.handle,
      mutationSubmitted: true,
      authoritativeStateChangedByFeedback: false,
    });
  }

  function snapshot() {
    return deepFreeze({
      released,
      latestWitness: latestCanonical ? witnessFromState(latestCanonical) : null,
      activeFeedbackId: activeFeedback?.id || null,
      activeReturnScopes: [...activeReturnScopes].sort(),
      feedbackSequence,
    });
  }

  function release() {
    if (released) return false;
    cancelSemanticFeedback('action-feedback-released');
    cancelPhysicalReturns('action-feedback-released');
    released = true;
    latestCanonical = null;
    return true;
  }

  return Object.freeze({
    preSubmitInvalid,
    authoritativeRejected,
    observeHydration,
    snapshot,
    release,
    dispose: release,
  });
}
