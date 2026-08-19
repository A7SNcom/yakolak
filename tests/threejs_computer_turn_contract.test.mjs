import assert from 'node:assert/strict';

import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  createGameplayIntent,
} from '../web/app/gameplay/gameplay-intent.js';
import {
  BOT_THINKING_DELAY_MS,
  chooseComputerLegalMoveIntent,
  createComputerTurnProducer,
  deriveBotThinkingDelayMs,
  enumerateComputerLegalMoveIntents,
} from '../web/app/gameplay/computer-turn.js';
import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import { emptyBoard, validatePlacementForSeat } from '../web/app/shared/rules.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';
import { createLocalAuthorityAdapter } from '../web/app/session/local-authority-adapter.js';

const isOnlineSeatType = type => type === 'online-human';
const isComputerSeatType = type => type === 'computer';

function seats() {
  return configuredSeatOrder('marble', 2).map((slot, index) => ({
    seatId: slot.seatId,
    type: index === 0 ? 'human' : 'computer',
    color: slot.color,
    ready: true,
  }));
}

function computerTurnState({
  board = emptyBoard(),
  revision = 10,
  deadlineAtMs = 20_000,
} = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats: seats(),
    board,
    activeSeatId: 'back',
    deadlineAtMs,
    revision,
    lifecycle: { phase: 'turn-loop', presentationGeneration: 4 },
  });
}

function fakeTimerPlatform() {
  let sequence = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++sequence;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    pending() {
      return [...timers.entries()].map(([id, timer]) => ({ id, delay: timer.delay }));
    },
    fireNext() {
      const next = timers.entries().next();
      if (next.done) return false;
      const [id, timer] = next.value;
      timers.delete(id);
      timer.callback();
      return true;
    },
  };
}

// Enumeration is complete, deterministic, and uses shared legality. Empty board
// yields 9 cells × 3 canonical sizes = 27 legal move intents.
const emptyState = computerTurnState();
const legal = enumerateComputerLegalMoveIntents(emptyState, 'back');
assert.equal(legal.length, 27);
assert(Object.isFrozen(legal));
for (const candidate of legal) {
  assert.equal(candidate.kind, GAMEPLAY_INTENT_KINDS.MOVE);
  assert.equal(candidate.origin, GAMEPLAY_INTENT_ORIGINS.BOT);
  assert.equal(candidate.authority.adapter, GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL);
  assert.equal(candidate.authority.seat, 'back');
  assert.equal(candidate.authority.revision, 10);
  assert.equal(candidate.presentation.source, GAMEPLAY_PRESENTATION_SOURCES.NONE);
  assert.equal(validatePlacementForSeat(emptyState, 'back', candidate.payload).ok, true);
}
assert.deepEqual(legal[0].payload, { cell: 0, size: 'small' });
assert.deepEqual(legal.at(-1).payload, { cell: 8, size: 'large' });

const occupied = emptyBoard();
occupied['0'].small = 'marble';
const occupiedLegal = enumerateComputerLegalMoveIntents(computerTurnState({ board: occupied }), 'back');
assert.equal(occupiedLegal.length, 26);
assert.equal(occupiedLegal.some(candidate => candidate.payload.cell === 0 && candidate.payload.size === 'small'), false);

// Strategy is deliberately simple: uniform selection over the complete legal list.
assert.equal(chooseComputerLegalMoveIntent(legal, { random: () => 0 }), legal[0]);
assert.equal(chooseComputerLegalMoveIntent(legal, { random: () => 0.999999 }), legal.at(-1));
assert.equal(chooseComputerLegalMoveIntent([], { random: () => 0.5 }), null);
assert.throws(() => chooseComputerLegalMoveIntent(legal, { random: () => 1 }), /computer_strategy_random_out_of_range/);
assert.throws(() => chooseComputerLegalMoveIntent(legal, { random: () => -0.01 }), /computer_strategy_random_out_of_range/);

