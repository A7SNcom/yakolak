import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __testing } from '../api/_telemetry.js';

const monitor = fs.readFileSync(new URL('../scripts/telemetry_monitor.gd', import.meta.url), 'utf8');
const consoleCapture = fs.readFileSync(new URL('../scripts/telemetry_console_capture.gd', import.meta.url), 'utf8');
const watchdog = fs.readFileSync(new URL('../scripts/telemetry_watchdog.gd', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../scripts/rooms_observer_route.gd', import.meta.url), 'utf8');
const endpoint = fs.readFileSync(new URL('../api/telemetry.js', import.meta.url), 'utf8');
const observedServer = fs.readFileSync(new URL('../api/rooms-observed.js', import.meta.url), 'utf8');
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

for (const marker of [
  "browser.console.error",
  "browser.console.warn",
  "browser.console.runtime",
  "console.error =",
  "console.warn =",
]) {
  assert.ok(consoleCapture.includes(marker), `console capture is missing ${marker}`);
}

for (const marker of [
  "game.integrity.residue_detected",
  "game.integrity.move_counter_regressed",
  "gameplay.waiting_too_long",
  "online.reconnect_too_long",
  "game.integrity.missing_current_player",
]) {
  assert.ok(watchdog.includes(marker), `telemetry watchdog is missing ${marker}`);
}

assert.ok(route.includes("url.pathname = '/api/rooms-observed'"), 'online rooms must pass through the server-side recorder');
assert.ok(observedServer.includes("eventName: 'server.rooms.exchange'"), 'server must persist every room exchange');
assert.ok(observedServer.includes('[YAKOLAK_ROOM_TRACE]'), 'server exchanges must be searchable in Vercel logs');
assert.ok(observedServer.includes('sanitizeTelemetryValue'), 'server recorder must redact secrets before storage/logging');
assert.ok(observedServer.includes('TELEMETRY_DEADLINE_MS'), 'server telemetry must never be allowed to stall gameplay indefinitely');
assert.ok(endpoint.includes('writeTelemetryBatch'), 'telemetry endpoint must persist client batches');
assert.ok(endpoint.includes('[YAKOLAK_TRACE]'), 'client telemetry must also be searchable in Vercel runtime logs');

assert.ok(scene.includes('res://scripts/rooms_observer_route.gd'), 'server observer route must run in the main scene');
assert.ok(scene.includes('res://scripts/telemetry_monitor.gd'), 'telemetry monitor must run in the main scene');
assert.ok(scene.includes('res://scripts/telemetry_console_capture.gd'), 'Godot console capture must run in the main scene');
assert.ok(scene.includes('res://scripts/telemetry_watchdog.gd'), 'semantic watchdog must run in the main scene');
assert.ok(scene.indexOf('RoomsObserverRoute') < scene.indexOf('TelemetryMonitor'), 'server routing must be installed before browser fetch monitoring');
assert.ok(scene.indexOf('TelemetryMonitor') < scene.indexOf('TelemetryConsoleCapture'), 'raw telemetry must start before console capture');
assert.ok(scene.indexOf('TelemetryConsoleCapture') < scene.indexOf('TelemetryWatchdog'), 'console capture must start before semantic watchdog');
assert.ok(scene.indexOf('TelemetryWatchdog') < scene.indexOf('OnlineSession'), 'watchdog must start before online transport');
assert.ok(preset.includes('res://scripts/rooms_observer_route.gd'), 'server observer route must be exported to web');
assert.ok(preset.includes('res://scripts/telemetry_monitor.gd'), 'telemetry monitor must be exported to web');
assert.ok(preset.includes('res://scripts/telemetry_console_capture.gd'), 'console capture must be exported to web');
assert.ok(preset.includes('res://scripts/telemetry_watchdog.gd'), 'semantic watchdog must be exported to web');

console.log('YAKOLAK_TELEMETRY_CONTRACT_OK');