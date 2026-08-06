import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@tursodatabase/serverless/compat';

const TABLE = 'yakolak_online_rooms_v4';
const COLORS = ['marble', 'blue', 'gold', 'green'];
const SIZES = ['small', 'medium', 'large'];
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
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
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function isoAfter(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function validColor(value) {
  return COLORS.includes(String(value || ''));
}

function validPlayers(value) {
  return [2, 3, 4].includes(Number(value));
}

function validRounds(value) {
  return [3, 5].includes(Number(value));
}

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function countPieces(board, color, size) {
  return Object.values(board).filter(cell => cell?.[size] === color).length;
}

function winner(board, color) {
  for (const line of LINES) {
    for (const size of SIZES) {
      if (line.every(cell => board[String(cell)]?.[size] === color)) return true;
    }
    if (line.every((cell, index) => board[String(cell)]?.[SIZES[index]] === color)) return true;
    if (line.every((cell, index) => board[String(cell)]?.[SIZES[2 - index]] === color)) return true;
  }
  return Array.from({ length: 9 }, (_, index) => index).some(cell =>
    SIZES.every(size => board[String(cell)]?.[size] === color)
  );
}

function hasLegalMove(state, color) {
  for (const size of SIZES) {
    if (countPieces(state.board, color, size) >= 3) continue;
    for (let cell = 0; cell < 9; cell += 1) {
      if (!state.board[String(cell)]?.[size]) return true;
    }
  }
  return false;
}

function nextPlayablePlayer(state, fromIndex) {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (fromIndex + offset) % state.players.length;
    if (hasLegalMove(state, state.players[index].color)) return index;
  }
  return -1;
}

