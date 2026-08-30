import { createHash, randomInt } from 'node:crypto';
import { createClient } from '@tursodatabase/serverless/compat';
import {
  COLORS as RULE_COLORS,
  SIZES as RULE_SIZES,
  emptyBoard as rulesEmptyBoard,
  hasLegalMove as rulesHasLegalMove,
  isValidPlayerCount,
  isValidWinsToMatch,
  validatePlacement,
  winner as rulesWinner,
  winningPatterns as rulesWinningPatterns,
} from './game-rules.js';

const TABLE = 'yakolak_online_rooms_v5';
const PRESENCE_TABLE = 'yakolak_online_presence_v1';
const RATE_TABLE = 'yakolak_online_join_rate_v1';
const PROTOCOL = 5;
const COLORS = RULE_COLORS;
const SIZES = RULE_SIZES;
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
const WAITING_REUSE_MS = 20 * 60 * 1000;
const FINISHED_MATCH_REUSE_MS = 15 * 60 * 1000;
const PLAYER_STALE_MS = 60 * 1000;
const PRESENCE_WRITE_INTERVAL_MS = 5 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 24;
const MAX_BODY_BYTES = 8_000;
const ROOM_PATTERN = /^\d{2}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,96}$/;
let client;
let tablesReady;
const presenceTouchCache = new Map();

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
  tablesReady ||= Promise.all([
    db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        room_code TEXT PRIMARY KEY,
        create_key TEXT NOT NULL UNIQUE,
        auth_json TEXT NOT NULL,
        state_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `),
    db.execute(`
      CREATE TABLE IF NOT EXISTS ${PRESENCE_TABLE} (
        room_code TEXT NOT NULL,
        seat TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        PRIMARY KEY (room_code, seat)
      )
    `),
    db.execute(`
      CREATE TABLE IF NOT EXISTS ${RATE_TABLE} (
        rate_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        expires_at TEXT NOT NULL
      )
    `),
  ]);
  await tablesReady;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  if (!raw) return {};
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new Error('payload_too_large');
  return JSON.parse(raw);
}

function asciiDigits(value) {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return String(value || '').replace(/[٠-٩]/g, digit => String(arabic.indexOf(digit))).replace(/[۰-۹]/g, digit => String(persian.indexOf(digit)));
}

function normalizeCode(value) {
  return asciiDigits(value).replace(/\D/g, '').slice(0, 2);
}

function roomCode(index) {
  return String(index).padStart(2, '0');
}

function tokenHash(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function validCredential(value) {
  return TOKEN_PATTERN.test(String(value || ''));
}

function validMutationId(value) {
  return TOKEN_PATTERN.test(String(value || ''));
}

function mutationEntries(state) {
  return Array.isArray(state?._mutations) ? state._mutations : [];
}

function mutationApplied(state, seat, kind, mutationId) {
  if (!validMutationId(mutationId)) return false;
  return mutationEntries(state).some(entry =>
    entry && entry.id === mutationId && entry.seat === seat && entry.kind === kind
  );
}

function recordMutation(state, seat, kind, mutationId) {
  if (!validMutationId(mutationId) || mutationApplied(state, seat, kind, mutationId)) return state;
  return {
    ...state,
    _mutations: [...mutationEntries(state), { id: String(mutationId), seat: String(seat), kind: String(kind) }]
  };
}

function publicState(state) {
  const visible = structuredClone(state || {});
  delete visible._mutations;
  return visible;
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
  return isValidPlayerCount(value);
}

function validRounds(value) {
  return isValidWinsToMatch(value);
}

function emptyBoard() {
  return rulesEmptyBoard();
}

function winner(board, color) {
  return rulesWinner(board, color);
}

function hasLegalMove(state, color) {
  return rulesHasLegalMove(state.board, color);
}

function nextPlayablePlayer(state, fromIndex, allowedSeats = null) {
  const allowed = allowedSeats ? new Set(allowedSeats) : null;
  for (let offset = 1; offset < state.players.length; offset += 1) {
    const index = (fromIndex + offset) % state.players.length;
    const player = state.players[index];
    if (allowed && !allowed.has(player.seat)) continue;
    if (hasLegalMove(state, player.color)) return index;
  }
  return -1;
}

function createState(hostColor, targetPlayers, targetRounds) {
  if (!validColor(hostColor)) throw new Error('invalid_color');
  if (!validPlayers(targetPlayers)) throw new Error('invalid_player_count');
  if (!validRounds(targetRounds)) throw new Error('invalid_round_count');
  const winsToMatch = Number(targetRounds);
  return {
    protocol: PROTOCOL,
    status: 'waiting',
    targetPlayers: Number(targetPlayers),
    targetRounds: winsToMatch,
    winsToMatch,
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
    rematch: { p1: false },
    skippedSeat: null,
    _mutations: [],
  };
}

function joinState(state, seat, color) {
  if (!validColor(color)) throw new Error('invalid_color');
  if (state.status !== 'waiting') throw new Error('room_not_waiting');
  if (state.players.length >= state.targetPlayers) throw new Error('room_full');
  if (state.players.some(player => player.color === color)) throw new Error('color_taken');
  const players = [...state.players, { seat, color }];
  return {
    ...state,
    players,
    scores: { ...state.scores, [seat]: 0 },
    rematch: { ...state.rematch, [seat]: false },
    status: players.length === state.targetPlayers ? 'playing' : 'waiting'
  };
}

function finishRound(state, { color = null, seat = null, draw = false, lastMove = null }) {
  const scores = { ...state.scores };
  if (seat) scores[seat] = Number(scores[seat] || 0) + 1;
  const completedRounds = Number(state.completedRounds || 0) + 1;
  const winsToMatch = Number(state.winsToMatch ?? state.targetRounds);
  const matchComplete = Boolean(seat) && Number(scores[seat] || 0) >= winsToMatch;
  const leaders = matchComplete
    ? state.players.filter(player => Number(scores[player.seat] || 0) === Math.max(...Object.values(scores).map(Number)))
    : [];
  return {
    ...state,
    winsToMatch,
    targetRounds: winsToMatch,
    status: 'finished',
    scores,
    completedRounds,
    winner: color && seat ? { color, seat } : null,
    draw,
    lastMove,
    matchComplete,
    matchWinner: leaders.length === 1 ? { seat: leaders[0].seat, color: leaders[0].color, wins: Number(scores[leaders[0].seat] || 0) } : null,
    matchWinners: leaders.map(player => ({ seat: player.seat, color: player.color, wins: Number(scores[player.seat] || 0) })),
    rematch: Object.fromEntries(state.players.map(player => [player.seat, false])),
    skippedSeat: null,
  };
}

function applyMove(state, seat, move) {
  if (state.status !== 'playing') throw new Error('room_not_playing');
  const current = state.players[state.turnIndex];
  if (!current || current.seat !== seat) throw new Error('not_your_turn');
  const placementError = validatePlacement(state.board, current.color, move);
  if (placementError) throw new Error(placementError);
  const cell = Number(move.cell);
  const size = String(move.size);
  const board = structuredClone(state.board);
  board[String(cell)] ||= {};
  board[String(cell)][size] = current.color;
  const lastMove = { cell, size, color: current.color, seat };
  const next = { ...state, board, lastMove, moveNumber: Number(state.moveNumber || 0) + 1, winner: null, draw: false, skippedSeat: null };
  if (winner(board, current.color)) return finishRound(next, { color: current.color, seat, lastMove });
  const turnIndex = nextPlayablePlayer(next, state.turnIndex);
  if (turnIndex < 0) return finishRound(next, { draw: true, lastMove });
  return { ...next, turnIndex };
}

function advanceRoundState(state, seat) {
  if (state.status !== 'finished' || state.matchComplete) throw new Error('round_not_finished');
  if (!state.players.some(player => player.seat === seat)) throw new Error('invalid_seat');
  const cleared = Object.fromEntries(state.players.map(player => [player.seat, false]));
  return {
    ...state,
    status: 'playing',
    turnIndex: Number(state.round || 1) % state.players.length,
    board: emptyBoard(),
    round: Number(state.round || 1) + 1,
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: cleared,
    skippedSeat: null,
  };
}

function restartMatchState(state) {
  const cleared = Object.fromEntries(state.players.map(player => [player.seat, false]));
  return {
    ...state,
    status: 'playing',
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: Object.fromEntries(state.players.map(player => [player.seat, 0])),
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: cleared,
    skippedSeat: null,
  };
}

function rematchState(state, seat, requiredSeats = null) {
  if (state.status !== 'finished') throw new Error('round_not_finished');
  if (!state.players.some(player => player.seat === seat)) throw new Error('invalid_seat');
  if (!state.matchComplete) return advanceRoundState(state, seat);
  const rematch = { ...state.rematch, [seat]: true };
  const required = requiredSeats || state.players.map(player => player.seat);
  if (!required.every(requiredSeat => rematch[requiredSeat])) return { ...state, rematch };
  return restartMatchState({ ...state, rematch });
}

function leaveState(state, seat) {
  if (!state.players.some(player => player.seat === seat)) throw new Error('invalid_seat');
  // A completed match is already terminal authority. Leaving it detaches only
  // this client; it must not rewrite the shared result into a cancellation.
  // Clear a prior rematch vote so a player cannot leave behind consent that
  // later restarts the room with a ghost seat.
  if (state.status === 'finished' && state.matchComplete) {
    return { ...state, rematch: { ...state.rematch, [seat]: false }, cancelledBy: null };
  }
  if (state.status === 'waiting' && seat !== 'p1') {
    const players = state.players.filter(player => player.seat !== seat);
    const scores = { ...state.scores };
    const rematch = { ...state.rematch };
    delete scores[seat];
    delete rematch[seat];
    return { ...state, players, scores, rematch, cancelledBy: null };
  }
  return { ...state, status: 'cancelled', cancelledBy: seat };
}

// Room settings are mutable only while the lobby is waiting, and only by the
// authoritative owner seat. The editable surface is deliberately an allowlist:
// changing player/turn/board/status ownership would create a second rules path.
function applyRoomEdit(state, seat, changes) {
  if (seat !== 'p1') throw new Error('unauthorized');
  if (state.status !== 'waiting') throw new Error('room_edit_forbidden');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('invalid_payload');
  const keys = Object.keys(changes);
  if (!keys.length) throw new Error('invalid_payload');
  const allowed = new Set(['color', 'targetPlayers', 'targetRounds']);
  if (keys.some(key => !allowed.has(key))) throw new Error('unsafe_room_edit');

  let targetPlayers = Number(state.targetPlayers);
  let winsToMatch = Number(state.winsToMatch ?? state.targetRounds);
  let players = state.players.map(player => ({ ...player }));

  if (Object.hasOwn(changes, 'targetPlayers')) {
    const requestedPlayers = Number(changes.targetPlayers);
    if (!validPlayers(requestedPlayers)) throw new Error('invalid_player_count');
    // Editing must never become an alternate "start now" transition. A waiting
    // lobby always retains at least one open seat; joinState remains the sole
    // transition that turns a filled lobby into a playing match.
    if (requestedPlayers <= players.length) throw new Error('unsafe_room_edit');
    targetPlayers = requestedPlayers;
  }

  if (Object.hasOwn(changes, 'targetRounds')) {
    const requestedRounds = Number(changes.targetRounds);
    if (!validRounds(requestedRounds)) throw new Error('invalid_round_count');
    winsToMatch = requestedRounds;
  }

  if (Object.hasOwn(changes, 'color')) {
    const requestedColor = String(changes.color || '');
    if (!validColor(requestedColor)) throw new Error('invalid_color');
    if (players.some(player => player.seat !== 'p1' && player.color === requestedColor)) throw new Error('color_taken');
    players = players.map(player => player.seat === 'p1' ? { ...player, color: requestedColor } : player);
  }

  return {
    ...state,
    targetPlayers,
    targetRounds: winsToMatch,
    winsToMatch,
    players,
  };
}

function requireCurrentVersion(expectedVersion, currentVersion) {
  const expected = Number(expectedVersion);
  const current = Number(currentVersion);
  if (!Number.isInteger(expected) || expected !== current) throw new Error('version_conflict');
  return expected;
}

function reconcilePresenceState(state, connectedSeats) {
  const connected = new Set(connectedSeats || []);
  if (!connected.size) return state;
  if (state.status === 'waiting') {
    const players = state.players.filter(player => player.seat === 'p1' || connected.has(player.seat));
    if (players.length === state.players.length) return state;
    const keptSeats = new Set(players.map(player => player.seat));
    const scores = Object.fromEntries(Object.entries(state.scores || {}).filter(([seat]) => keptSeats.has(seat)));
    const rematch = Object.fromEntries(Object.entries(state.rematch || {}).filter(([seat]) => keptSeats.has(seat)));
    return { ...state, players, scores, rematch, status: 'waiting' };
  }
  return state;
}

function publicRoom(row, state = null) {
  const visible = publicState(state || JSON.parse(String(row.state_json)));
  return { code: String(row.room_code), version: Number(row.version), ...visible };
}

function authEntries(row) {
  try {
    const entries = JSON.parse(String(row.auth_json || '[]'));
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

// Online ownership has one source of truth: active seats come from state.players,
// while auth_json privately maps exactly one credential hash to exactly one seat.
// Colors never grant control; a credential can act only through its owned seat.
function seatOwnership(state, auth) {
  const players = Array.isArray(state?.players) ? state.players : [];
  const activeSeats = new Set();
  for (const player of players) {
    const seat = String(player?.seat || '');
    if (!/^p[1-4]$/.test(seat) || activeSeats.has(seat)) throw new Error('identity_conflict');
    activeSeats.add(seat);
  }

  const activeAuth = (Array.isArray(auth) ? auth : []).filter(entry => activeSeats.has(String(entry?.seat || '')));
  const seatToHash = new Map();
  const hashToSeat = new Map();
  for (const entry of activeAuth) {
    const seat = String(entry?.seat || '');
    const hash = String(entry?.hash || '');
    if (!hash) throw new Error('identity_conflict');
    const previousHash = seatToHash.get(seat);
    if (previousHash && previousHash !== hash) throw new Error('identity_conflict');
    const previousSeat = hashToSeat.get(hash);
    if (previousSeat && previousSeat !== seat) throw new Error('identity_conflict');
    seatToHash.set(seat, hash);
    hashToSeat.set(hash, seat);
  }
  for (const seat of activeSeats) if (!seatToHash.has(seat)) throw new Error('identity_conflict');
  return { auth: activeAuth, seatToHash, hashToSeat };
}

function seatFor(row, token) {
  if (!validCredential(token)) return null;
  const state = JSON.parse(String(row.state_json || '{}'));
  return seatOwnership(state, authEntries(row)).hashToSeat.get(tokenHash(token)) || null;
}

async function readRoom(db, code) {
  const result = await db.execute({ sql: `SELECT * FROM ${TABLE} WHERE room_code = ? AND expires_at > ? LIMIT 1`, args: [code, new Date().toISOString()] });
  return result.rows?.[0] || null;
}

async function readCreateRequest(db, createKey) {
  const result = await db.execute({ sql: `SELECT * FROM ${TABLE} WHERE create_key = ? AND expires_at > ? LIMIT 1`, args: [createKey, new Date().toISOString()] });
  return result.rows?.[0] || null;
}

async function cleanupReusableRooms(db) {
  const now = Date.now();
  await db.execute({ sql: `DELETE FROM ${TABLE} WHERE expires_at <= ? OR status = 'cancelled' OR (status = 'waiting' AND updated_at < ?) OR (status = 'finished' AND COALESCE(json_extract(state_json, '$.matchComplete'), 0) = 1 AND updated_at < ?)`, args: [new Date(now).toISOString(), new Date(now - WAITING_REUSE_MS).toISOString(), new Date(now - FINISHED_MATCH_REUSE_MS).toISOString()] });
  await db.execute({ sql: `DELETE FROM ${PRESENCE_TABLE} WHERE room_code NOT IN (SELECT room_code FROM ${TABLE}) OR last_seen < ?`, args: [new Date(now - ROOM_TTL_MS).toISOString()] });
  await db.execute({ sql: `DELETE FROM ${RATE_TABLE} WHERE expires_at <= ?`, args: [new Date(now).toISOString()] });
}

function materializeUpdatedRow(row, state, expectedVersion, auth = null) {
  const authJson = JSON.stringify(auth || authEntries(row));
  return { room_code: String(row.room_code), auth_json: authJson, state_json: JSON.stringify(state), version: expectedVersion + 1, status: state.status };
}

async function updateRoom(db, row, state, expectedVersion, auth = null) {
  const updated = materializeUpdatedRow(row, state, expectedVersion, auth);
  const result = await db.execute({ sql: `UPDATE ${TABLE} SET auth_json = ?, state_json = ?, status = ?, version = version + 1, updated_at = ?, expires_at = ? WHERE room_code = ? AND version = ?`, args: [updated.auth_json, updated.state_json, state.status, new Date().toISOString(), isoAfter(ROOM_TTL_MS), updated.room_code, expectedVersion] });
  if (Number(result.rowsAffected || 0) !== 1) throw new Error('version_conflict');
  return updated;
}

async function touchPresence(db, code, seat, force = false) {
  if (!ROOM_PATTERN.test(String(code || '')) || !/^p[1-4]$/.test(String(seat || ''))) return;
  const key = `${code}:${seat}`;
  const now = Date.now();
  const previous = Number(presenceTouchCache.get(key) || 0);
  if (!force && now - previous < PRESENCE_WRITE_INTERVAL_MS) return;
  await db.execute({ sql: `INSERT INTO ${PRESENCE_TABLE} (room_code, seat, last_seen) VALUES (?, ?, ?) ON CONFLICT(room_code, seat) DO UPDATE SET last_seen = excluded.last_seen`, args: [code, seat, new Date(now).toISOString()] });
  presenceTouchCache.set(key, now);
  if (presenceTouchCache.size > 512) for (const [cacheKey, touchedAt] of presenceTouchCache) if (now - Number(touchedAt) > ROOM_TTL_MS) presenceTouchCache.delete(cacheKey);
}

async function removePresence(db, code, seat) {
  presenceTouchCache.delete(`${code}:${seat}`);
  await db.execute({ sql: `DELETE FROM ${PRESENCE_TABLE} WHERE room_code = ? AND seat = ?`, args: [code, seat] });
}

async function connectedSeats(db, code) {
  const cutoff = new Date(Date.now() - PLAYER_STALE_MS).toISOString();
  const result = await db.execute({ sql: `SELECT seat FROM ${PRESENCE_TABLE} WHERE room_code = ? AND last_seen >= ?`, args: [code, cutoff] });
  return (result.rows || []).map(row => String(row.seat || '')).filter(seat => /^p[1-4]$/.test(seat));
}

async function reconcileRoomPresence(db, row) {
  const state = JSON.parse(String(row.state_json));
  const connected = await connectedSeats(db, String(row.room_code));
  const next = reconcilePresenceState(state, connected);
  if (next === state) return row;
  const validSeats = new Set((next.players || []).map(player => player.seat));
  const nextAuth = authEntries(row).filter(entry => validSeats.has(entry.seat));
  const removedSeats = state.players.map(player => player.seat).filter(seat => !validSeats.has(seat));
  try {
    const updated = await updateRoom(db, row, next, Number(row.version), nextAuth);
    for (const removedSeat of removedSeats) await removePresence(db, String(row.room_code), removedSeat);
    return updated;
  } catch (error) {
    if (error?.message !== 'version_conflict') throw error;
    return (await readRoom(db, String(row.room_code))) || row;
  }
}

function requestFingerprint(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const direct = String(req.headers?.['x-real-ip'] || req.socket?.remoteAddress || '').trim();
  return tokenHash(forwarded || direct || 'unknown');
}

async function enforceDiscoveryRate(db, req) {
  const bucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  const key = tokenHash(`${requestFingerprint(req)}:${bucket}`);
  const expiresAt = new Date((bucket + 2) * RATE_WINDOW_MS).toISOString();
  await db.execute({ sql: `INSERT INTO ${RATE_TABLE} (rate_key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(rate_key) DO UPDATE SET count = count + 1, expires_at = excluded.expires_at`, args: [key, expiresAt] });
  const result = await db.execute({ sql: `SELECT count FROM ${RATE_TABLE} WHERE rate_key = ? LIMIT 1`, args: [key] });
  if (Number(result.rows?.[0]?.count || 0) > RATE_LIMIT) throw new Error('rate_limited');
}

async function createRoom(db, color, targetPlayers, targetRounds, clientToken, requestId) {
  if (!validCredential(clientToken) || !validCredential(requestId)) throw new Error('invalid_session');
  const createKey = tokenHash(requestId);
  const token = String(clientToken);
  const existing = await readCreateRequest(db, createKey);
  if (existing) {
    if (seatFor(existing, token) !== 'p1') throw new Error('unauthorized');
    await touchPresence(db, String(existing.room_code), 'p1', true);
    return { token, seat: 'p1', room: publicRoom(existing) };
  }
  await cleanupReusableRooms(db);
  const state = createState(color, targetPlayers, targetRounds);
  const now = new Date().toISOString();
  const start = randomInt(0, 100);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = roomCode((start + attempt) % 100);
    try {
      await db.execute({ sql: `INSERT INTO ${TABLE} (room_code, create_key, auth_json, state_json, version, status, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, 1, 'waiting', ?, ?, ?)`, args: [code, createKey, JSON.stringify([{ seat: 'p1', hash: tokenHash(token), joinKey: createKey }]), JSON.stringify(state), now, now, isoAfter(ROOM_TTL_MS)] });
      await touchPresence(db, code, 'p1', true);
      return { token, seat: 'p1', room: { code, version: 1, ...publicState(state) } };
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('unique')) throw error;
      const retryExisting = await readCreateRequest(db, createKey);
      if (retryExisting) {
        if (seatFor(retryExisting, token) !== 'p1') throw new Error('unauthorized');
        await touchPresence(db, String(retryExisting.room_code), 'p1', true);
        return { token, seat: 'p1', room: publicRoom(retryExisting) };
      }
    }
  }
  throw new Error('room_code_exhausted');
}

async function joinRoom(db, code, color, clientToken, requestId) {
  if (!validCredential(clientToken) || !validCredential(requestId)) throw new Error('invalid_session');
  const token = String(clientToken);
  const tokenDigest = tokenHash(token);
  const joinKey = tokenHash(requestId);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const row = await readRoom(db, code);
    if (!row) throw new Error('room_not_found');
    const state = JSON.parse(String(row.state_json));
    const ownership = seatOwnership(state, authEntries(row));
    const auth = ownership.auth;

    // Ownership outranks request idempotency. Re-entering with the same
    // credential can never reserve another seat or change the seat's color.
    const ownedSeat = ownership.hashToSeat.get(tokenDigest) || null;
    if (ownedSeat) {
      await touchPresence(db, code, ownedSeat, true);
      return { token, seat: ownedSeat, room: publicRoom(row) };
    }

    const prior = auth.find(entry => entry.joinKey === joinKey);
    if (prior) {
      if (prior.hash !== tokenDigest) throw new Error('unauthorized');
      await touchPresence(db, code, prior.seat, true);
      return { token, seat: prior.seat, room: publicRoom(row) };
    }

    const seat = ['p2', 'p3', 'p4'].find(candidate => !state.players.some(player => player.seat === candidate));
    if (!seat) throw new Error('room_full');
    const next = joinState(state, seat, color);
    await touchPresence(db, code, seat, true);
    const result = await db.execute({ sql: `UPDATE ${TABLE} SET auth_json = ?, state_json = ?, status = ?, version = version + 1, updated_at = ?, expires_at = ? WHERE room_code = ? AND version = ?`, args: [JSON.stringify([...auth, { seat, hash: tokenDigest, joinKey }]), JSON.stringify(next), next.status, new Date().toISOString(), isoAfter(ROOM_TTL_MS), code, Number(row.version)] });
    if (Number(result.rowsAffected || 0) === 1) return { token, seat, room: { code, version: Number(row.version) + 1, ...publicState(next) } };
  }
  throw new Error('version_conflict');
}

function preview(row) {
  const state = JSON.parse(String(row.state_json));
  const winsToMatch = Number(state.winsToMatch ?? state.targetRounds);
  return { code: String(row.room_code), status: state.status, targetPlayers: state.targetPlayers, targetRounds: winsToMatch, winsToMatch, availableColors: COLORS.filter(color => !state.players.some(player => player.color === color)) };
}

function statusFor(error) {
  const code = error?.message;
  if (code === 'payload_too_large') return 413;
  if (code === 'room_not_found') return 404;
  if (code === 'unauthorized') return 401;
  if (code === 'rate_limited') return 429;
  if (code === 'room_code_exhausted') return 503;
  if (['not_your_turn', 'room_full', 'room_not_waiting', 'room_edit_forbidden', 'version_conflict', 'color_taken', 'room_not_playing', 'round_not_finished', 'occupied_slot', 'no_piece_remaining', 'identity_conflict'].includes(code)) return 409;
  if (['invalid_color', 'invalid_player_count', 'invalid_round_count', 'invalid_move', 'invalid_room_code', 'invalid_payload', 'invalid_action', 'invalid_seat', 'invalid_session', 'invalid_mutation_id', 'unsafe_room_edit'].includes(code)) return 400;
  return 500;
}

export default async function handler(req, res) {
  res.setHeader('allow', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const db = getClient();
  if (!db) return json(res, 503, { ok: false, error: 'online_unavailable' });
  try {
    await ensureTable(db);
    if (req.method === 'GET') {
      const code = normalizeCode(req.query?.code);
      if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
      let row = await readRoom(db, code);
      if (!row) throw new Error('room_not_found');
      const seat = seatFor(row, bearer(req));
      if (!seat) throw new Error('unauthorized');
      await touchPresence(db, code, seat);
      row = await reconcileRoomPresence(db, row);
      if (Number(req.query?.since || 0) === Number(row.version)) { res.statusCode = 204; res.setHeader('cache-control', 'no-store, max-age=0'); return res.end(); }
      return json(res, 200, { ok: true, seat, room: publicRoom(row) });
    }
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    let body;
    try { body = parseBody(req); } catch { throw new Error('invalid_payload'); }
    const action = String(body.action || '');
    if (action === 'create') { await enforceDiscoveryRate(db, req); return json(res, 201, { ok: true, ...(await createRoom(db, String(body.color || ''), Number(body.targetPlayers), Number(body.targetRounds), String(body.clientToken || ''), String(body.requestId || ''))) }); }
    if (action === 'preview') { await enforceDiscoveryRate(db, req); const code = normalizeCode(body.code); if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code'); const row = await readRoom(db, code); if (!row) throw new Error('room_not_found'); return json(res, 200, { ok: true, room: preview(row) }); }
    if (action === 'join') { await enforceDiscoveryRate(db, req); const code = normalizeCode(body.code); if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code'); return json(res, 200, { ok: true, ...(await joinRoom(db, code, String(body.color || ''), String(body.clientToken || ''), String(body.requestId || ''))) }); }
    const code = normalizeCode(body.code);
    if (!ROOM_PATTERN.test(code)) throw new Error('invalid_room_code');
    let row = await readRoom(db, code);
    if (!row) throw new Error('room_not_found');
    const seat = seatFor(row, bearer(req));
    if (!seat) throw new Error('unauthorized');
    await touchPresence(db, code, seat);
    row = await reconcileRoomPresence(db, row);
    const state = JSON.parse(String(row.state_json));
    const mutationKind = action === 'move' || action === 'rematch' ? action : '';
    const mutationId = String(body.mutationId || '');
    if (mutationKind && !validMutationId(mutationId)) throw new Error('invalid_mutation_id');
    if (mutationKind && mutationApplied(state, seat, mutationKind, mutationId)) return json(res, 200, { ok: true, seat, room: publicRoom(row, state), duplicate: true });
    let expectedVersion = Number(body.version);
    if (action === 'leave') expectedVersion = Number(row.version);
    else {
      try { expectedVersion = requireCurrentVersion(body.version, row.version); }
      catch { return json(res, 409, { ok: false, error: 'version_conflict', room: publicRoom(row, state) }); }
    }
    const terminalMatchLeave = action === 'leave' && state.status === 'finished' && state.matchComplete;
    let next;
    if (action === 'move') next = applyMove(state, seat, body);
    else if (action === 'rematch') next = rematchState(state, seat);
    else if (action === 'edit') next = applyRoomEdit(state, seat, body.changes);
    else if (action === 'leave') next = leaveState(state, seat);
    else throw new Error('invalid_action');
    if (mutationKind) next = recordMutation(next, seat, mutationKind, mutationId);
    // Terminal detach keeps the historical seat/auth mapping intact so the
    // remaining player can still read the finished room without identity_conflict.
    const auth = action === 'leave' && !terminalMatchLeave ? authEntries(row).filter(entry => entry.seat !== seat) : null;
    let updated;
    try { updated = await updateRoom(db, row, next, expectedVersion, auth); }
    catch (error) {
      if (error?.message === 'version_conflict') {
        const latest = await readRoom(db, code);
        if (latest) {
          const latestState = JSON.parse(String(latest.state_json));
          if (mutationKind && mutationApplied(latestState, seat, mutationKind, mutationId)) return json(res, 200, { ok: true, seat, room: publicRoom(latest, latestState), duplicate: true });
          return json(res, 409, { ok: false, error: 'version_conflict', room: publicRoom(latest, latestState) });
        }
      }
      throw error;
    }
    if (action === 'leave') await removePresence(db, code, seat);
    return json(res, 200, { ok: true, seat, room: publicRoom(updated, next) });
  } catch (error) {
    const status = statusFor(error);
    if (status >= 500) console.error('[Yakolak] online room request failed', error);
    return json(res, status, { ok: false, error: status >= 500 ? 'online_server_error' : error.message });
  }
}

export const __testing = { PROTOCOL, PLAYER_STALE_MS, PRESENCE_WRITE_INTERVAL_MS, advanceRoundState, applyMove, applyRoomEdit, createState, emptyBoard, hasLegalMove, joinState, leaveState, materializeUpdatedRow, mutationApplied, normalizeCode, preview, publicRoom, publicState, reconcilePresenceState, recordMutation, rematchState, requireCurrentVersion, seatOwnership, validMutationId, validatePlacement, winner, winningPatterns: rulesWinningPatterns };