// Portable-kit timing is exact 420–740ms. Reduced Motion skips presentation delay
// and does not even consume the presentation RNG channel.
assert.deepEqual(BOT_THINKING_DELAY_MS, { min: 420, max: 740, reducedMotion: 0 });
assert.equal(deriveBotThinkingDelayMs({ reducedMotion: false, random: () => 0 }), 420);
assert.equal(deriveBotThinkingDelayMs({ reducedMotion: false, random: () => 0.999999 }), 740);
let reducedPresentationRandomCalls = 0;
assert.equal(deriveBotThinkingDelayMs({
  reducedMotion: true,
  random: () => {
    reducedPresentationRandomCalls += 1;
    return 0.9;
  },
}), 0);
assert.equal(reducedPresentationRandomCalls, 0);

// Integration: the Computer waits as presentation only. Authority snapshot does not
// change before the timer fires, then the chosen BOT intent goes through the exact
// same local authority submit path as a human move.
let nowMs = 1_000;
const platform = fakeTimerPlatform();
const registry = createResourceRegistry({ platform });
const authority = createLocalAuthorityAdapter({
  initialState: emptyState,
  isOnlineSeatType,
  clock: () => nowMs,
});
const producer = createComputerTurnProducer({
  authority,
  isComputerSeatType,
  resourceRegistry: registry,
  strategyRandom: () => 0,
  presentationRandom: () => 0,
  clock: () => nowMs,
});
const pending = producer.playCurrentTurn();
await Promise.resolve();
await Promise.resolve();
assert.deepEqual(platform.pending().map(timer => timer.delay), [420]);
const beforeThinkingFinishes = await authority.snapshot();
assert.equal(beforeThinkingFinishes.revision, 10);
assert.deepEqual(beforeThinkingFinishes.board, emptyBoard());
assert.equal(beforeThinkingFinishes.deadlineAtMs, 20_000, 'thinking never extends/reset the authority deadline');
platform.fireNext();
const submitted = await pending;
assert.equal(submitted.status, 'submitted');
assert.equal(submitted.submitted, true);
assert.equal(submitted.delayMs, 420);
assert.equal(submitted.intent.origin, GAMEPLAY_INTENT_ORIGINS.BOT);
assert.deepEqual(submitted.intent.payload, { cell: 0, size: 'small' });
assert.equal(submitted.result.revision, 11);
assert.equal(submitted.result.snapshot.board['0'].small, 'blue');
assert.equal(submitted.result.snapshot.activeSeatId, 'right');
assert.equal(submitted.result.snapshot.deadlineAtMs, nowMs + 18_000);
producer.dispose();
registry.dispose('computer-turn-test-complete');

// Reduced Motion changes presentation delay only. The strategy RNG selects the
// same legal intent, presentation RNG is skipped, and submission remains shared.
nowMs = 2_000;
const reducedPlatform = fakeTimerPlatform();
const reducedRegistry = createResourceRegistry({ platform: reducedPlatform });
const reducedAuthority = createLocalAuthorityAdapter({
  initialState: computerTurnState({ revision: 20, deadlineAtMs: 30_000 }),
  isOnlineSeatType,
  clock: () => nowMs,
});
let presentationCalls = 0;
const reducedProducer = createComputerTurnProducer({
  authority: reducedAuthority,
  isComputerSeatType,
  resourceRegistry: reducedRegistry,
  strategyRandom: () => 0,
  presentationRandom: () => {
    presentationCalls += 1;
    return 0.8;
  },
  clock: () => nowMs,
});
const reducedPending = reducedProducer.playCurrentTurn({ reducedMotion: true });
await Promise.resolve();
await Promise.resolve();
assert.deepEqual(reducedPlatform.pending().map(timer => timer.delay), [0]);
assert.equal(presentationCalls, 0);
reducedPlatform.fireNext();
const reducedResult = await reducedPending;
assert.equal(reducedResult.status, 'submitted');
assert.equal(reducedResult.delayMs, 0);
assert.deepEqual(reducedResult.intent.payload, { cell: 0, size: 'small' });
assert.equal(reducedResult.result.snapshot.board['0'].small, 'blue');
reducedProducer.dispose();
reducedRegistry.dispose('computer-turn-reduced-test-complete');