function createState(hostColor, targetPlayers, targetRounds) {
  if (!validColor(hostColor)) throw new Error('invalid_color');
  if (!validPlayers(targetPlayers)) throw new Error('invalid_player_count');
  if (!validRounds(targetRounds)) throw new Error('invalid_round_count');
  return {
    protocol: 4,
    status: 'waiting',
    targetPlayers: Number(targetPlayers),
    targetRounds: Number(targetRounds),
    players: [{ seat: 'p1', color: hostColor }],
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: { p1: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { p1: false }
  };
}

function joinState(state, seat, color) {
  if (!validColor(color)) throw new Error('invalid_color');
  if (state.status !== 'waiting') throw new Error('room_not_waiting');
  if (state.players.length >= state.targetPlayers) throw new Error('room_full');
  if (state.players.some(player => player.color === color)) throw new Error('color_taken');
  const players = [...state.players, { seat, color }];
  const scores = { ...state.scores, [seat]: 0 };
  const rematch = { ...state.rematch, [seat]: false };
  return {
    ...state,
    players,
    scores,
    rematch,
    status: players.length === state.targetPlayers ? 'playing' : 'waiting'
  };
}

function finishRound(state, { color = null, seat = null, draw = false, lastMove = null }) {
  const scores = { ...state.scores };
  if (seat) scores[seat] = Number(scores[seat] || 0) + 1;
  const completedRounds = Number(state.completedRounds || 0) + 1;
  const matchComplete = completedRounds >= Number(state.targetRounds);
  const leaders = matchComplete
    ? state.players.filter(player => Number(scores[player.seat] || 0) === Math.max(...Object.values(scores).map(Number)))
    : [];
  return {
    ...state,
    status: 'finished',
    scores,
    completedRounds,
    winner: color && seat ? { color, seat } : null,
    draw,
    lastMove,
    matchComplete,
    matchWinner: leaders.length === 1 ? { seat: leaders[0].seat, color: leaders[0].color, wins: Number(scores[leaders[0].seat] || 0) } : null,
    matchWinners: leaders.map(player => ({ seat: player.seat, color: player.color, wins: Number(scores[player.seat] || 0) })),
    rematch: Object.fromEntries(state.players.map(player => [player.seat, false]))
  };
}

function applyMove(state, seat, move) {
  if (state.status !== 'playing') throw new Error('room_not_playing');
  const current = state.players[state.turnIndex];
  if (!current || current.seat !== seat) throw new Error('not_your_turn');
  const cell = Number(move?.cell);
  const size = String(move?.size || '');
  if (!Number.isInteger(cell) || cell < 0 || cell > 8 || !SIZES.includes(size)) throw new Error('invalid_move');
  if (state.board[String(cell)]?.[size]) throw new Error('occupied_slot');
  if (countPieces(state.board, current.color, size) >= 3) throw new Error('no_piece_remaining');
  const board = structuredClone(state.board);
  board[String(cell)] ||= {};
  board[String(cell)][size] = current.color;
  const lastMove = { cell, size, color: current.color, seat };
  const next = { ...state, board, lastMove, moveNumber: Number(state.moveNumber || 0) + 1, winner: null, draw: false };
  if (winner(board, current.color)) return finishRound(next, { color: current.color, seat, lastMove });
  const turnIndex = nextPlayablePlayer(next, state.turnIndex);
  if (turnIndex < 0) return finishRound(next, { draw: true, lastMove });
  return { ...next, turnIndex };
}

function rematchState(state, seat) {
  if (state.status !== 'finished') throw new Error('round_not_finished');
  if (!state.players.some(player => player.seat === seat)) throw new Error('invalid_seat');
  const rematch = { ...state.rematch, [seat]: true };
  if (!state.players.every(player => rematch[player.seat])) return { ...state, rematch };
  const cleared = Object.fromEntries(state.players.map(player => [player.seat, false]));
  if (state.matchComplete) {
    return {
      ...state,
      status: 'playing', turnIndex: 0, board: emptyBoard(), round: 1, completedRounds: 0,
      scores: Object.fromEntries(state.players.map(player => [player.seat, 0])),
      winner: null, draw: false, lastMove: null, moveNumber: 0,
      matchComplete: false, matchWinner: null, matchWinners: [], rematch: cleared
    };
  }
  return {
    ...state,
    status: 'playing', turnIndex: Number(state.round || 1) % state.players.length,
    board: emptyBoard(), round: Number(state.round || 1) + 1,
    winner: null, draw: false, lastMove: null,
    matchComplete: false, matchWinner: null, matchWinners: [], rematch: cleared
  };
}

function leaveState(state, seat) {
  if (!state.players.some(player => player.seat === seat)) throw new Error('invalid_seat');
  return { ...state, status: 'cancelled', cancelledBy: seat };
}

function publicRoom(row, state = null) {
  return { code: String(row.room_code), version: Number(row.version), ...(state || JSON.parse(String(row.state_json))) };
}

function authEntries(row) {
  try {
    const entries = JSON.parse(String(row.auth_json || '[]'));
    return Array.isArray(entries) ? entries : [];
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
  const result = await db.execute({
    sql: `UPDATE ${TABLE} SET auth_json = ?, state_json = ?, status = ?, version = version + 1, updated_at = ?, expires_at = ? WHERE room_code = ? AND version = ?`,
    args: [JSON.stringify(auth || authEntries(row)), JSON.stringify(state), state.status, new Date().toISOString(), isoAfter(ROOM_TTL_MS), String(row.room_code), expectedVersion]
  });
  if (Number(result.rowsAffected || 0) !== 1) throw new Error('version_conflict');
  return { ...row, version: expectedVersion + 1, state_json: JSON.stringify(state), status: state.status };
}

async function createRoom(db, color, targetPlayers, targetRounds) {
  const token = sessionToken();
  const seat = 'p1';
  const state = createState(color, targetPlayers, targetRounds);
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = roomCode();
    try {
      await db.execute({
        sql: `INSERT INTO ${TABLE} (room_code, auth_json, state_json, version, status, created_at, updated_at, expires_at) VALUES (?, ?, ?, 1, 'waiting', ?, ?, ?)`,
        args: [code, JSON.stringify([{ seat, hash: tokenHash(token) }]), JSON.stringify(state), now, now, isoAfter(ROOM_TTL_MS)]
      });
      return { token, seat, room: { code, version: 1, ...state } };
    } catch (error) {
      if (!String(error?.message || '').toLowerCase().includes('unique')) throw error;
    }
  }
  throw new Error('room_code_exhausted');
}

async function joinRoom(db, code, color) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await readRoom(db, code);
    if (!row) throw new Error('room_not_found');
    const state = JSON.parse(String(row.state_json));
    const seat = ['p2', 'p3', 'p4'].find(candidate => !state.players.some(player => player.seat === candidate));
    if (!seat) throw new Error('room_full');
    const next = joinState(state, seat, color);
    const token = sessionToken();
    const result = await db.execute({
      sql: `UPDATE ${TABLE} SET auth_json = ?, state_json = ?, status = ?, version = version + 1, updated_at = ?, expires_at = ? WHERE room_code = ? AND version = ?`,
      args: [JSON.stringify([...authEntries(row), { seat, hash: tokenHash(token) }]), JSON.stringify(next), next.status, new Date().toISOString(), isoAfter(ROOM_TTL_MS), code, Number(row.version)]
    });
    if (Number(result.rowsAffected || 0) === 1) return { token, seat, room: { code, version: Number(row.version) + 1, ...next } };
  }
  throw new Error('version_conflict');
}

