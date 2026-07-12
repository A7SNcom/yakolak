import { createClient } from '@libsql/client';
import { cloneDefaultCalibration } from '../config/calibration-v092.js';

const TABLE = 'yakolak_calibration';
const RECORD_ID = 'published';
const MAX_BODY_BYTES = 300_000;
let client;
let tableReady;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
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
      id TEXT PRIMARY KEY,
      build INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      calibration TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

function validCalibration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const required = ['scene', 'room', 'game', 'table', 'lights', 'play'];
  if (!required.every(key => key in value)) return false;
  const serialized = JSON.stringify(value);
  return serialized.length > 10 && Buffer.byteLength(serialized, 'utf8') <= MAX_BODY_BYTES;
}

function fallbackMeta(reason = 'database_not_configured') {
  return {
    id: RECORD_ID,
    build: 92,
    note: 'yakolak v092 recovered calibration fallback',
    updatedAt: null,
    storage: 'fallback',
    reason
  };
}

async function readCalibration(db) {
  await ensureTable(db);
  const result = await db.execute({
    sql: `SELECT id, build, note, calibration, updated_at FROM ${TABLE} WHERE id = ? LIMIT 1`,
    args: [RECORD_ID]
  });
  const row = result.rows?.[0];
  if (!row) return null;
  return {
    calibration: JSON.parse(String(row.calibration)),
    meta: {
      id: String(row.id),
      build: Number(row.build),
      note: String(row.note || ''),
      updatedAt: String(row.updated_at),
      storage: 'turso'
    }
  };
}

async function writeCalibration(db, calibration, build, note) {
  await ensureTable(db);
  const updatedAt = new Date().toISOString();
  await db.execute({
    sql: `
      INSERT INTO ${TABLE} (id, build, note, calibration, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        build = excluded.build,
        note = excluded.note,
        calibration = excluded.calibration,
        updated_at = excluded.updated_at
    `,
    args: [RECORD_ID, build, note, JSON.stringify(calibration), updatedAt]
  });
  return { id: RECORD_ID, build, note, updatedAt, storage: 'turso' };
}

function isAuthorized(req) {
  const expected = process.env.CALIBRATION_ADMIN_TOKEN;
  if (!expected) return true;
  const supplied = req.headers['x-calibration-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return supplied === expected;
}

export default async function handler(req, res) {
  res.setHeader('allow', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const db = getClient();
    if (!db) {
      json(res, 200, { ok: true, calibration: cloneDefaultCalibration(), meta: fallbackMeta() });
      return;
    }
    try {
      const stored = await readCalibration(db);
      json(res, 200, stored
        ? { ok: true, ...stored }
        : { ok: true, calibration: cloneDefaultCalibration(), meta: fallbackMeta('record_not_created') });
    } catch (error) {
      console.error('[Yakolak] calibration read failed', error);
      json(res, 200, { ok: true, calibration: cloneDefaultCalibration(), meta: fallbackMeta('database_read_failed') });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!isAuthorized(req)) {
      json(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    const db = getClient();
    if (!db) {
      json(res, 503, { ok: false, error: 'database_not_configured' });
      return;
    }
    try {
      const body = parseBody(req);
      if (!validCalibration(body.calibration)) {
        json(res, 400, { ok: false, error: 'invalid_calibration' });
        return;
      }
      const build = Number.isFinite(Number(body.build)) ? Math.max(1, Math.round(Number(body.build))) : 92;
      const note = String(body.note || 'yakolak published calibration').slice(0, 500);
      const meta = await writeCalibration(db, body.calibration, build, note);
      json(res, 200, { ok: true, calibration: body.calibration, meta });
    } catch (error) {
      const status = error?.message === 'payload_too_large' ? 413 : 500;
      console.error('[Yakolak] calibration write failed', error);
      json(res, status, { ok: false, error: status === 413 ? 'payload_too_large' : 'database_write_failed' });
    }
    return;
  }

  json(res, 405, { ok: false, error: 'method_not_allowed' });
}
