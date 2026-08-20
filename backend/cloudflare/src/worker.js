import { COLORS, RULES, SIZES } from '../../../api/game-rules.js';
import {
  AUTHORITATIVE_OPERATION_NAMES,
  applyAuthoritativeMutation,
  authoritativeApiIdentity,
  createRequestContext,
  extractSeatCredential,
  mutationFingerprintSource,
  normalizeApiError,
  normalizeAuthoritativeRoomId,
  normalizeMutationEnvelope,
} from './authoritative-api.js';
import {
  normalizeAllocateInvitationEnvelope,
  normalizeRevokeInvitationEnvelope,
  publicInvitationView,
} from './authoritative-invitation-namespace.js';
import {
  createConfigureLobbyTransaction,
  normalizeConfigureLobbyEnvelope,
} from './authoritative-lobby-config.js';
import {
  PROBE_TABLE,
  assertAuthoritativeStore,
  createTursoAuthoritativeStore,
} from './authoritative-store.js';
import { withCompatibility } from './compatibility.js';

const PAGES_ORIGIN = 'https://a7sncom.github.io';
const PROBE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 8_000;
const ROOM_ID_PATTERN = /^p005-[a-f0-9]{32}$/;

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin === PAGES_ORIGIN) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const headers = new Headers({
    'cache-control': 'no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'vary': 'Origin',
  });
  if (origin && isAllowedOrigin(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    headers.set('access-control-allow-headers', 'authorization, content-type, x-request-id, x-trace-id, traceparent');
    headers.set('access-control-expose-headers', 'x-request-id, x-trace-id');
    headers.set('access-control-max-age', '600');
  }
  return headers;
}

function responseJson(request, status, payload, requestContext = null) {
  const headers = corsHeaders(request);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (requestContext) {
    headers.set('x-request-id', requestContext.requestId);
    headers.set('x-trace-id', requestContext.traceId);
  }
  const body = requestContext
    ? { ...payload, request: { ...requestContext } }
    : payload;
  return new Response(JSON.stringify(body), { status, headers });
}

