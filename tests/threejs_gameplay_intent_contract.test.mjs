import assert from 'node:assert/strict';
import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_INTENT_SCHEMA,
  GAMEPLAY_PRESENTATION_SOURCES,
  assertGameplayIntent,
  createGameplayIntent,
  gameplayRuleSemantics,
  parseGameplayIntent,
  serializeGameplayIntent,
  toRoomsApiSubmission,
} from '../web/app/gameplay/gameplay-intent.js';

const mutationId = 'threejs029_mutation_id_000000000001';
const humanSources = [
  GAMEPLAY_PRESENTATION_SOURCES.TAP,
  GAMEPLAY_PRESENTATION_SOURCES.CLICK,
  GAMEPLAY_PRESENTATION_SOURCES.DRAG_RELEASE,
  GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM,
  GAMEPLAY_PRESENTATION_SOURCES.GAMEPAD_CONFIRM,
];

function createLocalMove(source, origin = GAMEPLAY_INTENT_ORIGINS.HUMAN) {
  return createGameplayIntent({
    kind: GAMEPLAY_INTENT_KINDS.MOVE,
    origin,
    seat: 'seat-beta',
    revision: 17,
    payload: { cell: 4, size: 'medium' },
    source,
  });
}

function createNetworkMove(source, origin = GAMEPLAY_INTENT_ORIGINS.HUMAN) {
  return createGameplayIntent({
    kind: GAMEPLAY_INTENT_KINDS.MOVE,
    origin,
    seat: 'p2',
    revision: 17,
    mutationId,
    adapter: GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK,
    payload: { cell: 4, size: 'medium' },
    source,
  });
}

const baselineSemantics = gameplayRuleSemantics(createLocalMove(humanSources[0]));
for (const source of humanSources) {
  const intent = createLocalMove(source);
  assert.equal(intent.schema, GAMEPLAY_INTENT_SCHEMA);
  assert.deepEqual(gameplayRuleSemantics(intent), baselineSemantics, `${source} must not change rule semantics`);
}

const localBotMove = createLocalMove(GAMEPLAY_PRESENTATION_SOURCES.NONE, GAMEPLAY_INTENT_ORIGINS.BOT);
assert.deepEqual(gameplayRuleSemantics(localBotMove), baselineSemantics, 'bot action must use the same move semantics');
assert.deepEqual(localBotMove.authority, { adapter: 'local', seat: 'seat-beta', revision: 17 });
assert.equal(Object.hasOwn(localBotMove.authority, 'mutationId'), false, 'local authority carries no retry mutation id');

// The core schema deliberately treats seat/mutation IDs as opaque. Current
// protocol restrictions live in the current rooms adapter instead.
const opaqueNetworkIntent = createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  seat: 'future-seat-id',
  revision: 3,
  mutationId: 'future-mutation-id',
  adapter: GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK,
  payload: { cell: 1, size: 'small' },
  source: GAMEPLAY_PRESENTATION_SOURCES.CLICK,
});
assert.equal(opaqueNetworkIntent.authority.seat, 'future-seat-id');
assert.equal(opaqueNetworkIntent.authority.mutationId, 'future-mutation-id');

const networkMove = createNetworkMove(GAMEPLAY_PRESENTATION_SOURCES.DRAG_RELEASE);
assert.deepEqual(networkMove.authority, {
  adapter: 'network',
  seat: 'p2',
  revision: 17,
  mutationId,
});

const serialized = serializeGameplayIntent(networkMove);
assert.deepEqual(parseGameplayIntent(serialized), networkMove, 'canonical intent must survive JSON round-trip');
assert.throws(() => parseGameplayIntent('{bad json'), /invalid_serialized_gameplay_intent/);

const baselineWire = toRoomsApiSubmission(createNetworkMove(GAMEPLAY_PRESENTATION_SOURCES.TAP), {
  code: '42',
  sessionSeat: 'p2',
});
assert.deepEqual(baselineWire, {
  action: 'move',
  code: '42',
  version: 17,
  mutationId,
  cell: 4,
  size: 'medium',
});
for (const source of humanSources) {
  assert.deepEqual(
    toRoomsApiSubmission(createNetworkMove(source), { code: '42', sessionSeat: 'p2' }),
    baselineWire,
    `${source} must serialize to the same authoritative mutation`,
  );
}
assert.equal(Object.hasOwn(baselineWire, 'seat'), false, 'wire body must not claim seat ownership');
assert.equal(Object.hasOwn(baselineWire, 'presentation'), false, 'presentation metadata must never reach the authority wire payload');
assert.equal(Object.hasOwn(baselineWire, 'origin'), false, 'origin metadata must never change the rules/wire payload');

