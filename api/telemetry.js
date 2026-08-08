import { getTelemetryClient, writeTelemetryBatch } from './_telemetry.js';

const MAX_BODY_BYTES = 96_000;
const MAX_EVENTS = 50;

function noContent(res, status = 204) {
  res.statusCode = status;
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end();
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  if (!raw) return {};
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new Error('payload_too_large');
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  res.setHeader('allow', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return noContent(res);
  if (req.method !== 'POST') return noContent(res, 405);

  const db = getTelemetryClient();
  if (!db) {
    console.error('[YAKOLAK_TELEMETRY_UNAVAILABLE] database_not_configured');
    return noContent(res, 503);
  }

  try {
    const body = parseBody(req);
    const events = Array.isArray(body?.events) ? body.events : (body?.event ? [body.event] : []);
    if (events.length < 1 || events.length > MAX_EVENTS) return noContent(res, 400);

    const accepted = await writeTelemetryBatch(db, events, req);
    for (const event of accepted) {
      const summary = {
        eventId: event.eventId,
        at: event.occurredAt,
        trace: event.traceId,
        request: event.requestId,
        room: event.roomCode,
        seat: event.seat,
        source: event.source,
        level: event.level,
        event: event.eventName,
        version: event.roomVersion,
        round: event.roundNumber,
        move: event.moveNumber,
        details: JSON.parse(event.detailsJson || '{}'),
      };
      const line = JSON.stringify(summary);
      if (event.level === 'fatal' || event.level === 'error') console.error('[YAKOLAK_TRACE]', line);
      else if (event.level === 'warn') console.warn('[YAKOLAK_TRACE]', line);
      else console.log('[YAKOLAK_TRACE]', line);
    }
    return noContent(res);
  } catch (error) {
    console.error('[YAKOLAK_TELEMETRY_INGEST_ERROR]', error?.message || error);
    return noContent(res, String(error?.message || '') === 'payload_too_large' ? 413 : 400);
  }
}