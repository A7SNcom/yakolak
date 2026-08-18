import { OnlineCompatibilityError } from './online-compatibility.js';

function requiredIdentity(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function freezeMoveIntent(move) {
  if (!move || typeof move !== 'object') throw new TypeError('move intent must be an object');
  const moveId = requiredIdentity(move.moveId, 'moveId');
  return Object.freeze({ ...move, moveId });
}

function compatibilityBoundary(gate) {
  if (
    gate &&
    typeof gate.assertMutationAllowed === 'function' &&
    typeof gate.observeSnapshot === 'function'
  ) {
    return gate;
  }

  return Object.freeze({
    assertMutationAllowed() {
      throw new OnlineCompatibilityError(
        'online_compatibility_unverified',
        'online mutation blocked until backend compatibility is verified',
      );
    },
    observeSnapshot() {
      throw new OnlineCompatibilityError('online_compatibility_unverified');
    },
  });
}

// Canonical online/session identity is deliberately CPU/application state.
// Graphics context loss/restoration must never recreate, clear, or replay this object.
export function createCanonicalOnlineSession({
  roomId,
  seatId,
  playerId,
  submitMove,
  compatibilityGate = null,
}) {
  if (typeof submitMove !== 'function') throw new TypeError('submitMove transport callback is required');

  const compatibility = compatibilityBoundary(compatibilityGate);
  const seatIdentity = Object.freeze({
    roomId: requiredIdentity(roomId, 'roomId'),
    seatId: requiredIdentity(seatId, 'seatId'),
    playerId: requiredIdentity(playerId, 'playerId'),
  });

  const submittedMoveIds = new Set();
  let lastMoveIntent = null;
  let lastSubmissionError = null;

  async function submitMoveIntent(move) {
    // This check is deliberately before mutation-id reservation and before transport.
    // Missing/failed compatibility proof cannot mutate online state or consume a move id.
    compatibility.assertMutationAllowed();

    const intent = freezeMoveIntent(move);
    if (submittedMoveIds.has(intent.moveId)) {
      return Object.freeze({ submitted: false, duplicate: true, moveId: intent.moveId });
    }

    submittedMoveIds.add(intent.moveId);
    lastMoveIntent = intent;
    lastSubmissionError = null;

    try {
      const result = await submitMove(intent, seatIdentity);
      if (result?.compatibility) compatibility.observeSnapshot(result);
      return Object.freeze({ submitted: true, duplicate: false, moveId: intent.moveId, result });
    } catch (error) {
      // Keep the id reserved only after a transport attempt. A reconnect reconciles
      // authoritative state rather than auto-resubmitting.
      lastSubmissionError = error instanceof Error ? error : new Error(String(error));
      throw lastSubmissionError;
    }
  }

  function snapshot() {
    return Object.freeze({
      seatIdentity,
      submittedMoveIds: Object.freeze([...submittedMoveIds]),
      lastMoveIntent,
      needsReconciliation: Boolean(lastSubmissionError),
      onlineCompatibility: compatibilityGate?.snapshot?.() || Object.freeze({
        state: 'unverified',
        compatible: false,
        identity: null,
        errorCode: 'online_compatibility_unverified',
      }),
    });
  }

  return Object.freeze({
    seatIdentity,
    submitMoveIntent,
    snapshot,
  });
}
