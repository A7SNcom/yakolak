import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  AUTHORITY_SCHEMA_STATEMENTS,
  AUTHORITY_SCHEMA_VERSION,
  AUTHORITY_TABLES,
  PROBE_TABLE,
  authorityMigrationStatement,
} from '../backend/cloudflare/src/authoritative-schema.js';

function applyStatement(db, statement) {
  if (typeof statement === 'string') {
    db.exec(statement);
    return;
  }
  db.prepare(statement.sql).run(...(statement.args || []));
}

function applyAuthorityMigration(db, appliedAtMs) {
  for (const statement of AUTHORITY_SCHEMA_STATEMENTS) applyStatement(db, statement);
  applyStatement(db, authorityMigrationStatement(appliedAtMs));
}

function schemaObjectNames(db) {
  return new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')")
      .all()
      .map(row => String(row.name)),
  );
}

test('THREEJS-063 / PAGES-015 migration is additive, idempotent, and preserves the rollback probe contract byte-for-byte', () => {
  const db = new DatabaseSync(':memory:');
  try {
    // Simulate the previous rollback Worker having created and populated the
    // exact PAGES-005 probe table before any THREEJS authority migration exists.
    db.exec(`CREATE TABLE ${PROBE_TABLE} (
      room_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      integrity TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    const legacyRow = {
      roomId: 'p005-0123456789abcdef0123456789abcdef',
      payload: '{"probe":true,"generation":"rollback"}',
      integrity: 'legacy-integrity',
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:01.000Z',
    };
    db.prepare(`INSERT INTO ${PROBE_TABLE}
      (room_id, payload_json, integrity, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run(
        legacyRow.roomId,
        legacyRow.payload,
        legacyRow.integrity,
        legacyRow.createdAt,
        legacyRow.updatedAt,
      );

    for (const statement of AUTHORITY_SCHEMA_STATEMENTS) {
      const sql = String(statement).trim();
      assert.match(
        sql,
        /^CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS\b/i,
        `authority migration must remain expand-only, got: ${sql.slice(0, 80)}`,
      );
      assert.doesNotMatch(sql, /\b(?:DROP|RENAME|REPLACE|TRUNCATE)\b/i);
      assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i);
    }
    const ledgerWrite = authorityMigrationStatement(1_000);
    assert.match(ledgerWrite.sql, /^INSERT OR IGNORE\b/i);

    applyAuthorityMigration(db, 1_000);
    applyAuthorityMigration(db, 2_000); // replay must be harmless during deploy/rollback overlap

    const probeColumns = db.prepare(`PRAGMA table_info(${PROBE_TABLE})`).all().map(row => ({
      name: String(row.name),
      type: String(row.type),
      notnull: Number(row.notnull),
      pk: Number(row.pk),
    }));
    assert.deepEqual(probeColumns, [
      { name: 'room_id', type: 'TEXT', notnull: 0, pk: 1 },
      { name: 'payload_json', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'integrity', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'created_at', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'updated_at', type: 'TEXT', notnull: 1, pk: 0 },
    ]);

    const preserved = db.prepare(`SELECT room_id, payload_json, integrity, created_at, updated_at
      FROM ${PROBE_TABLE} WHERE room_id = ?`).get(legacyRow.roomId);
    assert.deepEqual(preserved, {
      room_id: legacyRow.roomId,
      payload_json: legacyRow.payload,
      integrity: legacyRow.integrity,
      created_at: legacyRow.createdAt,
      updated_at: legacyRow.updatedAt,
    });

    const names = schemaObjectNames(db);
    assert.equal(names.has(PROBE_TABLE), true);
    for (const table of Object.values(AUTHORITY_TABLES)) {
      assert.equal(names.has(table), true, `missing additive authority table ${table}`);
    }

    const migrations = db.prepare(`SELECT schema_version, migration_name, applied_at_ms
      FROM ${AUTHORITY_TABLES.migrations}`).all();
    assert.deepEqual(migrations, [{
      schema_version: AUTHORITY_SCHEMA_VERSION,
      migration_name: 'threejs-063-authority-v1',
      applied_at_ms: 1_000,
    }]);
  } finally {
    db.close();
  }
});
