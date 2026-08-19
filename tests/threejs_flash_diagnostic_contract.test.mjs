import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  FLASH_DIAGNOSTIC_CONTRACT,
  FLASH_DIAGNOSTIC_LABEL,
  FLASH_DIAGNOSTIC_SCHEMA,
  createDrawDiagnosticFixture,
  createNearWinDiagnosticFixture,
  createReconnectDiagnosticFixture,
  createSeatCountDiagnosticFixture,
  createSetupDiagnosticFixture,
  createTimeoutDiagnosticFixture,
  createWebglRecoveryDiagnosticFixture,
  runFlashDiagnostics,
} from './fixtures/threejs_flash_fixtures.mjs';
import { RULES, validatePlacementForSeat } from '../web/app/shared/rules.js';
import { assertCanonicalSessionState } from '../web/app/session/canonical-session-state.js';
import {
  SESSION_LIFECYCLE_INTERRUPTS,
  SESSION_LIFECYCLE_PHASES,
} from '../web/app/session/session-lifecycle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'tests/fixtures/threejs_flash_fixtures.mjs');
const runnerPath = path.join(root, 'scripts/run-threejs-flash-diagnostics.mjs');
const scanPath = path.join(root, 'scripts/pages-public-artifact-scan.sh');
const fixtureSource = readFileSync(fixturePath, 'utf8');
const runnerSource = readFileSync(runnerPath, 'utf8');
const scanSource = readFileSync(scanPath, 'utf8');

function walkFiles(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(fullPath));
    else if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

function assertFixtureEnvelope(fixture, name) {
  assert.equal(fixture.schema, FLASH_DIAGNOSTIC_SCHEMA);
  assert.equal(fixture.label, FLASH_DIAGNOSTIC_LABEL);
  assert.equal(fixture.diagnosticOnly, true);
  assert.equal(fixture.authoritativeOnline, false);
  assert.equal(fixture.networkCapability, 'none');
  assert.equal(fixture.roomMutationCapability, 'none');
  assert.equal(fixture.name, name);
}

assert.equal(FLASH_DIAGNOSTIC_SCHEMA, 'yakolak.flash-diagnostic/v1');
assert.equal(FLASH_DIAGNOSTIC_LABEL, 'FLASH DIAGNOSTIC — NOT A LIVE ROOM');
assert.deepEqual(FLASH_DIAGNOSTIC_CONTRACT, {
  schema: FLASH_DIAGNOSTIC_SCHEMA,
  label: FLASH_DIAGNOSTIC_LABEL,
  diagnosticOnly: true,
  authoritativeOnline: false,
  networkCapability: 'none',
  persistenceCapability: 'none',
  roomMutationCapability: 'none',
  productionUiEntryPoint: false,
  pagesArtifactAllowed: false,
});

// Every requested fixture is constructed as valid THREEJS-045 state, not as an ad-hoc
// object that merely looks like gameplay state.
const setup = createSetupDiagnosticFixture();
assertFixtureEnvelope(setup, 'setup');
assertCanonicalSessionState(setup.payload.state);
assert.equal(setup.payload.state.lifecycle.phase, SESSION_LIFECYCLE_PHASES.SETUP);
assert.equal(setup.payload.state.targetPlayers, 3);
assert.equal(setup.payload.state.preferredColor, 'marble');

for (const playerCount of RULES.playerCounts) {
  const fixture = createSeatCountDiagnosticFixture(playerCount);
  assertFixtureEnvelope(fixture, `${playerCount}-seat`);
  assertCanonicalSessionState(fixture.payload.state);
  assert.equal(fixture.payload.state.seats.length, playerCount);
  assert.equal(fixture.payload.state.targetPlayers, playerCount);
  assert.equal(fixture.payload.legalProbe.ok, true);
}

const nearWin = createNearWinDiagnosticFixture();
assertFixtureEnvelope(nearWin, 'near-win');
assertCanonicalSessionState(nearWin.payload.state);
assert.equal(nearWin.payload.state.board['0'].medium, 'marble');
assert.equal(nearWin.payload.state.board['1'].medium, 'marble');
assert.equal(nearWin.payload.state.board['2'].medium, undefined);
assert.deepEqual(nearWin.payload.move, { cell: 2, size: 'medium' });
assert.equal(validatePlacementForSeat(
  nearWin.payload.state,
  nearWin.payload.state.activeSeatId,
  nearWin.payload.move,
).ok, true);

