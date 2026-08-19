export const GAMEPLAY_INTENT_SCHEMA = 'yakolak.gameplay-intent/v1';

export const GAMEPLAY_INTENT_KINDS = Object.freeze({
  MOVE: 'move',
  TIMEOUT: 'timeout',
  RESTART: 'restart',
  REMATCH: 'rematch',
});

export const GAMEPLAY_INTENT_ORIGINS = Object.freeze({
  HUMAN: 'human',
  BOT: 'bot',
  CLOCK: 'clock',
  SYSTEM: 'system',
});

export const GAMEPLAY_PRESENTATION_SOURCES = Object.freeze({
  TAP: 'tap',
  CLICK: 'click',
  DRAG_RELEASE: 'drag-release',
  KEYBOARD_CONFIRM: 'keyboard-confirm',
  GAMEPAD_CONFIRM: 'gamepad-confirm',
  NONE: 'none',
});

export const GAMEPLAY_AUTHORITY_ADAPTERS = Object.freeze({
  LOCAL: 'local',
  NETWORK: 'network',
});

const INTENT_KINDS = new Set(Object.values(GAMEPLAY_INTENT_KINDS));
const INTENT_ORIGINS = new Set(Object.values(GAMEPLAY_INTENT_ORIGINS));
const PRESENTATION_SOURCES = new Set(Object.values(GAMEPLAY_PRESENTATION_SOURCES));
const AUTHORITY_ADAPTERS = new Set(Object.values(GAMEPLAY_AUTHORITY_ADAPTERS));

// These patterns belong only to the currently deployed protocol-5 rooms API.
// They are intentionally NOT part of the engine-neutral intent schema because
// later authority tasks own stable seat and mutation envelope decisions.
const CURRENT_ROOMS_SEAT_PATTERN = /^p[1-4]$/;
const CURRENT_ROOMS_MUTATION_ID_PATTERN = /^[A-Za-z0-9_-]{32,96}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, code) {
  if (!isRecord(value)) fail(code);
  return value;
}

function requireExactKeys(value, expected, code) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function requireOpaqueId(value, code) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) fail(code);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail('intent_not_serializable');
  }
}

function validateAuthority(authority) {
  requireRecord(authority, 'invalid_intent_authority');
  if (!AUTHORITY_ADAPTERS.has(authority.adapter)) fail('invalid_authority_adapter');
  requireOpaqueId(authority.seat, 'invalid_intent_seat');
  if (!Number.isInteger(authority.revision) || authority.revision < 0) fail('invalid_intent_revision');

  if (authority.adapter === GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK) {
    requireExactKeys(authority, ['adapter', 'seat', 'revision', 'mutationId'], 'invalid_intent_authority_shape');
    requireOpaqueId(authority.mutationId, 'invalid_intent_mutation_id');
  } else {
    requireExactKeys(authority, ['adapter', 'seat', 'revision'], 'invalid_intent_authority_shape');
  }
}

function validatePayload(kind, payload) {
  requireRecord(payload, 'invalid_intent_payload');
  if (kind === GAMEPLAY_INTENT_KINDS.MOVE) {
    requireExactKeys(payload, ['cell', 'size'], 'invalid_move_intent_payload');
    if (!Number.isInteger(payload.cell) || payload.cell < 0) fail('invalid_move_intent_cell');
    if (typeof payload.size !== 'string' || !payload.size) fail('invalid_move_intent_size');
    return;
  }
  requireExactKeys(payload, [], 'invalid_control_intent_payload');
}

function validatePresentation(presentation) {
  requireRecord(presentation, 'invalid_intent_presentation');
  requireExactKeys(presentation, ['source'], 'invalid_intent_presentation_shape');
  if (!PRESENTATION_SOURCES.has(presentation.source)) fail('invalid_intent_presentation_source');
}

