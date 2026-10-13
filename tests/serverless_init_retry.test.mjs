import assert from 'node:assert/strict';
import { test } from 'node:test';
import { __testing as rooms } from '../api/rooms.js';
import { __testing as telemetry } from '../api/_telemetry.js';

test('room table initialization retries after a transient database error', async () => {
  let failed = false;
  const first = { execute: async () => {
    if (!failed) {
      failed = true;
      throw new Error('transient database failure');
    }
  } };
  await assert.rejects(rooms.ensureTable(first), /transient database failure/);

  let statements = 0;
  await rooms.ensureTable({ execute: async () => { statements += 1; } });
  assert.equal(statements, 3);
});

test('telemetry table initialization retries after a transient database error', async () => {
  let failed = false;
  const first = { execute: async () => {
    if (!failed) {
      failed = true;
      throw new Error('transient database failure');
    }
  } };
  await assert.rejects(telemetry.ensureTelemetryTable(first), /transient database failure/);

  let statements = 0;
  await telemetry.ensureTelemetryTable({ execute: async () => { statements += 1; } });
  assert.equal(statements, 4);
});
