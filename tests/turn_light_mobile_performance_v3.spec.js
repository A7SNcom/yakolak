import { test, expect } from '@playwright/test';

const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];
const COLORS = ['marble', 'blue', 'gold', 'green'];
const FINAL_STATES = ['final', 'stable', 'immediate'];
const SAMPLE_WINDOW_MS = 3500;

test.use({ launchOptions: { args: ARGS } });

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), {}]));
}

function initialRoom() {
  const players = Array.from({ length: 4 }, (_, i) => ({ seat: `p${i + 1}`, color: COLORS[i] }));
  return {
    code: '44', version: 1, protocol: 5, status: 'playing', targetPlayers: 4,
    targetRounds: 3, winsToMatch: 3, players, turnIndex: 0, board: emptyBoard(),
    round: 1, completedRounds: 0,
    scores: Object.fromEntries(players.map(player => [player.seat, 0])),
    winner: null, draw: false, lastMove: null, moveNumber: 0,
    matchComplete: false, matchWinner: null, matchWinners: [],
    rematch: Object.fromEntries(players.map(player => [player.seat, false])),
  };
}

async function installRoomApi(page) {
  const state = { current: initialRoom(), failedPolls: 0 };
  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (state.failedPolls > 0) {
        state.failedPolls -= 1;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'online_server_error' }) });
      }
      const since = Number(new URL(request.url()).searchParams.get('since') || '-1');
      if (since >= Number(state.current.version)) return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat: 'p1', room: state.current }) });
    }
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: state.current }) });
    }
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'lighting12_unused_action' }) });
  });
  return state;
}

async function openOnlineRoom(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    document.body.dataset.yakolakIntro === 'complete' &&
    document.body.dataset.yakolakSetup === 'visible' &&
    document.body.dataset.yakolakSetupFlowStage === 'entry' &&
    typeof window.yakolakTestSetupFlowAction === 'function', null, { timeout: 60000 });
  await page.evaluate(() => window.yakolakTestSetupFlowAction('new'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'count');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('count', 4));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'mode:1');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 1, 'online'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'rounds');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('rounds', 3));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'color');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('continue'));
  await page.waitForFunction(() =>
    document.body.dataset.yakolakPlayers === '4' &&
    document.body.dataset.yakolakGameplay === 'ready' &&
    document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
    document.body.dataset.yakolakTurnLightOwner === 'single-authoritative-controller', null, { timeout: 30000 });
}

async function wake(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function pushRoom(page, state, patch) {
  state.current = { ...structuredClone(state.current), ...structuredClone(patch), version: Number(state.current.version) + 1 };
  await wake(page);
}

async function readLight(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    return {
      authValid: d.yakolakAuthoritativeTurnValid || '',
      authPlayer: d.yakolakAuthoritativeTurnPlayer || '',
      authDirection: d.yakolakAuthoritativeTurnDirection || '',
      authRevision: d.yakolakAuthoritativeTurnRevision || '',
      owner: d.yakolakTurnLightOwner || '', source: d.yakolakTurnLightSource || '',
      polling: d.yakolakTurnLightPolling || '', scope: d.yakolakTurnLightScope || '',
      state: d.yakolakTurnLightState || '', direction: d.yakolakTurnLightDirection || '',
      revision: d.yakolakTurnLightRevision || '', finalCount: d.yakolakTurnLightFinalCount || '',
      reducedMotion: d.yakolakTurnLightReducedMotion || '',
    };
  });
}

async function settled(page, player, label) {
  await page.waitForFunction(({ player, states }) => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' && Number(d.yakolakAuthoritativeTurnPlayer) === player &&
      d.yakolakTurnLightRevision === d.yakolakAuthoritativeTurnRevision &&
      d.yakolakTurnLightDirection === d.yakolakAuthoritativeTurnDirection &&
      d.yakolakTurnLightFinalCount === '1' && states.includes(d.yakolakTurnLightState || '');
  }, { player, states: FINAL_STATES }, { timeout: 15000 });
  const s = await readLight(page);
  expect(s.owner, `${label}: single owner`).toBe('single-authoritative-controller');
  expect(s.source, `${label}: authoritative source`).toBe('authoritative-turn-signal');
  expect(s.polling, `${label}: no lighting polling`).toBe('none');
  expect(s.scope, `${label}: localized spots`).toBe('localized-seat-spots');
  expect(s.direction, `${label}: focus direction`).toBe(s.authDirection);
  expect(s.revision, `${label}: focus revision`).toBe(s.authRevision);
  expect(s.finalCount, `${label}: active count`).toBe('1');
  return s;
}

