import roomsHandler from './rooms.js';
import { getTelemetryClient, sanitizeTelemetryValue, writeTelemetry } from './_telemetry.js';

const TELEMETRY_DEADLINE_MS = 300;

function requestBody(req) {
  try {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return sanitizeTelemetryValue(req.body);
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    if (!raw) return {};
    return sanitizeTelemetryValue(JSON.parse(raw));
  } catch {
    return { parseError: true };
  }
}

function parseResponseBody(value) {
  if (value == null) return null;
  try {
    const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
    if (!text) return null;
    return sanitizeTelemetryValue(JSON.parse(text));
  } catch {
    return { nonJson: true };
  }
}

function safeRoom(value) {
  const room = String(value || '').replace(/\D/g, '').slice(0, 2);
  return /^\d{2}$/.test(room) ? room : '';
}

// Defense in depth only. rooms.js now preserves room_code itself, but keep this
// boundary guard so a malformed transport row can never poison the client.
function repairCapturedRoomIdentity(value, requestedRoom) {
  if (value == null || !requestedRoom) return value;
  try {
    const wasBuffer = Buffer.isBuffer(value);
    const text = wasBuffer ? value.toString('utf8') : String(value);
    if (!text) return value;
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== 'object' || !payload.room || typeof payload.room !== 'object') return value;
    if (safeRoom(payload.room.code)) return value;
    payload.room.code = requestedRoom;
    const repaired = JSON.stringify(payload);
    return wasBuffer ? Buffer.from(repaired, 'utf8') : repaired;
  } catch {
    return value;
  }
}

function finishResponse(originalEnd, chunk, encoding, callback) {
  if (chunk == null) return originalEnd();
  if (typeof encoding === 'function') return originalEnd(chunk, encoding);
  if (typeof callback === 'function') return originalEnd(chunk, encoding, callback);
  if (typeof encoding === 'string') return originalEnd(chunk, encoding);
  return originalEnd(chunk);
}

async function persistWithDeadline(db, event, req) {
  let timer;
  try {
    await Promise.race([
      writeTelemetry(db, event, req),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('telemetry_deadline')), TELEMETRY_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const started = performance.now();
  const body = requestBody(req);
  const action = String(body?.action || (req.method === 'GET' ? 'poll' : 'unknown'));
  const requestedRoom = safeRoom(body?.code || req.query?.code);
  const traceId = String(req.headers?.['x-yakolak-trace'] || '').slice(0, 96);
  const requestId = String(req.headers?.['x-yakolak-request'] || '').slice(0, 96);

  const originalEnd = res.end.bind(res);
  let captured = null;
  let capturedEncoding;
  let capturedCallback;
  let ended = false;

  res.end = function captureEnd(chunk, encoding, callback) {
    if (!ended) {
      captured = chunk ?? null;
      capturedEncoding = encoding;
      capturedCallback = callback;
      ended = true;
    }
    return res;
  };

  let thrown = null;
  try {
    await roomsHandler(req, res);
  } catch (error) {
    thrown = error;
    if (!ended) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      captured = JSON.stringify({ ok: false, error: 'online_server_error' });
      ended = true;
    }
  }

  captured = repairCapturedRoomIdentity(captured, requestedRoom);
  const payload = parseResponseBody(captured);
  const room = payload?.room || null;
  const roomCode = safeRoom(room?.code || requestedRoom);
  const seat = /^p[1-4]$/.test(String(payload?.seat || '')) ? String(payload.seat) : '';
  const status = Number(res.statusCode || 200);
  const durationMs = Math.round((performance.now() - started) * 10) / 10;
  const level = thrown || status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  const details = {
    method: req.method,
    action,
    status,
    durationMs,
    query: sanitizeTelemetryValue(req.query || {}),
    request: body,
    response: payload,
    thrown: thrown ? { name: thrown.name || '', message: thrown.message || String(thrown) } : null,
  };

  const event = {
    traceId,
    requestId,
    roomCode,
    seat,
    source: 'server',
    level,
    eventName: 'server.rooms.exchange',
    roomVersion: room?.version ?? null,
    roundNumber: room?.round ?? null,
    moveNumber: room?.moveNumber ?? null,
    details,
  };

  const summary = {
    trace: traceId,
    request: requestId,
    room: roomCode,
    seat,
    action,
    status,
    durationMs,
    version: room?.version ?? null,
    round: room?.round ?? null,
    move: room?.moveNumber ?? null,
    requestBody: body,
    response: payload,
  };
  const line = JSON.stringify(summary);
  if (level === 'error') console.error('[YAKOLAK_ROOM_TRACE]', line);
  else if (level === 'warn') console.warn('[YAKOLAK_ROOM_TRACE]', line);
  else console.log('[YAKOLAK_ROOM_TRACE]', line);

  // Return the gameplay response first. Telemetry is intentionally outside the
  // latency path: even a slow/locked telemetry DB must never delay a move.
  res.end = originalEnd;
  finishResponse(originalEnd, captured, capturedEncoding, capturedCallback);

  try {
    const db = getTelemetryClient();
    if (db) await persistWithDeadline(db, event, req);
  } catch (telemetryError) {
    console.warn('[YAKOLAK_ROOM_TRACE_WRITE_SKIPPED]', telemetryError?.message || telemetryError);
  }
}

export const __testing = {
  repairCapturedRoomIdentity,
  safeRoom,
};