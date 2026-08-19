import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  createGameplayIntent,
} from './gameplay-intent.js';
import { RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import {
  RULES,
  SIZES,
  validatePlacementForSeat,
} from '../shared/rules.js';
import { assertCanonicalSessionState } from '../session/canonical-session-state.js';

export const BOT_THINKING_DELAY_MS = Object.freeze({
  min: 420,
  max: 740,
  reducedMotion: 0,
});

const STALE_SUBMIT_CODES = new Set([
  'stale_local_authority_revision',
  'move_not_active_seat',
  'move_requires_turn_loop',
  'move_requires_deadline',
]);

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

function randomSample(random, code) {
  if (typeof random !== 'function') fail(`${code}_random_required`);
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) fail(`${code}_random_out_of_range`);
  return value;
}

function clockNow(clock) {
  if (typeof clock !== 'function') fail('bot_clock_required');
  const nowMs = clock();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail('invalid_bot_clock');
  return nowMs;
}

function requireAuthority(authority) {
  if (!authority || typeof authority.snapshot !== 'function' || typeof authority.submit !== 'function') {
    fail('bot_authority_snapshot_submit_required');
  }
  return authority;
}

function requireComputerClassifier(classifier) {
  if (typeof classifier !== 'function') fail('computer_seat_classifier_required');
  return classifier;
}

function requireRegistry(resourceRegistry) {
  if (!resourceRegistry?.createScope) fail('bot_resource_registry_required');
  return resourceRegistry;
}

function currentComputerSeat(state, isComputerSeatType) {
  assertCanonicalSessionState(state);
  if (state.lifecycle.phase !== 'turn-loop' || state.lifecycle.interrupt !== null || state.activeSeatId === null) {
    return null;
  }
  const seat = state.seats.find(candidate => candidate.seatId === state.activeSeatId) || null;
  if (!seat) return null;
  const computer = isComputerSeatType(seat.type);
  if (typeof computer !== 'boolean') fail('computer_seat_classifier_must_return_boolean');
  return computer ? seat : null;
}

function witnessFromState(state) {
  return deepFreeze({
    seatId: state.activeSeatId,
    revision: state.revision,
    deadlineAtMs: state.deadlineAtMs,
    presentationGeneration: state.lifecycle.presentationGeneration,
  });
}

function witnessStillCurrent(state, witness) {
  return (
    state.lifecycle.phase === 'turn-loop'
    && state.lifecycle.interrupt === null
    && state.activeSeatId === witness.seatId
    && state.revision === witness.revision
    && state.deadlineAtMs === witness.deadlineAtMs
    && state.lifecycle.presentationGeneration === witness.presentationGeneration
  );
}

function statusResult(status, {
  seatId = null,
  revision = null,
  delayMs = 0,
  reason = null,
  intent = null,
  result = null,
} = {}) {
  return deepFreeze({
    status,
    submitted: status === 'submitted',
    seatId,
    revision,
    delayMs,
    reason,
    intent,
    result,
  });
}

export function enumerateComputerLegalMoveIntents(state, seatId) {
  assertCanonicalSessionState(state);
  const seat = state.seats.find(candidate => candidate.seatId === seatId);
  if (!seat) fail('computer_seat_not_configured');

  const intents = [];
  // Locked enumeration order is cell-major, then canonical small/medium/large size.
  // Random selection is uniform over this complete legal-intent list, not over a
  // separate size-first or cell-first heuristic.
  for (let cell = 0; cell < RULES.cellCount; cell += 1) {
    for (const size of SIZES) {
      const placement = { cell, size };
      if (!validatePlacementForSeat(state, seatId, placement).ok) continue;
      intents.push(createGameplayIntent({
        kind: GAMEPLAY_INTENT_KINDS.MOVE,
        origin: GAMEPLAY_INTENT_ORIGINS.BOT,
        seat: seatId,
        revision: state.revision,
        payload: placement,
        source: GAMEPLAY_PRESENTATION_SOURCES.NONE,
        adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
      }));
    }
  }
  return Object.freeze(intents);
}

export function chooseComputerLegalMoveIntent(intents, {
  random,
} = {}) {
  if (!Array.isArray(intents)) fail('computer_legal_intents_required');
  if (intents.length === 0) return null;
  const sample = randomSample(random, 'computer_strategy');
  return intents[Math.floor(sample * intents.length)];
}

export function deriveBotThinkingDelayMs({
  reducedMotion = false,
  random,
} = {}) {
  if (typeof reducedMotion !== 'boolean') fail('invalid_bot_reduced_motion');
  if (reducedMotion) return BOT_THINKING_DELAY_MS.reducedMotion;
  const sample = randomSample(random, 'bot_presentation');
  const span = BOT_THINKING_DELAY_MS.max - BOT_THINKING_DELAY_MS.min + 1;
  return BOT_THINKING_DELAY_MS.min + Math.floor(sample * span);
}

