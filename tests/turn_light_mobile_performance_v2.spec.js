import { test, expect } from '@playwright/test';

const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];
const COLORS = ['marble', 'blue', 'gold', 'green'];
const FINAL_STATES = ['final', 'stable', 'immediate'];

test.use({ launchOptions: { args: ARGS } });

function board() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), {}]));
}

function room() {
  const players = Array.from({ length: 4 }, (_, i) => ({ seat: `p${i + 1}`, color: COLORS[i] }));
  return {
    code: '44', version: 1, protocol: 5, status: 'playing', targetPlayers: 4,
    targetRounds: 3, winsToMatch: 3, players, turnIndex: 0, board: board(),
    round: 1, completedRounds: 0,
    scores: Object.fromEntries(players.map(player => [player.seat, 0])),
    winner: null, draw: false, lastMove: null, moveNumber: 0,
    matchComplete: false, matchWinner: null, matchWinners: [],
    rematch: Object.fromEntries(players.map(player => [player.seat, false])),
  };
}

async function installApi(page) {
  const state = { current: room(), failPolls: 0 };
  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (state.failPolls > 0) {
        state.failPolls -= 1;
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

async function openRoom(page) {
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

async function push(page, state, values) {
  state.current = { ...structuredClone(state.current), ...structuredClone(values), version: Number(state.current.version) + 1 };
  await wake(page);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    return {
      authValid: d.yakolakAuthoritativeTurnValid || '',
      authPlayer: d.yakolakAuthoritativeTurnPlayer || '',
      authDirection: d.yakolakAuthoritativeTurnDirection || '',
      authRevision: d.yakolakAuthoritativeTurnRevision || '',
      lightOwner: d.yakolakTurnLightOwner || '',
      lightSource: d.yakolakTurnLightSource || '',
      lightPolling: d.yakolakTurnLightPolling || '',
      lightScope: d.yakolakTurnLightScope || '',
      lightState: d.yakolakTurnLightState || '',
      lightDirection: d.yakolakTurnLightDirection || '',
      lightRevision: d.yakolakTurnLightRevision || '',
      finalCount: d.yakolakTurnLightFinalCount || '',
      reducedMotion: d.yakolakTurnLightReducedMotion || '',
    };
  });
}

async function waitSettled(page, player, label) {
  await page.waitForFunction(({ player, finalStates }) => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' &&
      Number(d.yakolakAuthoritativeTurnPlayer) === player &&
      d.yakolakTurnLightRevision === d.yakolakAuthoritativeTurnRevision &&
      d.yakolakTurnLightDirection === d.yakolakAuthoritativeTurnDirection &&
      d.yakolakTurnLightFinalCount === '1' &&
      finalStates.includes(d.yakolakTurnLightState || '');
  }, { player, finalStates: FINAL_STATES }, { timeout: 15000 });
  const s = await snapshot(page);
  expect(s.lightOwner, `${label}: owner`).toBe('single-authoritative-controller');
  expect(s.lightSource, `${label}: source`).toBe('authoritative-turn-signal');
  expect(s.lightPolling, `${label}: lighting polling`).toBe('none');
  expect(s.lightScope, `${label}: scope`).toBe('localized-seat-spots');
  expect(s.lightDirection, `${label}: direction`).toBe(s.authDirection);
  expect(s.lightRevision, `${label}: revision`).toBe(s.authRevision);
  expect(s.finalCount, `${label}: one emphasized seat`).toBe('1');
  return s;
}

async function waitNeutral(page, label) {
  await page.waitForFunction(finalStates => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'false' &&
      d.yakolakTurnLightDirection === '' &&
      d.yakolakTurnLightFinalCount === '0' &&
      finalStates.includes(d.yakolakTurnLightState || '');
  }, FINAL_STATES, { timeout: 15000 });
  const s = await snapshot(page);
  expect(s.lightDirection, `${label}: stale direction`).toBe('');
  expect(s.finalCount, `${label}: neutral seats`).toBe('0');
  return s;
}

