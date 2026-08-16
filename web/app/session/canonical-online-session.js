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

// Canonical online/session identity is deliberately CPU/application state.
// Graphics context loss/restoration must never recreate, clear, or replay this object.
export function createCanonicalOnlineSession({ roomId, seatId, playerId, submitMove }) {
  if (typeof submitMove !== 'function') throw new TypeError('submitMove transport callback is required');

  const seatIdentity = Object.freeze({
    roomId: requiredIdentity(roomId, 'roomId'),
    seatId: requiredIdentity(seatId, 'seatId'),
    playerId: requiredIdentity(playerId, 'playerId'),
  });

  const submittedMoveIds = new Set();
  let lastMoveIntent = null;
  let lastSubmissionError = null;

  async function submitMoveIntent(move) {
    const intent = freezeMoveIntent(move);
    if (submittedMoveIds.has(intent.moveId)) {
      return Object.freeze({ submitted: false, duplicate: true, moveId: intent.moveId });
    }

    // Reserve the mutation id before transport. Recovery/re-render code cannot replay it.
    submittedMoveIds.add(intent.moveId);
    lastMoveIntent = intent;
    lastSubmissionError = null;

    try {
      const result = await submitMove(intent, seatIdentity);
      return Object.freeze({ submitted: true, duplicate: false, moveId: intent.moveId, result });
    } catch (error) {
      // Keep the id reserved. A reconnect must reconcile authoritative state rather than auto-resubmit.
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
    });
  }

  return Object.freeze({
    seatIdentity,
    submitMoveIntent,
    snapshot,
  });
}