export function createComputerTurnProducer({
  authority,
  isComputerSeatType,
  resourceRegistry,
  strategyRandom = Math.random,
  presentationRandom = Math.random,
  clock = () => Date.now(),
} = {}) {
  const targetAuthority = requireAuthority(authority);
  const classifyComputer = requireComputerClassifier(isComputerSeatType);
  const registry = requireRegistry(resourceRegistry);
  const lifecycle = registry.createScope('computer-turn-producer', {
    ownership: RESOURCE_OWNERSHIP.TRANSIENT,
  });

  let runSequence = 0;
  let activeTimer = null;
  let activeResolve = null;
  let disposed = false;

  function settleActive(value) {
    const resolve = activeResolve;
    activeResolve = null;
    activeTimer = null;
    resolve?.(value);
  }

  function cancelPending(reason = 'cancelled') {
    runSequence += 1;
    if (activeTimer?.active) activeTimer.cancel(`bot-thinking-${reason}`);
    if (activeResolve) {
      settleActive(statusResult('cancelled', { reason }));
      return true;
    }
    activeTimer = null;
    return false;
  }

  async function playCurrentTurn({ reducedMotion = false } = {}) {
    if (disposed) fail('computer_turn_producer_disposed');
    cancelPending('superseded');
    const runId = runSequence;

    const initial = await targetAuthority.snapshot();
    if (disposed || runId !== runSequence) return statusResult('cancelled', { reason: 'superseded' });
    assertCanonicalSessionState(initial);

    const seat = currentComputerSeat(initial, classifyComputer);
    if (!seat) {
      return statusResult('not-computer-turn', {
        seatId: initial.activeSeatId,
        revision: initial.revision,
        reason: 'active-seat-is-not-computer',
      });
    }
    if (initial.deadlineAtMs === null) fail('computer_turn_requires_deadline');

    const nowMs = clockNow(clock);
    if (nowMs >= initial.deadlineAtMs) {
      return statusResult('deadline-expired', {
        seatId: seat.seatId,
        revision: initial.revision,
        reason: 'deadline-expired-before-thinking',
      });
    }

    const legalIntents = enumerateComputerLegalMoveIntents(initial, seat.seatId);
    const chosenIntent = chooseComputerLegalMoveIntent(legalIntents, { random: strategyRandom });
    if (!chosenIntent) {
      return statusResult('no-legal-intents', {
        seatId: seat.seatId,
        revision: initial.revision,
        reason: 'shared-rules-no-legal-placement',
      });
    }

    // Strategy choice is already fixed before presentation delay is derived, and
    // uses a distinct RNG channel. Reduced Motion can therefore skip presentation
    // without changing which legal move the Computer chose.
    const delayMs = deriveBotThinkingDelayMs({ reducedMotion, random: presentationRandom });
    const witness = witnessFromState(initial);

    return new Promise((resolve, reject) => {
      activeResolve = resolve;
      const finish = async () => {
        if (disposed || runId !== runSequence) {
          settleActive(statusResult('cancelled', {
            seatId: witness.seatId,
            revision: witness.revision,
            delayMs,
            reason: 'superseded',
            intent: chosenIntent,
          }));
          return;
        }

        try {
          const current = await targetAuthority.snapshot();
          if (disposed || runId !== runSequence) {
            settleActive(statusResult('cancelled', {
              seatId: witness.seatId,
              revision: witness.revision,
              delayMs,
              reason: 'superseded',
              intent: chosenIntent,
            }));
            return;
          }
          assertCanonicalSessionState(current);
          if (!witnessStillCurrent(current, witness)) {
            settleActive(statusResult('stale', {
              seatId: witness.seatId,
              revision: witness.revision,
              delayMs,
              reason: 'turn-or-revision-changed',
              intent: chosenIntent,
            }));
            return;
          }
          if (clockNow(clock) >= current.deadlineAtMs) {
            settleActive(statusResult('deadline-expired', {
              seatId: witness.seatId,
              revision: witness.revision,
              delayMs,
              reason: 'deadline-expired-during-thinking',
              intent: chosenIntent,
            }));
            return;
          }

          try {
            const result = await targetAuthority.submit(chosenIntent);
            settleActive(statusResult('submitted', {
              seatId: witness.seatId,
              revision: result.revision,
              delayMs,
              intent: chosenIntent,
              result,
            }));
          } catch (error) {
            if (STALE_SUBMIT_CODES.has(error?.code)) {
              settleActive(statusResult('stale', {
                seatId: witness.seatId,
                revision: witness.revision,
                delayMs,
                reason: error.code,
                intent: chosenIntent,
              }));
              return;
            }
            if (error?.code === 'move_after_deadline') {
              settleActive(statusResult('deadline-expired', {
                seatId: witness.seatId,
                revision: witness.revision,
                delayMs,
                reason: error.code,
                intent: chosenIntent,
              }));
              return;
            }
            throw error;
          }
        } catch (error) {
          activeResolve = null;
          activeTimer = null;
          reject(error);
        }
      };

      activeTimer = lifecycle.setTimeout(() => {
        activeTimer = null;
        void finish();
      }, delayMs, { label: 'bot-thinking-delay' });
    });
  }

  function release() {
    if (disposed) return false;
    disposed = true;
    cancelPending('released');
    lifecycle.release('computer-turn-producer-released');
    return true;
  }

  return Object.freeze({
    playCurrentTurn,
    cancelPending,
    release,
    dispose: release,
  });
}
