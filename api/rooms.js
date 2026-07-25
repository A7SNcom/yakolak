import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@tursodatabase/serverless/compat';
import {
  applyOnlineMove,
  availableOnlineColors,
  createOnlineState,
  joinOnlineState,
  leaveOnlineState,
  requestOnlineRematch,
  validOnlineColor,
  validOnlinePlayerCount
} from '../src/online-rules-v114.js';

const TABLE = 'yakolak_online_rooms_v2';
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
      auth_json TEXT NOT NULL,
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

function authEntries(row) {
  try {
    const parsed = JSON.parse(String(row.auth_json || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function seatFor(row, token) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const hash = tokenHash(token);
  return authEntries(row).find(entry => entry.hash === hash)?.seat || null;
}

async function readRoom(db, code) {
  const result = await db.execute({
    sql: `SELECT * FROM ${TABLE} WHERE room_code = ? AND expires_at > ? LIMIT 1`,
    args: [code, new Date().toISOString()]
  });
  return result.rows?.[0] || null;
}

async function updateRoom(db, row, state, expectedVersion, auth = null) {
  const updatedAt = new Date().toISOString();
  const authValue = JSON.stringify(auth || authEntries(row));
  const result = await db.execute({
    sql: `
      UPDATE ${TABLE}
      SET auth_json = ?, state_json = ?, status = ?, version = version + 1, updated_at = ?, expires_at = ?
      WHERE room_code = ? AND version = ?
    `,
    args: [
      authValue,
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

async function createRoom(db, color, targetPlayers) {
  if (!validOnlineColor(color)) throw new Error('invalid_color');
  if (!validOnlinePlayerCount(targetPlayers)) throw new Error('invalid_player_count');
  const token = sessionToken();
  const seat = 'p1';
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = roomCode();
    const state = createOnlineState(color, targetPlayers);
    const auth = [{ seat, hash: tokenHash(token) }];
    try {
      await db.execute({
        sql: `
          INSERT INTO ${TABLE}
            (room_code, auth_json, state_json, version, status, created_at, updated_at, expires_at)
          VALUES (?, ?, ?, 1, 'waiting', ?, ?, ?)
        `,
        args: [code, JSON.stringify(auth), JSON.stringify(state), now, now, isoAfter(ROOM_TTL_MS)]
      });
      return { token, room: { code, version: 1, ...state }, seat };
    } catch (error) {
      if (!String(error?.message || '').toLowerCase().includes('unique')) throw error;
    }
  }
  throw new Error('room_code_exhausted');
}

async function joinRoom(db, code, color) {
  if (!validOnlineColor(color)) throw new Error('invalid_color');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await readRoom(db, code);
    if (!row) throw new Error('room_not_found');
    const state = JSON.parse(String(row.state_json));
    if (state.status !== 'waiting' || state.players.length >= state.targetPlayers) throw new Error('room_full');
    if (!availableOnlineColors(state).includes(color)) throw new Error('color_taken');
    const seat = ['p2', 'p3', 'p4'].find(candidate =>
      !state.players.some(player => player.seat === candidate)
    );
    if (!seat) throw new Error('room_full');
    const next = joinOnlineState(state, seat, color);
    const token = sessionToken();
    const auth = [...authEntries(row), { seat, hash: tokenHash(token) }];
    const now = new Date().toISOString();
    const result = await db.execute({
      sql: `
        UPDATE ${TABLE}
        SET auth_json = ?, state_json = ?, status = ?,
            version = version + 1, updated_at = ?, expires_at = ?
        WHERE room_code = ? AND version = ?
      `,
      args: [
        JSON.stringify(auth),
        JSON.stringify(next),
        next.status,
        now,
        isoAfter(ROOM_TTL_MS),
        code,
        Number(row.version)
      ]
    });
    if (Number(result.rowsAffected || 0) === 1) {
      return {
        token,
        seat,
        room: { code, version: Number(row.version) + 1, ...next }
      };
    }
  }
  throw new Error('version_conflict');
}

function lobbyPreview(row) {
  const state = JSON.parse(String(row.state_json));
  return {
    code: String(row.room_code),
    status: state.status,
    targetPlayers: state.targetPlayers,
    players: state.players.map(player => ({ seat: player.seat, color: player.color })),
    availableColors: availableOnlineColors(state)
  };
}

function statusFor(error) {
  const code = error?.message;
  if (code === 'payload_too_large') return 413;
  if (code === 'database_not_configured') return 503;
  if (code === 'room_not_found') return 404;
  if (code === 'unauthorized') return 401;
  if (code === 'not_your_turn' || code === 'room_full' || code === 'version_conflict' || code === 'color_taken') return 409;
  if (code === 'room_not_playing' || code === 'round_not_finished') return 409;
  if (code === 'invalid_color' || code === 'invalid_player_count' || code === 'invalid_move' || code === 'invalid_room_code' || code === 'invalid_payload') return 400;
  if (code === 'occupied_slot' || code === 'no_piece_remaining') return 409;
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

    let body;
    try {
      body = parseBody(req);
    } catch {
      throw new Error('invalid_payload');
    }
    const action = String(body.action || '');
    if (action === 'preview') {
      const code = normalizeCode(body.code);
      if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
      const row = await readRoom(db, code);
      if (!row) throw new Error('room_not_found');
      json(res, 200, { ok: true, room: lobbyPreview(row) });
      return;
    }
    if (action === 'create') {
      const result = await createRoom(db, String(body.color || ''), Number(body.targetPlayers));
      json(res, 201, { ok: true, ...result });
      return;
    }
    if (action === 'join') {
      const code = normalizeCode(body.code);
      if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
      const result = await joinRoom(db, code, String(body.color || ''));
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
    } else if (action === 'leave') {
      next = leaveOnlineState(state, seat);
    } else {
      json(res, 400, { ok: false, error: 'invalid_action' });
      return;
    }
    const auth = action === 'leave'
      ? authEntries(row).filter(entry => entry.seat !== seat)
      : null;
    const updated = await updateRoom(db, row, next, expectedVersion, auth);
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