async function neutral(page, label) {
  const handle = await page.waitForFunction(states => {
    const d = document.body.dataset;
    const matches = d.yakolakAuthoritativeTurnValid === 'false' &&
      d.yakolakTurnLightDirection === '' && d.yakolakTurnLightFinalCount === '0' &&
      states.includes(d.yakolakTurnLightState || '');
    if (!matches) return false;
    return {
      authValid: d.yakolakAuthoritativeTurnValid || '',
      direction: d.yakolakTurnLightDirection || '',
      finalCount: d.yakolakTurnLightFinalCount || '',
      state: d.yakolakTurnLightState || '',
    };
  }, FINAL_STATES, { timeout: 15000 });
  const snapshot = await handle.jsonValue();
  await handle.dispose();
  expect(snapshot.authValid, `${label}: authoritative turn temporarily invalid`).toBe('false');
  expect(snapshot.direction, `${label}: stale direction`).toBe('');
  expect(snapshot.finalCount, `${label}: all neutral`).toBe('0');
  expect(FINAL_STATES, `${label}: neutral lighting settled`).toContain(snapshot.state);
}

async function waitLightingAccepted(page, player) {
  await page.waitForFunction(player => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' && Number(d.yakolakAuthoritativeTurnPlayer) === player &&
      d.yakolakTurnLightRevision === d.yakolakAuthoritativeTurnRevision &&
      d.yakolakTurnLightDirection === d.yakolakAuthoritativeTurnDirection;
  }, player, { timeout: 15000 });
}

