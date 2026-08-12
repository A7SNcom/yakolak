import { test, expect } from '@playwright/test';

const BROWSER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage',
];
const COLORS = ['marble', 'blue', 'gold', 'green'];
const SETTLED = new Set(['final', 'stable', 'immediate']);

test.use({ launchOptions: { args: BROWSER_ARGS } });

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), {}]));
}

function makeRoom() {
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
  const state = { current: makeRoom(), reconnectFailures: 0 };
  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (state.reconnectFailures > 0) {
        state.reconnectFailures -= 1;
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
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'unused_by_lighting_performance_gate' }) });
  });
  return state;
}

async function openRoom(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
      document.body.dataset.yakolakSetup === 'visible' &&
      document.body.dataset.yakolakSetupFlowStage === 'entry' &&
      typeof window.yakolakTestSetupFlowAction === 'function',
    null,
    { timeout: 60000 }
  );
  await page.evaluate(() => window.yakolakTestSetupFlowAction('new'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'count');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('count', 4));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'mode:1');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 1, 'online'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'rounds');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('rounds', 3));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'color');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('continue'));
  await page.waitForFunction(
    () => document.body.dataset.yakolakPlayers === '4' &&
      document.body.dataset.yakolakGameplay === 'ready' &&
      document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
      document.body.dataset.yakolakTurnLightOwner === 'single-authoritative-controller',
    null,
    { timeout: 30000 }
  );
}

async function wake(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function pushRoom(page, state, overrides) {
  state.current = { ...structuredClone(state.current), ...structuredClone(overrides), version: Number(state.current.version) + 1 };
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
      authLifecycle: d.yakolakAuthoritativeTurnLifecycle || '',
      lightOwner: d.yakolakTurnLightOwner || '',
      lightSource: d.yakolakTurnLightSource || '',
      lightPolling: d.yakolakTurnLightPolling || '',
      lightScope: d.yakolakTurnLightScope || '',
      lightState: d.yakolakTurnLightState || '',
      lightDirection: d.yakolakTurnLightDirection || '',
      lightRevision: d.yakolakTurnLightRevision || '',
      lightFinalCount: d.yakolakTurnLightFinalCount || '',
      reducedMotion: d.yakolakTurnLightReducedMotion || '',
    };
  });
}

async function settled(page, expectedPlayer, label) {
  await page.waitForFunction(({ player, states }) => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' &&
      Number(d.yakolakAuthoritativeTurnPlayer) === player &&
      d.yakolakTurnLightRevision === d.yakolakAuthoritativeTurnRevision &&
      d.yakolakTurnLightDirection === d.yakolakAuthoritativeTurnDirection &&
      d.yakolakTurnLightFinalCount === '1' &&
      states.includes(d.yakolakTurnLightState || '');
  }, { player: expectedPlayer, states: [...SETTLED] }, { timeout: 15000 });
  const s = await snapshot(page);
  expect(s.lightOwner, `${label}: single owner`).toBe('single-authoritative-controller');
  expect(s.lightSource, `${label}: authoritative source`).toBe('authoritative-turn-signal');
  expect(s.lightPolling, `${label}: no lighting polling`).toBe('none');
  expect(s.lightScope, `${label}: localized seat lighting`).toBe('localized-seat-spots');
  expect(s.lightDirection, `${label}: rendered focus follows authoritative direction`).toBe(s.authDirection);
  expect(s.lightRevision, `${label}: rendered focus follows authoritative revision`).toBe(s.authRevision);
  expect(s.lightFinalCount, `${label}: exactly one active seat`).toBe('1');
  return s;
}

async function neutral(page, label) {
  await page.waitForFunction(states => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'false' &&
      d.yakolakTurnLightDirection === '' &&
      d.yakolakTurnLightFinalCount === '0' &&
      states.includes(d.yakolakTurnLightState || '');
  }, [...SETTLED], { timeout: 15000 });
  const s = await snapshot(page);
  expect(s.lightDirection, `${label}: no stale focused seat`).toBe('');
  expect(s.lightFinalCount, `${label}: all seats neutral`).toBe('0');
  return s;
}

async function crossfading(page, expectedPlayer) {
  await page.waitForFunction(player => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' &&
      Number(d.yakolakAuthoritativeTurnPlayer) === player &&
      d.yakolakTurnLightRevision === d.yakolakAuthoritativeTurnRevision &&
      d.yakolakTurnLightState === 'crossfading';
  }, expectedPlayer, { timeout: 15000 });
}

