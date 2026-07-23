import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@tursodatabase/serverless/compat';
import {
  applyOnlineMove,
  createOnlineState,
  joinOnlineState,
  nextOnlineColor,
  requestOnlineRematch,
  validOnlineColor
} from '../src/online-rules-v114.js';

const TABLE = 'yakolak_online_rooms_v1';
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 8_000;
const ROOM_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,96}$/;
let client;
let tableReady;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.end(payload == null ? '' : JSON.stringify(payload));
}

function getClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return null;
  client ||= createClient({ url, authToken });
  return client;
}

async function ensureTable(db) {
  tableReady ||= db.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      room_code TEXT PRIMARY KEY,
      host_token_hash TEXT NOT NULL,
      guest_token_hash TEXT,
      state_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);
  await tableReady;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  if (!raw) return {};
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new Error('payload_too_large');
  return JSON.parse(raw);
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function roomCode() {
  const bytes = randomBytes(6);
  return Array.from(bytes, byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
}

function sessionToken() {
  return randomBytes(32).toString('base64url');
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.replace(/^Bearer\s+/i, '').trim();
}

function isoAfter(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function publicRoom(row, state = null) {
  const parsed = state || JSON.parse(String(row.state_json));
  return {
    code: String(row.room_code),
    version: Number(row.version),
    ...parsed
  };
}

function seatFor(row, token) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const hash = tokenHash(token);
  if (hash === String(row.host_token_hash)) return 'host';
  if (row.guest_token_hash && hash === String(row.guest_token_hash)) return 'guest';
  return null;
}

async function readRoom(db, code) {
  const result = await db.execute({
    sql: `SELECT * FROM ${TABLE} WHERE room_code = ? AND expires_at > ? LIMIT 1`,
    args: [code, new Date().toISOString()]
  });
  return result.rows?.[0] || null;
}

async function updateRoom(db, row, state, expectedVersion) {
  const updatedAt = new Date().toISOString();
  const result = await db.execute({
    sql: `
      UPDATE ${TABLE}
      SET state_json = ?, status = ?, version = version + 1, updated_at = ?, expires_at = ?
      WHERE room_code = ? AND version = ?
    `,
    args: [
      JSON.stringify(state),
      state.status,
      updatedAt,
      isoAfter(ROOM_TTL_MS),
      String(row.room_code),
      expectedVersion
    ]
  });
  if (Number(result.rowsAffected || 0) !== 1) throw new Error('version_conflict');
  return { ...row, version: expectedVersion + 1, state_json: JSON.stringify(state), status: state.status };
}

async function createRoom(db, color) {
  if (!validOnlineColor(color)) throw new Error('invalid_color');
  const token = sessionToken();
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = roomCode();
    const state = createOnlineState(color);
    try {
      await db.execute({
        sql: `
          INSERT INTO ${TABLE}
            (room_code, host_token_hash, state_json, version, status, created_at, updated_at, expires_at)
          VALUES (?, ?, ?, 1, 'waiting', ?, ?, ?)
        `,
        args: [code, tokenHash(token), JSON.stringify(state), now, now, isoAfter(ROOM_TTL_MS)]
      });
      return { token, room: { code, version: 1, ...state }, seat: 'host' };
    } catch (error) {
      if (!String(error?.message || '').toLowerCase().includes('unique')) throw error;
    }
  }
  throw new Error('room_code_exhausted');
}

async function joinRoom(db, code) {
  const row = await readRoom(db, code);
  if (!row) throw new Error('room_not_found');
  if (row.guest_token_hash) throw new Error('room_full');
  const state = JSON.parse(String(row.state_json));
  const guestColor = nextOnlineColor(state.players[0]?.color);
  const next = joinOnlineState(state, guestColor);
  const token = sessionToken();
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `
      UPDATE ${TABLE}
      SET guest_token_hash = ?, state_json = ?, status = 'playing',
          version = version + 1, updated_at = ?, expires_at = ?
      WHERE room_code = ? AND version = ? AND guest_token_hash IS NULL
    `,
    args: [tokenHash(token), JSON.stringify(next), now, isoAfter(ROOM_TTL_MS), code, Number(row.version)]
  });
  if (Number(result.rowsAffected || 0) !== 1) throw new Error('room_full');
  return {
    token,
    seat: 'guest',
    room: { code, version: Number(row.version) + 1, ...next }
  };
}

function statusFor(error) {
  const code = error?.message;
  if (code === 'payload_too_large') return 413;
  if (code === 'database_not_configured') return 503;
  if (code === 'room_not_found') return 404;
  if (code === 'unauthorized') return 401;
  if (code === 'not_your_turn' || code === 'room_full' || code === 'version_conflict') return 409;
  if (code === 'room_not_playing' || code === 'round_not_finished') return 409;
  if (code === 'invalid_color' || code === 'invalid_move' || code === 'invalid_room_code') return 400;
  if (code === 'occupied_slot') return 409;
  return 500;
}

export default async function handler(req, res) {
  res.setHeader('allow', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const db = getClient();
  if (!db) {
    json(res, 503, { ok: false, error: 'online_unavailable' });
    return;
  }

  try {
    await ensureTable(db);

    if (req.method === 'GET') {
      const code = normalizeCode(req.query?.code);
      if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
      const row = await readRoom(db, code);
      if (!row) throw new Error('room_not_found');
      const seat = seatFor(row, bearer(req));
      if (!seat) throw new Error('unauthorized');
      const since = Number(req.query?.since || 0);
      if (since === Number(row.version)) {
        res.statusCode = 204;
        res.setHeader('cache-control', 'no-store, max-age=0');
        res.end();
        return;
      }
      json(res, 200, { ok: true, seat, room: publicRoom(row) });
      return;
    }

    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || '');
    if (action === 'create') {
      const result = await createRoom(db, String(body.color || ''));
      json(res, 201, { ok: true, ...result });
      return;
    }
    if (action === 'join') {
      const code = normalizeCode(body.code);
      if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
      const result = await joinRoom(db, code);
      json(res, 200, { ok: true, ...result });
      return;
    }

    const code = normalizeCode(body.code);
    if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
    const row = await readRoom(db, code);
    if (!row) throw new Error('room_not_found');
    const seat = seatFor(row, bearer(req));
    if (!seat) throw new Error('unauthorized');
    const expectedVersion = Number(body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(row.version)) {
      json(res, 409, { ok: false, error: 'version_conflict', room: publicRoom(row) });
      return;
    }

    const state = JSON.parse(String(row.state_json));
    let next;
    if (action === 'move') {
      next = applyOnlineMove(state, seat, {
        zone: Number(body.zone),
        size: String(body.size || '')
      });
    } else if (action === 'rematch') {
      next = requestOnlineRematch(state, seat);
    } else {
      json(res, 400, { ok: false, error: 'invalid_action' });
      return;
    }
    const updated = await updateRoom(db, row, next, expectedVersion);
    json(res, 200, { ok: true, seat, room: publicRoom(updated, next) });
  } catch (error) {
    const status = statusFor(error);
    if (status >= 500) console.error('[Yakolak] online room request failed', error);
    json(res, status, {
      ok: false,
      error: status >= 500 ? 'online_server_error' : error.message
    });
  }
}