async function installSampler(page) {
  await page.evaluate(() => {
    window.__lighting12Perf3 = { phase: 'warmup', frames: [], states: [] };
    let previous = performance.now();
    let previousState = '';
    const tick = now => {
      const store = window.__lighting12Perf3;
      if (!store) return;
      const dt = now - previous;
      previous = now;
      if (dt > 0) store.frames.push({ phase: store.phase, dt });
      const d = document.body.dataset;
      const state = {
        t: now, phase: store.phase,
        authRevision: d.yakolakAuthoritativeTurnRevision || '',
        lightRevision: d.yakolakTurnLightRevision || '',
        lightDirection: d.yakolakTurnLightDirection || '',
        lightState: d.yakolakTurnLightState || '',
        finalCount: d.yakolakTurnLightFinalCount || '',
      };
      const key = JSON.stringify(state);
      if (key !== previousState) { store.states.push(state); previousState = key; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function collectFixedBaseline(page) {
  // Let WebGL/SwiftShader startup settle. Do not use the startup frames as a
  // baseline because they reflect renderer initialization rather than lighting.
  await page.waitForTimeout(SAMPLE_WINDOW_MS);
  await page.evaluate(() => {
    window.__lighting12Perf3.frames = [];
    window.__lighting12Perf3.states = [];
    window.__lighting12Perf3.phase = 'before';
  });
  await page.waitForTimeout(SAMPLE_WINDOW_MS);
}

async function setPhase(page, phase) {
  await page.evaluate(value => { window.__lighting12Perf3.phase = value; }, phase);
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function stats(values) {
  if (!values.length) return { count: 0, mean: 0, p95: 0, max: 0, over50Ratio: 0, effectiveFps: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    count: values.length, mean, p95: percentile(values, 0.95), max: Math.max(...values),
    over50Ratio: values.filter(value => value > 50).length / values.length,
    effectiveFps: mean > 0 ? 1000 / mean : 0,
  };
}

function observedCrossfades(states) {
  const starts = new Map();
  const result = [];
  for (const row of states) {
    if (!row.lightRevision) continue;
    if (row.lightState === 'crossfading' && !starts.has(row.lightRevision)) starts.set(row.lightRevision, row.t);
    if ((row.lightState === 'final' || row.lightState === 'stable') && starts.has(row.lightRevision)) {
      result.push({ revision: row.lightRevision, direction: row.lightDirection, durationMs: row.t - starts.get(row.lightRevision) });
      starts.delete(row.lightRevision);
    }
  }
  return result;
}

async function collect(page) {
  const data = await page.evaluate(() => window.__lighting12Perf3);
  const frames = phase => data.frames.filter(row => row.phase === phase).map(row => row.dt);
  return {
    before: stats(frames('before')), transition: stats(frames('transition')), after: stats(frames('after')),
    observedCrossfades: observedCrossfades(data.states), states: data.states,
  };
}

async function runMode(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true, reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const roomState = await installRoomApi(page);
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(`console: ${message.text()}`);
  });
  try {
    await openOnlineRoom(page);
    const initial = await settled(page, 1, `${reducedMotion ? 'reduced' : 'normal'}-p1`);
    expect(initial.reducedMotion).toBe(reducedMotion ? 'true' : 'false');
    if (reducedMotion) expect(initial.state).toBe('immediate');

    await installSampler(page);
    await collectFixedBaseline(page);
    await setPhase(page, 'transition');

    await pushRoom(page, roomState, { turnIndex: 1 });
    const p2 = await settled(page, 2, `${reducedMotion ? 'reduced' : 'normal'}-p2`);
    if (reducedMotion) expect(p2.state).toBe('immediate');

    await pushRoom(page, roomState, { turnIndex: 2 });
    await waitLightingAccepted(page, 3);
    if (reducedMotion) {
      const p3 = await settled(page, 3, 'reduced-p3');
      expect(p3.state).toBe('immediate');
    } else {
      await page.waitForFunction(() => document.body.dataset.yakolakTurnLightState === 'crossfading', null, { timeout: 15000 });
    }
    await pushRoom(page, roomState, { turnIndex: 3 });
    const p4 = await settled(page, 4, `${reducedMotion ? 'reduced' : 'normal'}-p4`);
    if (reducedMotion) expect(p4.state).toBe('immediate');

    roomState.failedPolls = 1;
    await wake(page);
    await neutral(page, `${reducedMotion ? 'reduced' : 'normal'}-reconnect-neutral`);
    await pushRoom(page, roomState, { turnIndex: 3 });
    const restored = await settled(page, 4, `${reducedMotion ? 'reduced' : 'normal'}-reconnect-p4`);
    if (reducedMotion) expect(restored.state).toBe('immediate');

    await setPhase(page, 'after');
    await page.waitForTimeout(SAMPLE_WINDOW_MS);
    const result = await collect(page);
    result.errors = errors;
    if (reducedMotion) expect(result.states.filter(row => row.lightState === 'crossfading')).toEqual([]);
    return result;
  } finally {
    await context.close();
  }
}

test('LIGHTING-12 mobile frame-time isolates crossfade cost with Reduced Motion control', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  const normal = await runMode(browser, false);
  const reduced = await runMode(browser, true);
  const normalP95Delta = normal.transition.p95 - normal.before.p95;
  const reducedP95Delta = reduced.transition.p95 - reduced.before.p95;
  const normalMeanDelta = normal.transition.mean - normal.before.mean;
  const reducedMeanDelta = reduced.transition.mean - reduced.before.mean;
  const report = {
    normal, reduced,
    derived: {
      normalP95DeltaMs: normalP95Delta, reducedP95DeltaMs: reducedP95Delta,
      lightingSpecificP95DeltaMs: normalP95Delta - reducedP95Delta,
      normalMeanDeltaMs: normalMeanDelta, reducedMeanDeltaMs: reducedMeanDelta,
      lightingSpecificMeanDeltaMs: normalMeanDelta - reducedMeanDelta,
      normalOver50Delta: normal.transition.over50Ratio - normal.before.over50Ratio,
      reducedOver50Delta: reduced.transition.over50Ratio - reduced.before.over50Ratio,
    },
  };
  await testInfo.attach('lighting12-mobile-performance-v3.json', {
    body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json',
  });
  const summary = {
    normal: { before: normal.before, transition: normal.transition, after: normal.after, observedCrossfades: normal.observedCrossfades },
    reduced: { before: reduced.before, transition: reduced.transition, after: reduced.after },
    derived: report.derived,
  };
  console.log(`YAKOLAK_LIGHTING12_PERF_V3 ${JSON.stringify(summary)}`);
  console.log(`::notice title=LIGHTING-12 stable mobile metrics::${JSON.stringify(summary)}`);

  // Sample-count floors are intentionally small because SwiftShader can render
  // this 3D scene slowly; every rAF stall is retained instead of being filtered.
  expect(normal.before.count, 'normal baseline samples').toBeGreaterThanOrEqual(5);
  expect(reduced.before.count, 'Reduced Motion baseline samples').toBeGreaterThanOrEqual(5);
  expect(normal.transition.count, 'normal transition samples').toBeGreaterThanOrEqual(5);
  expect(reduced.transition.count, 'Reduced Motion transition samples').toBeGreaterThanOrEqual(5);
  expect(normal.errors, `normal errors: ${JSON.stringify(normal.errors)}`).toEqual([]);
  expect(reduced.errors, `Reduced Motion errors: ${JSON.stringify(reduced.errors)}`).toEqual([]);

  // Exact transition duration and no-luminance-spike are enforced in the direct
  // Godot gate. Browser-observed crossfade duration remains diagnostic because
  // an all-renderer stall stretches rAF timestamps equally with the tween off.
  expect(normalP95Delta, 'Normal Motion p95 increase beyond baseline/control').toBeLessThanOrEqual(Math.max(20, reducedP95Delta + 20));
  expect(normalP95Delta - reducedP95Delta, 'crossfade-specific p95 cost').toBeLessThanOrEqual(20);
  expect(normalMeanDelta - reducedMeanDelta, 'crossfade-specific mean frame cost').toBeLessThanOrEqual(15);
  expect(normal.transition.over50Ratio - normal.before.over50Ratio, 'crossfade-specific visible jank').toBeLessThanOrEqual(
    Math.max(0.08, (reduced.transition.over50Ratio - reduced.before.over50Ratio) + 0.05)
  );
  expect(normal.after.p95, 'normal frame-time recovers after transitions').toBeLessThanOrEqual(Math.max(50, normal.before.p95 + 20));
});