// A stale callback must never submit. Change the authoritative turn/revision while
// the old thinking timer is pending, then fire that old timer: it re-snapshots and
// cancels instead of applying the preselected bot move.
nowMs = 3_000;
const stalePlatform = fakeTimerPlatform();
const staleRegistry = createResourceRegistry({ platform: stalePlatform });
const staleAuthority = createLocalAuthorityAdapter({
  initialState: computerTurnState({ revision: 30, deadlineAtMs: 40_000 }),
  isOnlineSeatType,
  clock: () => nowMs,
});
const staleProducer = createComputerTurnProducer({
  authority: staleAuthority,
  isComputerSeatType,
  resourceRegistry: staleRegistry,
  strategyRandom: () => 0,
  presentationRandom: () => 0.5,
  clock: () => nowMs,
});
const stalePending = staleProducer.playCurrentTurn();
await Promise.resolve();
await Promise.resolve();
assert.equal(stalePlatform.pending().length, 1);
const externalMove = createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  origin: GAMEPLAY_INTENT_ORIGINS.BOT,
  seat: 'back',
  revision: 30,
  payload: { cell: 8, size: 'large' },
  source: GAMEPLAY_PRESENTATION_SOURCES.NONE,
  adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
});
const externalAccepted = await staleAuthority.submit(externalMove);
assert.equal(externalAccepted.revision, 31);
assert.equal(externalAccepted.snapshot.activeSeatId, 'right');
stalePlatform.fireNext();
const staleResult = await stalePending;
assert.equal(staleResult.status, 'stale');
assert.equal(staleResult.submitted, false);
assert.equal(staleResult.reason, 'turn-or-revision-changed');
const afterStale = await staleAuthority.snapshot();
assert.equal(afterStale.revision, 31);
assert.equal(afterStale.board['8'].large, 'blue');
assert.deepEqual(afterStale.board['0'], {}, 'old bot callback did not submit its chosen cell');
staleProducer.dispose();
staleRegistry.dispose('computer-turn-stale-test-complete');

// Explicit cancellation owns/removes the registry timer and leaves authority state
// untouched. This is used when presentation/session lifecycle is torn down.
nowMs = 4_000;
const cancelPlatform = fakeTimerPlatform();
const cancelRegistry = createResourceRegistry({ platform: cancelPlatform });
const cancelAuthority = createLocalAuthorityAdapter({
  initialState: computerTurnState({ revision: 40, deadlineAtMs: 50_000 }),
  isOnlineSeatType,
  clock: () => nowMs,
});
const cancelProducer = createComputerTurnProducer({
  authority: cancelAuthority,
  isComputerSeatType,
  resourceRegistry: cancelRegistry,
  strategyRandom: () => 0.2,
  presentationRandom: () => 0.2,
  clock: () => nowMs,
});
const cancelPending = cancelProducer.playCurrentTurn();
await Promise.resolve();
await Promise.resolve();
assert.equal(cancelPlatform.pending().length, 1);
assert.equal(cancelProducer.cancelPending('turn-changed'), true);
assert.equal(cancelPlatform.pending().length, 0);
const cancelled = await cancelPending;
assert.equal(cancelled.status, 'cancelled');
assert.equal(cancelled.reason, 'turn-changed');
assert.equal((await cancelAuthority.snapshot()).revision, 40);
cancelProducer.dispose();
cancelRegistry.dispose('computer-turn-cancel-test-complete');

console.log('THREEJS-058 computer turn contract: PASS');
