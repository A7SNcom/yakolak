import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoomName, validRoomName } from '../src/room-name-v126.js';

test('normalizes Arabic room names without losing their identity', () => {
  assert.equal(normalizeRoomName('  جمعة   الأصدقاء  '), 'جمعة الأصدقاء');
  assert.equal(validRoomName('مجلسنا'), true);
  assert.equal(validRoomName('أ'), false);
});

test('caps names at 32 Unicode characters and removes controls', () => {
  const normalized = normalizeRoomName(`غرفة\u0000 ${'س'.repeat(40)}`);
  assert.equal(Array.from(normalized).length, 32);
  assert.equal(normalized.includes('\u0000'), false);
});