async function installSampler(page) {
  await page.evaluate(() => {
    window.__lighting12Perf2 = { phase: 'warmup', frames: [], states: [] };
    let previous = performance.now();
    let lastState = '';
    const tick = now => {
      const store = window.__lighting12Perf2;
      if (!store) return;
      const dt = now - previous;
      previous = now;
      if (dt > 0 && dt < 500) store.frames.push({ phase: store.phase, dt });
      const d = document.body.dataset;
      const row = {
        t: now, phase: store.phase,
        authRevision: d.yakolakAuthoritativeTurnRevision || '',
        authDirection: d.yakolakAuthoritativeTurnDirection || '',
        lightRevision: d.yakolakTurnLightRevision || '',
        lightDirection: d.yakolakTurnLightDirection || '',
        lightState: d.yakolakTurnLightState || '',
        finalCount: d.yakolakTurnLightFinalCount || '',
      };
      const key = JSON.stringify(row);
      if (key !== lastState) { store.states.push(row); lastState = key; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stableBaseline(page) {
  await page.waitForFunction(() => window.__lighting12Perf2.frames.filter(row => row.phase === 'warmup').length >= 45, null, { timeout: 15000 });
  await page.evaluate(() => {
    window.__lighting12Perf2.frames = [];
    window.__lighting12Perf2.states = [];
    window.__lighting12Perf2.phase = 'before';
  });
  await page.waitForFunction(() => window.__lighting12Perf2.frames.filter(row => row.phase === 'before').length >= 60, null, { timeout: 15000 });
}

async function phase(page, value) {
  await page.evaluate(value => { window.__lighting12Perf2.phase = value; }, value);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function stats(values) {
  if (!values.length) return { count: 0, mean: 0, p95: 0, max: 0, over50Ratio: 0 };
  return {
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p95: percentile(values, 0.95),
    max: Math.max(...values),
    over50Ratio: values.filter(value => value > 50).length / values.length,
  };
}

function observedDurations(states) {
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
  const data = await page.evaluate(() => window.__lighting12Perf2);
  const byPhase = name => data.frames.filter(row => row.phase === name).map(row => row.dt);
  return {
    before: stats(byPhase('before')),
    transition: stats(byPhase('transition')),
    after: stats(byPhase('after')),
    observedCrossfades: observedDurations(data.states),
    states: data.states,
  };
}

async function runMode(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true, reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const state = await installApi(page);
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(`console: ${message.text()}`);
  });
  try {
    await openRoom(page);
    const initial = await waitSettled(page, 1, `${reducedMotion ? 'reduced' : 'normal'}-p1`);
    expect(initial.reducedMotion).toBe(reducedMotion ? 'true' : 'false');
    if (reducedMotion) expect(initial.lightState).toBe('immediate');

    await installSampler(page);
    await stableBaseline(page);
    await phase(page, 'transition');

    await push(page, state, { turnIndex: 1 });
    const p2 = await waitSettled(page, 2, `${reducedMotion ? 'reduced' : 'normal'}-p2`);
    if (reducedMotion) expect(p2.lightState).toBe('immediate');

    await push(page, state, { turnIndex: 2 });
    if (reducedMotion) {
      const p3 = await waitSettled(page, 3, 'reduced-p3');
      expect(p3.lightState).toBe('immediate');
    } else {
      await page.waitForFunction(() => {
        const d = document.body.dataset;
        return d.yakolakAuthoritativeTurnPlayer === '3' &&
          d.yakolakTurnLightRevision === d.yakolakAuthoritativeTurnRevision &&
          d.yakolakTurnLightState === 'crossfading';
      }, null, { timeout: 15000 });
    }
    await push(page, state, { turnIndex: 3 });
    const p4 = await waitSettled(page, 4, `${reducedMotion ? 'reduced' : 'normal'}-p4`);
    if (reducedMotion) expect(p4.lightState).toBe('immediate');

    state.failPolls = 1;
    await wake(page);
    await waitNeutral(page, `${reducedMotion ? 'reduced' : 'normal'}-reconnect-neutral`);
    await push(page, state, { turnIndex: 3 });
    const restored = await waitSettled(page, 4, `${reducedMotion ? 'reduced' : 'normal'}-reconnect-p4`);
    if (reducedMotion) expect(restored.lightState).toBe('immediate');

    await phase(page, 'after');
    await page.waitForFunction(() => window.__lighting12Perf2.frames.filter(row => row.phase === 'after').length >= 60, null, { timeout: 15000 });
    const result = await collect(page);
    result.errors = errors;
    if (reducedMotion) {
      expect(result.states.filter(row => row.lightState === 'crossfading'), 'Reduced Motion crossfades').toEqual([]);
    }
    return result;
  } finally {
    await context.close();
  }
}

test('LIGHTING-12 stable mobile frame-time versus Reduced Motion control', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  const normal = await runMode(browser, false);
  const reduced = await runMode(browser, true);

  const report = {
    normal,
    reduced,
    derived: {
      normalP95DeltaMs: normal.transition.p95 - normal.before.p95,
      reducedP95DeltaMs: reduced.transition.p95 - reduced.before.p95,
      lightingSpecificP95DeltaMs: (normal.transition.p95 - normal.before.p95) - (reduced.transition.p95 - reduced.before.p95),
      normalOver50Delta: normal.transition.over50Ratio - normal.before.over50Ratio,
      reducedOver50Delta: reduced.transition.over50Ratio - reduced.before.over50Ratio,
    },
  };
  await testInfo.attach('lighting12-mobile-performance-v2.json', {
    body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json',
  });
  const concise = {
    normal: { before: normal.before, transition: normal.transition, after: normal.after, observedCrossfades: normal.observedCrossfades },
    reduced: { before: reduced.before, transition: reduced.transition, after: reduced.after },
    derived: report.derived,
  };
  console.log(`YAKOLAK_LIGHTING12_PERF_V2 ${JSON.stringify(concise)}`);
  console.log(`::notice title=LIGHTING-12 stable mobile metrics::${JSON.stringify(concise)}`);

  expect(normal.before.count, 'normal stable baseline').toBeGreaterThanOrEqual(60);
  expect(reduced.before.count, 'Reduced Motion stable baseline').toBeGreaterThanOrEqual(60);
  expect(normal.after.count, 'normal recovery sample').toBeGreaterThanOrEqual(60);
  expect(reduced.after.count, 'Reduced Motion recovery sample').toBeGreaterThanOrEqual(60);
  expect(normal.errors, `normal browser errors: ${JSON.stringify(normal.errors)}`).toEqual([]);
  expect(reduced.errors, `Reduced Motion browser errors: ${JSON.stringify(reduced.errors)}`).toEqual([]);

  // The direct Godot gate owns the exact 340ms tween-duration invariant and the
  // per-frame luminance envelope. Browser-observed duration is diagnostic here:
  // SwiftShader/CI can stretch rAF when the whole renderer stalls. Performance
  // fails only when Normal Motion regresses materially beyond BOTH its stable
  // baseline and the same transition workload with the tween disabled.
  const normalDelta = report.derived.normalP95DeltaMs;
  const reducedDelta = report.derived.reducedP95DeltaMs;
  const lightingDelta = report.derived.lightingSpecificP95DeltaMs;
  expect(normalDelta, 'Normal Motion p95 increase over stable baseline').toBeLessThanOrEqual(Math.max(20, reducedDelta + 20));
  expect(lightingDelta, 'crossfade-specific p95 cost above Reduced Motion control').toBeLessThanOrEqual(20);
  expect(normal.transition.over50Ratio - normal.before.over50Ratio, 'Normal Motion >50ms jank increase').toBeLessThanOrEqual(
    Math.max(0.08, (reduced.transition.over50Ratio - reduced.before.over50Ratio) + 0.05)
  );
  expect(normal.after.p95, 'Normal Motion frame time recovers after transitions').toBeLessThanOrEqual(Math.max(50, normal.before.p95 + 20));
});