async function readLimitedJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) {
    const error = new Error('payload_too_large');
    error.code = 'payload_too_large';
    throw error;
  }
  if (!request.body) return {};

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel('payload_too_large');
      const error = new Error('payload_too_large');
      error.code = 'payload_too_large';
      throw error;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (!bytes.byteLength) return {};
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function createRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `p005-${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function codedError(code, safeDetails = null) {
  const error = new Error(code);
  error.code = code;
  if (safeDetails !== null) error.safeDetails = safeDetails;
  return error;
}

function logError(kind, publicErrorCode, requestContext = null) {
  console.error(JSON.stringify({
    service: 'yakolak-room-api',
    kind,
    requestId: requestContext?.requestId || null,
    traceId: requestContext?.traceId || null,
    error: String(publicErrorCode || 'online_server_error'),
  }));
}

function shellPayload(store, env, payload) {
  return withCompatibility({
    ...payload,
    authoritativeApi: authoritativeApiIdentity(store.getCapabilities()),
  }, env);
}

function errorResponse(request, error, requestContext) {
  const normalized = normalizeApiError(error);
  if (normalized.status >= 500) logError('request_failed', normalized.code, requestContext);
  return responseJson(request, normalized.status, {
    ok: false,
    error: normalized.code,
    errorDetail: {
      code: normalized.code,
      retryable: normalized.retryable,
      details: normalized.details,
    },
  }, requestContext);
}

function authorizeRoomRequest(request, store, roomId) {
  return (async () => {
    const credentialHash = await sha256Hex(extractSeatCredential(request));
    return store.authorizeSeat({ roomId, credentialHash });
  })();
}

function publicMutationReceipt(committed, actorSeatId) {
  if (committed?.receipt?.mutationId) return committed.receipt;
  return {
    mutationId: committed.receipt.idempotencyKey,
    action: committed.receipt.operation,
    actorSeatId,
    revision: committed.receipt.revision,
  };
}

export function createWorker({
  createStore = createTursoAuthoritativeStore,
  randomUUID = () => crypto.randomUUID(),
} = {}) {
  return {
    async fetch(request, env) {
      const requestContext = createRequestContext(request, { randomUUID });
      const origin = request.headers.get('origin') || '';
      if (!isAllowedOrigin(origin)) {
        return errorResponse(request, codedError('origin_not_allowed'), requestContext);
      }

      if (request.method === 'OPTIONS') {
        const headers = corsHeaders(request);
        headers.set('x-request-id', requestContext.requestId);
        headers.set('x-trace-id', requestContext.traceId);
        return new Response(null, { status: 204, headers });
      }

      const url = new URL(request.url);
      try {
        const store = assertAuthoritativeStore(createStore(env));

        if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/v1/health')) {
          await store.ensureTable();
          return responseJson(request, 200, shellPayload(store, env, {
            ok: true,
            provider: 'cloudflare-workers',
            datastore: 'turso',
            sharedRules: {
              cellCount: Number(RULES.cellCount),
              colors: [...COLORS],
              sizes: [...SIZES],
            },
            crypto: 'web-crypto',
          }), requestContext);
        }

        if (request.method === 'POST' && url.pathname === '/__pages005/rooms') {
          let body;
          try {
            body = await readLimitedJson(request);
          } catch (error) {
            if (error?.code === 'payload_too_large' || error?.message === 'payload_too_large') throw error;
            throw codedError('invalid_payload');
          }
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw codedError('invalid_payload');

          const roomId = body.roomId ? String(body.roomId) : createRoomId();
          if (!ROOM_ID_PATTERN.test(roomId)) throw codedError('invalid_room_id');
          const payload = Object.hasOwn(body, 'payload') ? body.payload : { probe: true };
          const integrity = await sha256Hex(JSON.stringify(payload));
          const now = new Date().toISOString();

          await store.ensureTable();
          await store.writeRoom({ roomId, payload, integrity, now });
          const room = await store.readRoom(roomId);
          return responseJson(request, 201, shellPayload(store, env, { ok: true, room }), requestContext);
        }

        const probeReadMatch = url.pathname.match(/^\/__pages005\/rooms\/(p005-[a-f0-9]{32})$/);
        if (request.method === 'GET' && probeReadMatch) {
          await store.ensureTable();
          const room = await store.readRoom(probeReadMatch[1]);
          if (!room) throw codedError('room_not_found');
          return responseJson(request, 200, shellPayload(store, env, { ok: true, room }), requestContext);
        }

        const invitationMatch = url.pathname.match(/^\/v1\/invitations\/(\d{2})$/);
        if (request.method === 'GET' && invitationMatch) {
          const invitation = await store.lookupInvitation({ locator: invitationMatch[1] });
          if (!invitation) throw codedError('invitation_not_found');
          return responseJson(request, 200, shellPayload(store, env, {
            ok: true,
            invitation: publicInvitationView(invitation),
          }), requestContext);
        }

        const snapshotMatch = url.pathname.match(/^\/v1\/rooms\/(\d{2})\/snapshot$/);
        if (request.method === 'GET' && snapshotMatch) {
          const roomId = normalizeAuthoritativeRoomId(snapshotMatch[1]);
          const authorized = await authorizeRoomRequest(request, store, roomId);
          return responseJson(request, 200, shellPayload(store, env, {
            ok: true,
            actor: {
              seatId: authorized.seatId,
              credentialGeneration: authorized.credentialGeneration,
            },
            snapshot: authorized.snapshot,
          }), requestContext);
        }

        const mutationMatch = url.pathname.match(/^\/v1\/rooms\/(\d{2})\/mutations$/);
        if (request.method === 'POST' && mutationMatch) {
          let body;
          try {
            body = await readLimitedJson(request);
          } catch (error) {
            if (error?.code === 'payload_too_large' || error?.message === 'payload_too_large') throw error;
            throw codedError('invalid_payload');
          }
          const roomId = normalizeAuthoritativeRoomId(mutationMatch[1]);
          const action = body?.action;
          const isConfigureLobby = action === AUTHORITATIVE_OPERATION_NAMES.CONFIGURE_LOBBY;
          const isAllocateInvitation = action === AUTHORITATIVE_OPERATION_NAMES.ALLOCATE_INVITATION;
          const isRevokeInvitation = action === AUTHORITATIVE_OPERATION_NAMES.REVOKE_INVITATION;
          const envelope = isConfigureLobby
            ? normalizeConfigureLobbyEnvelope(body)
            : isAllocateInvitation
              ? normalizeAllocateInvitationEnvelope(body)
              : isRevokeInvitation
                ? normalizeRevokeInvitationEnvelope(body)
                : normalizeMutationEnvelope(body);
          const authorized = await authorizeRoomRequest(request, store, roomId);
          const fingerprint = await sha256Hex(mutationFingerprintSource(roomId, authorized.seatId, envelope));

          let committed;
          if (isConfigureLobby) {
            committed = await store.transactAuthority(createConfigureLobbyTransaction({
              roomId,
              actorSeatId: authorized.seatId,
              credentialGeneration: authorized.credentialGeneration,
              expectedRevision: envelope.expectedRevision,
              mutationId: envelope.mutationId,
              fingerprint,
              configuration: envelope.payload,
            }));
          } else if (isAllocateInvitation) {
            committed = await store.allocateInvitation({
              roomId,
              actorSeatId: authorized.seatId,
              credentialGeneration: authorized.credentialGeneration,
              expectedRevision: envelope.expectedRevision,
              mutationId: envelope.mutationId,
              fingerprint,
              invitationId: randomUUID(),
              seatId: envelope.payload.seatId,
            });
          } else if (isRevokeInvitation) {
            committed = await store.revokeInvitation({
              roomId,
              actorSeatId: authorized.seatId,
              credentialGeneration: authorized.credentialGeneration,
              expectedRevision: envelope.expectedRevision,
              mutationId: envelope.mutationId,
              fingerprint,
              invitationId: envelope.payload.invitationId,
            });
          } else {
            committed = await store.commitMutation({
              roomId,
              actorSeatId: authorized.seatId,
              credentialGeneration: authorized.credentialGeneration,
              expectedRevision: envelope.expectedRevision,
              mutationId: envelope.mutationId,
              fingerprint,
              action: envelope.action,
              transition: state => applyAuthoritativeMutation(state, authorized.seatId, envelope),
            });
          }

          return responseJson(request, 200, shellPayload(store, env, {
            ok: true,
            actor: {
              seatId: authorized.seatId,
              credentialGeneration: authorized.credentialGeneration,
            },
            mutation: {
              status: committed.status,
              receipt: publicMutationReceipt(committed, authorized.seatId),
            },
            snapshot: committed.snapshot,
            ...(committed.invitation ? { invitation: publicInvitationView(committed.invitation) } : {}),
          }), requestContext);
        }

        return responseJson(request, 404, {
          ok: false,
          error: 'not_found',
          errorDetail: { code: 'not_found', retryable: false, details: null },
        }, requestContext);
      } catch (error) {
        return errorResponse(request, error, requestContext);
      }
    },

    async scheduled(controller, env) {
      try {
        const store = assertAuthoritativeStore(createStore(env));
        await store.ensureTable();
        const beforeIso = new Date(Number(controller.scheduledTime || Date.now()) - PROBE_TTL_MS).toISOString();
        const deleted = await store.cleanup(beforeIso);
        console.log(JSON.stringify({ service: 'yakolak-room-api', kind: 'scheduled_cleanup', deleted }));
      } catch (error) {
        const normalized = normalizeApiError(error);
        logError('scheduled_cleanup_failed', normalized.code);
        throw error;
      }
    },
  };
}

export const __testing = {
  MAX_BODY_BYTES,
  PAGES_ORIGIN,
  PROBE_TABLE,
  ROOM_ID_PATTERN,
  createRoomId,
  isAllowedOrigin,
  readLimitedJson,
  sha256Hex,
};

export default createWorker();