const timeout = createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.TIMEOUT,
  origin: GAMEPLAY_INTENT_ORIGINS.CLOCK,
  seat: 'seat-alpha',
  revision: 9,
  payload: {},
  source: GAMEPLAY_PRESENTATION_SOURCES.NONE,
});
const restart = createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.RESTART,
  seat: 'seat-alpha',
  revision: 9,
  payload: {},
  source: GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM,
});
const rematch = createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.REMATCH,
  seat: 'seat-alpha',
  revision: 9,
  payload: {},
  source: GAMEPLAY_PRESENTATION_SOURCES.GAMEPAD_CONFIRM,
});
for (const intent of [timeout, restart, rematch]) {
  assert.deepEqual(parseGameplayIntent(serializeGameplayIntent(intent)), intent);
}

const networkRematch = createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.REMATCH,
  seat: 'p1',
  revision: 9,
  mutationId: 'threejs029_rematch_id_0000000000001',
  adapter: GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK,
  payload: {},
  source: GAMEPLAY_PRESENTATION_SOURCES.CLICK,
});
assert.deepEqual(toRoomsApiSubmission(networkRematch, { code: '07', sessionSeat: 'p1' }), {
  action: 'rematch',
  code: '07',
  version: 9,
  mutationId: 'threejs029_rematch_id_0000000000001',
});

const networkTimeout = createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.TIMEOUT,
  origin: GAMEPLAY_INTENT_ORIGINS.CLOCK,
  seat: 'p1',
  revision: 9,
  mutationId: 'threejs029_timeout_id_0000000000001',
  adapter: GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK,
  payload: {},
  source: GAMEPLAY_PRESENTATION_SOURCES.NONE,
});
assert.throws(
  () => toRoomsApiSubmission(networkTimeout, { code: '07', sessionSeat: 'p1' }),
  /online_timeout_authority_unsupported/,
);

const networkRestart = createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.RESTART,
  seat: 'p1',
  revision: 9,
  mutationId: 'threejs029_restart_id_0000000000001',
  adapter: GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK,
  payload: {},
  source: GAMEPLAY_PRESENTATION_SOURCES.TAP,
});
assert.throws(
  () => toRoomsApiSubmission(networkRestart, { code: '07', sessionSeat: 'p1' }),
  /online_restart_authority_unsupported/,
);

const networkBot = createNetworkMove(GAMEPLAY_PRESENTATION_SOURCES.NONE, GAMEPLAY_INTENT_ORIGINS.BOT);
assert.throws(
  () => toRoomsApiSubmission(networkBot, { code: '42', sessionSeat: 'p2' }),
  /online_bot_authority_unsupported/,
);

assert.throws(
  () => toRoomsApiSubmission(networkMove, { code: '42', sessionSeat: 'p3' }),
  /intent_seat_mismatch/,
  'authenticated network seat must match canonical intent seat',
);
assert.throws(
  () => toRoomsApiSubmission(opaqueNetworkIntent, { code: '42', sessionSeat: 'p1' }),
  /intent_seat_mismatch|current_rooms_invalid_mutation_id/,
  'current protocol restrictions are adapter-owned, not schema-owned',
);
assert.throws(() => createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  seat: '',
  revision: 1,
  payload: { cell: 1, size: 'small' },
  source: GAMEPLAY_PRESENTATION_SOURCES.TAP,
}), /invalid_intent_seat/);
assert.throws(() => createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  seat: 'p1',
  revision: -1,
  payload: { cell: 1, size: 'small' },
  source: GAMEPLAY_PRESENTATION_SOURCES.TAP,
}), /invalid_intent_revision/);
assert.throws(() => createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  seat: 'p1',
  revision: 1,
  mutationId: '',
  adapter: GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK,
  payload: { cell: 1, size: 'small' },
  source: GAMEPLAY_PRESENTATION_SOURCES.TAP,
}), /invalid_intent_mutation_id|invalid_intent_authority_shape/);
assert.throws(() => createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  seat: 'p1',
  revision: 1,
  payload: { cell: 1, size: 'small', pointerX: 99 },
  source: GAMEPLAY_PRESENTATION_SOURCES.DRAG_RELEASE,
}), /invalid_move_intent_payload/, 'device coordinates must not leak into rule payload');

const polluted = JSON.parse(serializeGameplayIntent(createLocalMove(GAMEPLAY_PRESENTATION_SOURCES.CLICK)));
polluted.presentation.pointerType = 'mouse';
assert.throws(() => assertGameplayIntent(polluted), /invalid_intent_presentation_shape/);

console.log('THREEJS-029 gameplay intent contract: PASS');
