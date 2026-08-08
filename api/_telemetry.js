import { randomUUID } from 'node:crypto';
import { createClient } from '@tursodatabase/serverless/compat';

const TABLE = 'yakolak_online_telemetry_v1';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DETAILS_BYTES = 12_000;
const MAX_STRING = 1200;
const TRACE_PATTERN = /^[A-Za-z0-9._:-]{6,96}$/;
const ROOM_PATTERN = /^\d{2}$/;
const SEAT_PATTERN = /^p[1-4]$/;
const REDACTED_KEY = /(token|authorization|cookie|secret|password|credential|auth|hash)/i;
let client;
let tableReady;
let cleanupCounter = 0;

export function getTelemetryClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return null;
  client ||= createClient({ url, authToken });
  return client;
}

export async function ensureTelemetryTable(db) {
  tableReady ||= (async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        event_id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        trace_id TEXT,
        request_id TEXT,
        room_code TEXT,
        seat TEXT,
        source TEXT NOT NULL,
        level TEXT NOT NULL,
        event_name TEXT NOT NULL,
        room_version INTEGER,
        round_number INTEGER,
        move_number INTEGER,
        details_json TEXT NOT NULL,
        release_sha TEXT,
        user_agent TEXT
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_room_time ON ${TABLE}(room_code, occurred_at)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_trace_time ON ${TABLE}(trace_id, occurred_at)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_event_time ON ${TABLE}(event_name, occurred_at)`);
  })();
  await tableReady;
}

function cleanString(value, max = MAX_STRING) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export function sanitizeTelemetryValue(value, depth = 0) {
  if (depth > 5) return '[depth-limit]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return cleanString(value);
  if (Array.isArray(value)) return value.slice(0, 64).map(item => sanitizeTelemetryValue(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      const safeKey = cleanString(key, 80);
      if (REDACTED_KEY.test(safeKey)) {
        result[safeKey] = '[redacted]';
        continue;
      }
      result[safeKey] = sanitizeTelemetryValue(item, depth + 1);
    }
    return result;
  }
  return cleanString(value);
}

function boundedDetails(value) {
  const safe = sanitizeTelemetryValue(value ?? {});
  let json = JSON.stringify(safe);
  if (Buffer.byteLength(json, 'utf8') <= MAX_DETAILS_BYTES) return json;
  json = JSON.stringify({ truncated: true, preview: cleanString(json, MAX_DETAILS_BYTES - 200) });
  return json;
}

export function normalizeTelemetryEvent(raw = {}, req = null) {
  const now = new Date().toISOString();
  const occurred = new Date(String(raw.occurredAt || raw.occurred_at || now));
  const trace = cleanString(raw.traceId || raw.trace_id || req?.headers?.['x-yakolak-trace'] || '', 96);
  const request = cleanString(raw.requestId || raw.request_id || req?.headers?.['x-yakolak-request'] || '', 96);
  const room = cleanString(raw.roomCode || raw.room_code || '', 8);
  const seat = cleanString(raw.seat || '', 8);
  const source = cleanString(raw.source || 'client', 24).toLowerCase();
  const level = cleanString(raw.level || 'info', 16).toLowerCase();
  const eventName = cleanString(raw.eventName || raw.event_name || 'unknown', 120);
  return {
    eventId: cleanString(raw.eventId || raw.event_id || randomUUID(), 96),
    occurredAt: Number.isNaN(occurred.getTime()) ? now : occurred.toISOString(),
    receivedAt: now,
    traceId: TRACE_PATTERN.test(trace) ? trace : '',
    requestId: TRACE_PATTERN.test(request) ? request : '',
    roomCode: ROOM_PATTERN.test(room) ? room : '',
    seat: SEAT_PATTERN.test(seat) ? seat : '',
    source: ['browser', 'client', 'gameplay', 'server', 'network', 'integrity'].includes(source) ? source : 'client',
    level: ['debug', 'info', 'warn', 'error', 'fatal'].includes(level) ? level : 'info',
    eventName,
    roomVersion: cleanNumber(raw.roomVersion ?? raw.room_version),
    roundNumber: cleanNumber(raw.roundNumber ?? raw.round_number),
    moveNumber: cleanNumber(raw.moveNumber ?? raw.move_number),
    detailsJson: boundedDetails(raw.details),
    releaseSha: cleanString(raw.releaseSha || raw.release_sha || process.env.VERCEL_GIT_COMMIT_SHA || '', 64),
    userAgent: cleanString(req?.headers?.['user-agent'] || raw.userAgent || '', 480),
  };
}

export async function writeTelemetry(db, raw, req = null) {
  if (!db) return null;
  await ensureTelemetryTable(db);
  const event = normalizeTelemetryEvent(raw, req);
  await db.execute({
    sql: `INSERT OR IGNORE INTO ${TABLE} (
      event_id, occurred_at, received_at, trace_id, request_id, room_code, seat,
      source, level, event_name, room_version, round_number, move_number,
      details_json, release_sha, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      event.eventId, event.occurredAt, event.receivedAt, event.traceId || null,
      event.requestId || null, event.roomCode || null, event.seat || null,
      event.source, event.level, event.eventName, event.roomVersion,
      event.roundNumber, event.moveNumber, event.detailsJson,
      event.releaseSha || null, event.userAgent || null,
    ],
  });
  cleanupCounter += 1;
  if (cleanupCounter % 200 === 0) {
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
    db.execute({ sql: `DELETE FROM ${TABLE} WHERE occurred_at < ?`, args: [cutoff] }).catch(() => {});
  }
  return event;
}

export async function writeTelemetryBatch(db, events, req = null) {
  const accepted = [];
  for (const raw of events.slice(0, 50)) {
    try {
      const event = await writeTelemetry(db, raw, req);
      if (event) accepted.push(event);
    } catch (error) {
      console.error('[YAKOLAK_TELEMETRY_DB_ERROR]', error?.message || error);
    }
  }
  return accepted;
}

export const __testing = {
  TABLE,
  normalizeTelemetryEvent,
  sanitizeTelemetryValue,
};