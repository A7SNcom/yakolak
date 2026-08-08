import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __testing } from '../api/_telemetry.js';

const monitor = fs.readFileSync(new URL('../scripts/telemetry_monitor.gd', import.meta.url), 'utf8');
const endpoint = fs.readFileSync(new URL('../api/telemetry.js', import.meta.url), 'utf8');
const scene = fs.readFileSync(new URL('../scenes/intro.tscn', import.meta.url), 'utf8');
const preset = fs.readFileSync(new URL('../export_presets.cfg', import.meta.url), 'utf8');

assert.equal(__testing.TABLE, 'yakolak_online_telemetry_v1');

const sanitized = __testing.sanitizeTelemetryValue({
  token: 'secret-token',
  authorization: 'Bearer abc',
  nested: { password: 'secret', cell: 4, size: 'large' },
});
assert.equal(sanitized.token, '[redacted]');
assert.equal(sanitized.authorization, '[redacted]');
assert.equal(sanitized.nested.password, '[redacted]');
assert.equal(sanitized.nested.cell, 4);
assert.equal(sanitized.nested.size, 'large');

const normalized = __testing.normalizeTelemetryEvent({
  traceId: 'trace-123456',
  requestId: 'request-123456',
  roomCode: '42',
  seat: 'p2',
  source: 'network',
  level: 'error',
  eventName: 'online.http.failure',
  roomVersion: 7,
  roundNumber: 2,
  moveNumber: 8,
  details: { clientToken: 'must-not-leak', cell: 3 },
});
assert.equal(normalized.roomCode, '42');
assert.equal(normalized.seat, 'p2');
assert.equal(normalized.roomVersion, 7);
assert.match(normalized.detailsJson, /\[redacted\]/);
assert.doesNotMatch(normalized.detailsJson, /must-not-leak/);

for (const marker of [
  'window.__yakolakTraceId',
  'window.yakolakTelemetry',
  "online.http.request",
  "online.http.response",
  "online.http.failure",
  "game.state.snapshot",
  "browser.javascript.error",
  "browser.unhandledrejection",
  "browser.webgl.context_lost",
  "browser.long_task",
  "player.pointer",
  "x-yakolak-trace",
  "x-yakolak-request",
  "navigator.sendBeacon",
]) {
  assert.ok(monitor.includes(marker), `telemetry monitor is missing ${marker}`);
}

assert.ok(endpoint.includes('writeTelemetryBatch'), 'telemetry endpoint must persist batches');
assert.ok(endpoint.includes('[YAKOLAK_TRACE]'), 'telemetry must also be searchable in Vercel runtime logs');
assert.ok(scene.includes('res://scripts/telemetry_monitor.gd'), 'telemetry monitor must run in the main scene');
assert.ok(scene.indexOf('TelemetryMonitor') < scene.indexOf('OnlineSession'), 'telemetry must start before online transport');
assert.ok(preset.includes('res://scripts/telemetry_monitor.gd'), 'telemetry monitor must be exported to web');

console.log('YAKOLAK_TELEMETRY_CONTRACT_OK');