function preview(row) {
  const state = JSON.parse(String(row.state_json));
  return { code: String(row.room_code), status: state.status, targetPlayers: state.targetPlayers, targetRounds: state.targetRounds, players: state.players, availableColors: COLORS.filter(color => !state.players.some(player => player.color === color)) };
}

function statusFor(error) {
  const code = error?.message;
  if (code === 'payload_too_large') return 413;
  if (code === 'database_not_configured') return 503;
  if (code === 'room_not_found') return 404;
  if (code === 'unauthorized') return 401;
  if (['not_your_turn', 'room_full', 'room_not_waiting', 'version_conflict', 'color_taken', 'room_not_playing', 'round_not_finished', 'occupied_slot', 'no_piece_remaining'].includes(code)) return 409;
  if (['invalid_color', 'invalid_player_count', 'invalid_round_count', 'invalid_move', 'invalid_room_code', 'invalid_payload', 'invalid_action', 'invalid_seat'].includes(code)) return 400;
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
  if (!db) return json(res, 503, { ok: false, error: 'online_unavailable' });
  try {
    await ensureTable(db);
    if (req.method === 'GET') {
      const code = normalizeCode(req.query?.code);
      if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
      const row = await readRoom(db, code);
      if (!row) throw new Error('room_not_found');
      const seat = seatFor(row, bearer(req));
      if (!seat) throw new Error('unauthorized');
      if (Number(req.query?.since || 0) === Number(row.version)) {
        res.statusCode = 204;
        res.setHeader('cache-control', 'no-store, max-age=0');
        return res.end();
      }
      return json(res, 200, { ok: true, seat, room: publicRoom(row) });
    }
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    let body;
    try { body = parseBody(req); } catch { throw new Error('invalid_payload'); }
    const action = String(body.action || '');
    if (action === 'create') return json(res, 201, { ok: true, ...(await createRoom(db, String(body.color || ''), Number(body.targetPlayers), Number(body.targetRounds))) });
    if (action === 'preview') {
      const code = normalizeCode(body.code);
      if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
      const row = await readRoom(db, code);
      if (!row) throw new Error('room_not_found');
      return json(res, 200, { ok: true, room: preview(row) });
    }
    if (action === 'join') {
      const code = normalizeCode(body.code);
      if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
      return json(res, 200, { ok: true, ...(await joinRoom(db, code, String(body.color || ''))) });
    }
    const code = normalizeCode(body.code);
    if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
    const row = await readRoom(db, code);
    if (!row) throw new Error('room_not_found');
    const seat = seatFor(row, bearer(req));
    if (!seat) throw new Error('unauthorized');
    const expectedVersion = Number(body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(row.version)) return json(res, 409, { ok: false, error: 'version_conflict', room: publicRoom(row) });
    const state = JSON.parse(String(row.state_json));
    let next;
    if (action === 'move') next = applyMove(state, seat, body);
    else if (action === 'rematch') next = rematchState(state, seat);
    else if (action === 'leave') next = leaveState(state, seat);
    else throw new Error('invalid_action');
    const auth = action === 'leave' ? authEntries(row).filter(entry => entry.seat !== seat) : null;
    const updated = await updateRoom(db, row, next, expectedVersion, auth);
    return json(res, 200, { ok: true, seat, room: publicRoom(updated, next) });
  } catch (error) {
    const status = statusFor(error);
    if (status >= 500) console.error('[Yakolak] online room request failed', error);
    return json(res, status, { ok: false, error: status >= 500 ? 'online_server_error' : error.message });
  }
}

// Exported only for the deterministic rules test.  The Vercel handler above
// remains the only HTTP entry point and still owns authentication/state.
export const __testing = {
  applyMove,
  createState,
  emptyBoard,
  joinState,
  rematchState,
  winner
};
