import roomsHandler from './rooms.js';
import { getTelemetryClient, sanitizeTelemetryValue, writeTelemetry } from './_telemetry.js';

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

  try {
    const db = getTelemetryClient();
    if (db) {
      await writeTelemetry(db, {
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
      }, req);
    }
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
  } catch (telemetryError) {
    console.error('[YAKOLAK_ROOM_TRACE_WRITE_FAILED]', telemetryError?.message || telemetryError);
  }

  res.end = originalEnd;
  return originalEnd(captured, capturedEncoding, capturedCallback);
}