const draw = createDrawDiagnosticFixture();
assertFixtureEnvelope(draw, 'draw');
assertCanonicalSessionState(draw.payload.state);
assert.deepEqual(draw.payload.move, { cell: 2, size: 'small' });
assert.equal(draw.payload.legality.ok, true);

const timeout = createTimeoutDiagnosticFixture();
assertFixtureEnvelope(timeout, 'timeout');
assertCanonicalSessionState(timeout.payload.state);
assert.equal(timeout.payload.state.deadlineAtMs, 1_000);
assert.equal(timeout.payload.nowMs, 1_001);
assert.equal(timeout.payload.attempt.intent.kind, 'timeout');
assert.equal(timeout.payload.attempt.intent.authority.adapter, 'local');

const reconnect = createReconnectDiagnosticFixture();
assertFixtureEnvelope(reconnect, 'reconnect');
for (const state of [reconnect.payload.before, reconnect.payload.interrupted, reconnect.payload.hydrated, reconnect.payload.recovered]) {
  assertCanonicalSessionState(state);
}
assert.equal(reconnect.payload.interrupted.lifecycle.interrupt, SESSION_LIFECYCLE_INTERRUPTS.RECONNECT);
assert.equal(reconnect.payload.recovered.lifecycle.interrupt, null);
assert.equal(
  reconnect.payload.recovered.lifecycle.presentationGeneration,
  reconnect.payload.before.lifecycle.presentationGeneration + 2,
);
assert.deepEqual(reconnect.payload.recovered.board, reconnect.payload.before.board);
assert.equal(reconnect.payload.recovered.revision, reconnect.payload.before.revision);

const webgl = createWebglRecoveryDiagnosticFixture();
assertFixtureEnvelope(webgl, 'webgl-recovery');
for (const state of [webgl.payload.before, webgl.payload.interrupted, webgl.payload.hydrated, webgl.payload.recovered]) {
  assertCanonicalSessionState(state);
}
assert.equal(webgl.payload.interrupted.lifecycle.interrupt, SESSION_LIFECYCLE_INTERRUPTS.CONTEXT_LOST);
assert.equal(webgl.payload.recovered.lifecycle.interrupt, null);
assert.equal(
  webgl.payload.recovered.lifecycle.presentationGeneration,
  webgl.payload.before.lifecycle.presentationGeneration + 2,
);
assert.deepEqual(webgl.payload.recovered.board, webgl.payload.before.board);
assert.equal(webgl.payload.recovered.revision, webgl.payload.before.revision);

// Full harness executes 046 legality, the canonical local-authority path, and 044 pure
// transition parity for move fixtures. The fixture library itself decides no gameplay rule.
const suite = await runFlashDiagnostics();
assertFixtureEnvelope(suite, 'flash-suite');
assert.equal(suite.payload.seatCounts.length, 3);
assert.deepEqual(suite.payload.seatCounts.map(fixture => fixture.payload.state.seats.length), [2, 3, 4]);

assert.equal(suite.payload.nearWin.payload.outcome, 'round-win');
assertCanonicalSessionState(suite.payload.nearWin.payload.snapshot);
assert.equal(suite.payload.nearWin.payload.snapshot.board['2'].medium, 'marble');
assert.deepEqual(suite.payload.nearWin.payload.snapshot.winner, { seatId: 'right', color: 'marble' });
assert.equal(suite.payload.nearWin.payload.snapshot.scores.right, 1);

assert.equal(suite.payload.draw.payload.outcome, 'draw');
assertCanonicalSessionState(suite.payload.draw.payload.snapshot);
assert.equal(suite.payload.draw.payload.snapshot.draw, true);
assert.equal(suite.payload.draw.payload.snapshot.winner, null);
assert.equal(suite.payload.draw.payload.snapshot.activeSeatId, null);

assert.equal(suite.payload.timeout.payload.outcome, 'timeout');
assertCanonicalSessionState(suite.payload.timeout.payload.snapshot);
assert.equal(suite.payload.timeout.payload.snapshot.activeSeatId, 'back');
assert.equal(suite.payload.timeout.payload.snapshot.revision, 41);