async function installSampler(page) {
  await page.evaluate(() => {
    window.__lighting12Perf = { phase: 'before', frames: [], states: [] };
    let previous = performance.now();
    let lastState = '';
    const tick = now => {
      const store = window.__lighting12Perf;
      if (!store) return;
      const dt = now - previous;
      previous = now;
      if (dt > 0 && dt < 500) store.frames.push({ phase: store.phase, dt });
      const d = document.body.dataset;
      const row = {
        t: now,
        phase: store.phase,
        authRevision: d.yakolakAuthoritativeTurnRevision || '',
        authDirection: d.yakolakAuthoritativeTurnDirection || '',
        authValid: d.yakolakAuthoritativeTurnValid || '',
        lightRevision: d.yakolakTurnLightRevision || '',
        lightDirection: d.yakolakTurnLightDirection || '',
        lightState: d.yakolakTurnLightState || '',
        lightFinalCount: d.yakolakTurnLightFinalCount || '',
      };
      const key = JSON.stringify(row);
      if (key !== lastState) {
        store.states.push(row);
        lastState = key;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function setPhase(page, phase) {
  await page.evaluate(value => { window.__lighting12Perf.phase = value; }, phase);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function summarize(values) {
  if (!values.length) return { count: 0, mean: 0, p95: 0, max: 0, over50Ratio: 0 };
  return {
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p95: percentile(values, 0.95),
    max: Math.max(...values),
    over50Ratio: values.filter(value => value > 50).length / values.length,
  };
}

function durations(states) {
  const starts = new Map();
  const out = [];
  for (const row of states) {
    if (!row.lightRevision) continue;
    if (row.lightState === 'crossfading' && !starts.has(row.lightRevision)) starts.set(row.lightRevision, row.t);
    if ((row.lightState === 'final' || row.lightState === 'stable') && starts.has(row.lightRevision)) {
      out.push({ revision: row.lightRevision, durationMs: row.t - starts.get(row.lightRevision), direction: row.lightDirection });
      starts.delete(row.lightRevision);
    }
  }
  return out;
}

async function metrics(page, testInfo) {
  const data = await page.evaluate(() => window.__lighting12Perf);
  const frameValues = phase => data.frames.filter(row => row.phase === phase).map(row => row.dt);
  const before = summarize(frameValues('before'));
  const transition = summarize(frameValues('transition'));
  const after = summarize(frameValues('after'));
  const result = {
    before,
    transition,
    after,
    transitionVsBeforeP95Ms: transition.p95 - before.p95,
    afterVsBeforeP95Ms: after.p95 - before.p95,
    transitionDurations: durations(data.states),
    states: data.states,
  };
  await testInfo.attach('lighting12-mobile-performance.json', {
    body: Buffer.from(JSON.stringify(result, null, 2)),
    contentType: 'application/json',
  });
  const concise = { ...result, states: undefined };
  console.log(`YAKOLAK_LIGHTING12_BROWSER_METRICS ${JSON.stringify(concise)}`);
  console.log(`::notice title=LIGHTING-12 mobile metrics::${JSON.stringify(concise)}`);
  return result;
}

test('mobile portrait lighting remains authoritative and frame-safe', async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true, reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const state = await installRoomApi(page);
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('favicon')) browserErrors.push(`console: ${message.text()}`);
  });

  try {
    await openRoom(page);
    await settled(page, 1, 'initial-p1');
    await installSampler(page);
    await page.waitForTimeout(900);

    await setPhase(page, 'transition');
    await pushRoom(page, state, { turnIndex: 1 });
    await settled(page, 2, 'p2');

    await pushRoom(page, state, { turnIndex: 2 });
    await crossfading(page, 3);
    await pushRoom(page, state, { turnIndex: 3 });
    await settled(page, 4, 'p3-to-p4');

    state.reconnectFailures = 1;
    await wake(page);
    await neutral(page, 'reconnect-temporary-no-turn');
    await pushRoom(page, state, { turnIndex: 3 });
    await settled(page, 4, 'reconnect-restored-p4');

    await setPhase(page, 'after');
    await page.waitForTimeout(900);
    const m = await metrics(page, testInfo);

    expect(m.before.count, 'baseline frames').toBeGreaterThan(20);
    expect(m.transition.count, 'transition frames').toBeGreaterThan(20);
    expect(m.after.count, 'post-transition frames').toBeGreaterThan(20);
    expect(m.transitionDurations.length, 'record real crossfades').toBeGreaterThanOrEqual(3);
    for (const transition of m.transitionDurations) {
      expect(transition.durationMs, `revision ${transition.revision} cannot flash`).toBeGreaterThanOrEqual(250);
      expect(transition.durationMs, `revision ${transition.revision} cannot drag`).toBeLessThanOrEqual(600);
    }

    const transitionP95Limit = Math.max(50, m.before.p95 + 20, m.before.p95 * 1.75);
    expect(m.transition.p95, 'transition p95 frame time').toBeLessThanOrEqual(transitionP95Limit);
    expect(m.after.p95, 'frame time recovers after transition').toBeLessThanOrEqual(Math.max(50, m.before.p95 + 20));
    expect(m.transition.over50Ratio, 'visible >50ms jank rate').toBeLessThanOrEqual(m.before.over50Ratio + 0.08);
    expect(browserErrors, `browser errors: ${JSON.stringify(browserErrors)}`).toEqual([]);
  } finally {
    await context.close();
  }
});

test('Reduced Motion applies authoritative seat immediately with no crossfade', async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true, reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const state = await installRoomApi(page);
  try {
    await openRoom(page);
    await installSampler(page);
    const initial = await settled(page, 1, 'reduced-p1');
    expect(initial.reducedMotion).toBe('true');
    expect(initial.lightState).toBe('immediate');

    await pushRoom(page, state, { turnIndex: 2 });
    await page.waitForFunction(() => document.body.dataset.yakolakAuthoritativeTurnPlayer === '3', null, { timeout: 15000 });
    await pushRoom(page, state, { turnIndex: 3 });
    const p4 = await settled(page, 4, 'reduced-p4');
    expect(p4.lightState).toBe('immediate');

    const trace = await page.evaluate(() => window.__lighting12Perf.states);
    expect(trace.filter(row => row.lightState === 'crossfading')).toEqual([]);
  } finally {
    await context.close();
  }
});
