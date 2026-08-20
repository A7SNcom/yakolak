import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_INTENT_KINDS,
  assertGameplayIntent,
  parseGameplayIntent,
  serializeGameplayIntent,
} from '../gameplay/gameplay-intent.js';
import { OnlineCompatibilityError } from './online-compatibility.js';

function requiredIdentity(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function freezeMoveIntent(intent, seatId) {
  assertGameplayIntent(intent);
  if (intent.kind !== GAMEPLAY_INTENT_KINDS.MOVE) {
    throw new TypeError('online session intent must be a gameplay move');
  }
  if (intent.authority.adapter !== GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK) {
    throw new TypeError('online session move requires network authority context');
  }
  if (intent.authority.seat !== seatId) {
    throw new TypeError('online session move seat does not match canonical seat identity');
  }
  return parseGameplayIntent(serializeGameplayIntent(intent));
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
// Gameplay mutations use only the THREEJS-029 network intent envelope; graphics
// recovery must not introduce or preserve a parallel legacy move contract.
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

  const submittedMutationIds = new Set();
  let lastMoveIntent = null;
  let lastSubmissionError = null;

  async function submitMoveIntent(candidate) {
    // This check is deliberately before mutation-id reservation and before transport.
    // Missing/failed compatibility proof cannot mutate online state or consume a mutation id.
    compatibility.assertMutationAllowed();

    const intent = freezeMoveIntent(candidate, seatIdentity.seatId);
    const mutationId = intent.authority.mutationId;
    if (submittedMutationIds.has(mutationId)) {
      return Object.freeze({ submitted: false, duplicate: true, mutationId });
    }

    submittedMutationIds.add(mutationId);
    lastMoveIntent = intent;
    lastSubmissionError = null;

    try {
      const result = await submitMove(intent, seatIdentity);
      if (result?.compatibility) compatibility.observeSnapshot(result);
      return Object.freeze({ submitted: true, duplicate: false, mutationId, result });
    } catch (error) {
      // Keep the mutation id reserved only after a transport attempt. A reconnect
      // reconciles authoritative state rather than auto-resubmitting.
      lastSubmissionError = error instanceof Error ? error : new Error(String(error));
      throw lastSubmissionError;
    }
  }

  function snapshot() {
    return Object.freeze({
      seatIdentity,
      submittedMutationIds: Object.freeze([...submittedMutationIds]),
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