export function assertGameplayIntent(intent) {
  requireRecord(intent, 'invalid_gameplay_intent');
  requireExactKeys(intent, ['schema', 'kind', 'origin', 'authority', 'payload', 'presentation'], 'invalid_gameplay_intent_shape');
  if (intent.schema !== GAMEPLAY_INTENT_SCHEMA) fail('unsupported_gameplay_intent_schema');
  if (!INTENT_KINDS.has(intent.kind)) fail('invalid_gameplay_intent_kind');
  if (!INTENT_ORIGINS.has(intent.origin)) fail('invalid_gameplay_intent_origin');
  validateAuthority(intent.authority);
  validatePayload(intent.kind, intent.payload);
  validatePresentation(intent.presentation);
  return intent;
}

export function createGameplayIntent({
  kind,
  origin = GAMEPLAY_INTENT_ORIGINS.HUMAN,
  seat,
  revision,
  payload = {},
  source = GAMEPLAY_PRESENTATION_SOURCES.NONE,
  adapter = GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
  mutationId,
} = {}) {
  const authority = adapter === GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK
    ? { adapter, seat, revision, mutationId }
    : { adapter, seat, revision };

  const intent = cloneJson({
    schema: GAMEPLAY_INTENT_SCHEMA,
    kind,
    origin,
    authority,
    payload,
    presentation: { source },
  });
  assertGameplayIntent(intent);
  return deepFreeze(intent);
}

export function serializeGameplayIntent(intent) {
  assertGameplayIntent(intent);
  return JSON.stringify(intent);
}

export function parseGameplayIntent(serialized) {
  if (typeof serialized !== 'string' || !serialized) fail('invalid_serialized_gameplay_intent');
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    fail('invalid_serialized_gameplay_intent');
  }
  assertGameplayIntent(parsed);
  return deepFreeze(parsed);
}

// Only fields that can affect gameplay rules cross the rules boundary. Revision,
// retry identity, actor origin, transport adapter and input-device/source remain
// authority/presentation context so they cannot create a second rules path.
export function gameplayRuleSemantics(intent) {
  assertGameplayIntent(intent);
  return deepFreeze(cloneJson({
    kind: intent.kind,
    seat: intent.authority.seat,
    payload: intent.payload,
  }));
}

// Adapter for the currently deployed protocol-5 /api/rooms contract only.
// `sessionSeat` is the seat proven by the authenticated session. It must match
// the intent before seat is omitted from the body (the server derives it from
// bearer auth). Open timeout/restart/bot authority gaps fail closed here.
export function toRoomsApiSubmission(intent, { code, sessionSeat } = {}) {
  assertGameplayIntent(intent);
  if (intent.authority.adapter !== GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK) fail('network_authority_required');
  if (!CURRENT_ROOMS_SEAT_PATTERN.test(String(sessionSeat || ''))) fail('invalid_session_seat');
  if (sessionSeat !== intent.authority.seat) fail('intent_seat_mismatch');
  if (!CURRENT_ROOMS_MUTATION_ID_PATTERN.test(intent.authority.mutationId)) fail('current_rooms_invalid_mutation_id');
  if (typeof code !== 'string' || !/^\d{2}$/.test(code)) fail('invalid_room_code');

  if (intent.origin === GAMEPLAY_INTENT_ORIGINS.BOT) fail('online_bot_authority_unsupported');
  if (intent.kind === GAMEPLAY_INTENT_KINDS.TIMEOUT) fail('online_timeout_authority_unsupported');
  if (intent.kind === GAMEPLAY_INTENT_KINDS.RESTART) fail('online_restart_authority_unsupported');

  const base = {
    action: intent.kind,
    code,
    version: intent.authority.revision,
    mutationId: intent.authority.mutationId,
  };

  if (intent.kind === GAMEPLAY_INTENT_KINDS.MOVE) {
    return deepFreeze({ ...base, cell: intent.payload.cell, size: intent.payload.size });
  }
  if (intent.kind === GAMEPLAY_INTENT_KINDS.REMATCH) return deepFreeze(base);
  fail('unsupported_network_gameplay_intent');
}
