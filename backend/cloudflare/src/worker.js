import { createClient } from '@tursodatabase/serverless/compat';
import { COLORS, RULES, SIZES } from '../../../api/game-rules.js';

const PROBE_TABLE = 'yakolak_pages005_room_probe_v1';
const PAGES_ORIGIN = 'https://a7sncom.github.io';
const PROBE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 8_000;
const ROOM_ID_PATTERN = /^p005-[a-f0-9]{32}$/;

function createTursoStore(env) {
  if (!env?.TURSO_DATABASE_URL || !env?.TURSO_AUTH_TOKEN) {
    throw new Error('datastore_unavailable');
  }

  const db = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  return {
    async ensureTable() {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (
          room_id TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          integrity TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    },

    async writeRoom({ roomId, payload, integrity, now }) {
      await db.execute({
        sql: `INSERT INTO ${PROBE_TABLE} (room_id, payload_json, integrity, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(room_id) DO UPDATE SET
                payload_json = excluded.payload_json,
                integrity = excluded.integrity,
                updated_at = excluded.updated_at`,
        args: [roomId, JSON.stringify(payload), integrity, now, now],
      });
    },

    async readRoom(roomId) {
      const result = await db.execute({
        sql: `SELECT room_id, payload_json, integrity, created_at, updated_at
              FROM ${PROBE_TABLE} WHERE room_id = ? LIMIT 1`,
        args: [roomId],
      });
      const row = result.rows?.[0];
      if (!row) return null;
      return {
        roomId: String(row.room_id),
        payload: JSON.parse(String(row.payload_json)),
        integrity: String(row.integrity),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      };
    },

    async cleanup(beforeIso) {
      const result = await db.execute({
        sql: `DELETE FROM ${PROBE_TABLE} WHERE updated_at < ?`,
        args: [beforeIso],
      });
      return Number(result.rowsAffected || 0);
    },
  };
}

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
    headers.set('access-control-allow-headers', 'authorization, content-type');
    headers.set('access-control-max-age', '600');
  }
  return headers;
}

function responseJson(request, status, payload) {
  const headers = corsHeaders(request);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { status, headers });
}

async function readLimitedJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('payload_too_large');
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
      throw new Error('payload_too_large');
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

function errorStatus(error) {
  if (error?.message === 'payload_too_large') return 413;
  if (error?.message === 'room_not_found') return 404;
  if (error?.message === 'invalid_room_id' || error?.message === 'invalid_payload') return 400;
  if (error?.message === 'origin_not_allowed') return 403;
  if (error?.message === 'datastore_unavailable') return 503;
  return 500;
}

function logError(kind, error) {
  console.error(JSON.stringify({
    service: 'yakolak-room-api',
    kind,
    error: String(error?.message || error),
  }));
}

export function createWorker({ createStore = createTursoStore } = {}) {
  return {
    async fetch(request, env) {
      const origin = request.headers.get('origin') || '';
      if (!isAllowedOrigin(origin)) {
        return responseJson(request, 403, { ok: false, error: 'origin_not_allowed' });
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }

      const url = new URL(request.url);
      try {
        const store = createStore(env);

        if (request.method === 'GET' && url.pathname === '/health') {
          await store.ensureTable();
          return responseJson(request, 200, {
            ok: true,
            provider: 'cloudflare-workers',
            datastore: 'turso',
            sharedRules: {
              cellCount: Number(RULES.cellCount),
              colors: [...COLORS],
              sizes: [...SIZES],
            },
            crypto: 'web-crypto',
          });
        }

        if (request.method === 'POST' && url.pathname === '/__pages005/rooms') {
          let body;
          try {
            body = await readLimitedJson(request);
          } catch (error) {
            if (error?.message === 'payload_too_large') throw error;
            throw new Error('invalid_payload');
          }
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_payload');

          const roomId = body.roomId ? String(body.roomId) : createRoomId();
          if (!ROOM_ID_PATTERN.test(roomId)) throw new Error('invalid_room_id');
          const payload = Object.hasOwn(body, 'payload') ? body.payload : { probe: true };
          const integrity = await sha256Hex(JSON.stringify(payload));
          const now = new Date().toISOString();

          await store.ensureTable();
          await store.writeRoom({ roomId, payload, integrity, now });
          const room = await store.readRoom(roomId);
          return responseJson(request, 201, { ok: true, room });
        }

        const readMatch = url.pathname.match(/^\/__pages005\/rooms\/(p005-[a-f0-9]{32})$/);
        if (request.method === 'GET' && readMatch) {
          await store.ensureTable();
          const room = await store.readRoom(readMatch[1]);
          if (!room) throw new Error('room_not_found');
          return responseJson(request, 200, { ok: true, room });
        }

        return responseJson(request, 404, { ok: false, error: 'not_found' });
      } catch (error) {
        const status = errorStatus(error);
        if (status >= 500) logError('request_failed', error);
        return responseJson(request, status, {
          ok: false,
          error: status >= 500 ? 'online_server_error' : String(error.message),
        });
      }
    },

    async scheduled(controller, env) {
      try {
        const store = createStore(env);
        await store.ensureTable();
        const beforeIso = new Date(Number(controller.scheduledTime || Date.now()) - PROBE_TTL_MS).toISOString();
        const deleted = await store.cleanup(beforeIso);
        console.log(JSON.stringify({ service: 'yakolak-room-api', kind: 'scheduled_cleanup', deleted }));
      } catch (error) {
        logError('scheduled_cleanup_failed', error);
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