const matchEnd = suite.payload.matchEnd.payload.matchEndSnapshot;
assertCanonicalSessionState(matchEnd);
assert.equal(matchEnd.lifecycle.phase, SESSION_LIFECYCLE_PHASES.MATCH_END);
assert.equal(matchEnd.matchComplete, true);
assert.deepEqual(matchEnd.matchWinner, { seatId: 'right', color: 'marble', wins: 3 });
assert.equal(matchEnd.scores.right, 3);
assert.equal(matchEnd.activeSeatId, null);
assert.equal(matchEnd.deadlineAtMs, null);

// Fixture source imports the real 044/045/046 stack. Reject common signatures of a copied
// rules table/engine so diagnostics cannot quietly fork gameplay semantics.
assert.match(fixtureSource, /from '\.\.\/\.\.\/web\/app\/shared\/rules\.js'/);
assert.match(fixtureSource, /from '\.\.\/\.\.\/web\/app\/shared\/transitions\.js'/);
assert.match(fixtureSource, /from '\.\.\/\.\.\/web\/app\/session\/canonical-session-state\.js'/);
assert.match(fixtureSource, /validatePlacementForSeat/);
assert.match(fixtureSource, /applyMoveTransition/);
assert.match(fixtureSource, /createLocalAuthorityAdapter/);
assert.doesNotMatch(fixtureSource, /const\s+RULES_DATA\s*=/);
assert.doesNotMatch(fixtureSource, /const\s+LINES\s*=/);
assert.doesNotMatch(fixtureSource, /gradedOrders\s*:/);
assert.doesNotMatch(fixtureSource, /copiesPerSizePerColor\s*:/);
assert.doesNotMatch(fixtureSource, /function\s+(validatePlacement|winningPatterns|hasLegalMove)\s*\(/);

// Repository/manual-only harness has no live room, online transport, secret/config or admin
// capability. The only authority adapter used is the in-memory local adapter.
for (const source of [fixtureSource, runnerSource]) {
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bWebSocket\b|XMLHttpRequest|EventSource/);
  assert.doesNotMatch(source, /canonical-online-session|toRoomsApiSubmission/);
  assert.doesNotMatch(source, /public-runtime-config|API_ORIGIN/);
  assert.doesNotMatch(source, /\/api\/|backend\/|admin/i);
  assert.doesNotMatch(source, /github_pat_|gh[pousr]_|BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY|sk_live_/);
}
assert.match(runnerSource, /FLASH_DIAGNOSTIC_LABEL/);
assert.match(runnerSource, /No live-room\/network capability/);

// Production browser files have no diagnostic entry point, import or visible debug control.
const webFiles = walkFiles(path.join(root, 'web'))
  .filter(file => /\.(?:js|mjs|html|css)$/i.test(file));
for (const file of webFiles) {
  const source = readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /threejs_flash_fixtures|run-threejs-flash-diagnostics|yakolak\.flash-diagnostic|FLASH DIAGNOSTIC/,
    `production web file must not expose FLASH diagnostics: ${path.relative(root, file)}`);
}

// PAGES-009 already forbids the exact repository-only roots used by 043. Keep this as an
// executable boundary proof on platforms with bash and as a source-contract proof everywhere.
assert.match(scanSource, /-name 'scripts'/);
assert.match(scanSource, /-name 'tests'/);
assert.match(scanSource, /server-only, credential-shaped, or developer-only paths are present/);

if (process.platform !== 'win32') {
  const temp = mkdtempSync(path.join(tmpdir(), 'yakolak-flash-pages-scan-'));
  try {
    mkdirSync(path.join(temp, 'tests'), { recursive: true });
    writeFileSync(path.join(temp, 'tests', 'flash-fixture.txt'), 'diagnostic-only\n');
    const scanned = spawnSync('bash', [scanPath, temp], { encoding: 'utf8' });
    assert.notEqual(scanned.status, 0, 'PAGES-009 must reject diagnostic tests from a Pages artifact');
    assert.match(`${scanned.stdout}\n${scanned.stderr}`, /PAGES-009 public artifact scan failed/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

console.log('THREEJS-043 public-safe FLASH diagnostic contract: PASS');
