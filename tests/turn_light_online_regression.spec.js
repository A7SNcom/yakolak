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
const SETTLED_LIGHT_STATES = new Set(['final', 'stable', 'immediate']);

test.use({ launchOptions: { args: BROWSER_ARGS } });

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function makeRoom() {
  const players = Array.from({ length: 4 }, (_, index) => ({ seat: `p${index + 1}`, color: COLORS[index] }));
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
  const state = { current: makeRoom(), reconnectFailures: 0, createBody: null };
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
      state.createBody = body;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: state.current }) });
    }
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'not_used_by_lighting_regression' }) });
  });
  return state;
}

async function openOnlineRoom(page) {
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

async function wakePoll(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function pushRoom(page, state, overrides) {
  state.current = { ...structuredClone(state.current), ...structuredClone(overrides), version: Number(state.current.version) + 1 };
  await wakePoll(page);
}

async function installSampler(page) {
  await page.evaluate(() => {
    window.__lighting12 = { phase: 'before', frames: [], states: [] };
    let prior = performance.now();
    let lastState = '';
    const sample = now => {
      const store = window.__lighting12;
      if (!store) return;
      const delta = now - prior;
      prior = now;
      if (delta > 0 && delta < 500) store.frames.push({ phase: store.phase, dt: delta });
      const d = document.body.dataset;
      const row = {
        t: now,
        phase: store.phase,
        authValid: d.yakolakAuthoritativeTurnValid || '',
        authPlayer: d.yakolakAuthoritativeTurnPlayer || '',
        authDirection: d.yakolakAuthoritativeTurnDirection || '',
        authRevision: d.yakolakAuthoritativeTurnRevision || '',
        authLifecycle: d.yakolakAuthoritativeTurnLifecycle || '',
        lightState: d.yakolakTurnLightState || '',
        lightDirection: d.yakolakTurnLightDirection || '',
        lightRevision: d.yakolakTurnLightRevision || '',
        lightFinalCount: d.yakolakTurnLightFinalCount || '',
        transitions: d.yakolakTurnLightTransitions || '',
        retargets: d.yakolakTurnLightRetargets || '',
        reducedMotion: d.yakolakTurnLightReducedMotion || '',
      };
      const key = JSON.stringify(row);
      if (key !== lastState) {
        store.states.push(row);
        lastState = key;
      }
      if (store.frames.length > 4000) store.frames.shift();
      if (store.states.length > 1000) store.states.shift();
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function setPhase(page, phase) {
  await page.evaluate(value => { window.__lighting12.phase = value; }, phase);
}

async function lightSnapshot(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    return {
      authoritative: {
        valid: d.yakolakAuthoritativeTurnValid || '',
        player: d.yakolakAuthoritativeTurnPlayer || '',
        direction: d.yakolakAuthoritativeTurnDirection || '',
        revision: d.yakolakAuthoritativeTurnRevision || '',
        lifecycle: d.yakolakAuthoritativeTurnLifecycle || '',
      },
      light: {
        owner: d.yakolakTurnLightOwner || '',
        source: d.yakolakTurnLightSource || '',
        polling: d.yakolakTurnLightPolling || '',
        scope: d.yakolakTurnLightScope || '',
        reducedMotion: d.yakolakTurnLightReducedMotion || '',
        state: d.yakolakTurnLightState || '',
        direction: d.yakolakTurnLightDirection || '',
        revision: d.yakolakTurnLightRevision || '',
        lifecycle: d.yakolakTurnLightLifecycle || '',
        finalCount: d.yakolakTurnLightFinalCount || '',
        transitions: d.yakolakTurnLightTransitions || '',
        retargets: d.yakolakTurnLightRetargets || '',
      },
    };
  });
}

async function settled(page, expectedPlayer, label) {
  await page.waitForFunction(({ player, settledStates }) => {
    const d = document.body.dataset;
    if (d.yakolakAuthoritativeTurnValid !== 'true') return false;
    if (Number(d.yakolakAuthoritativeTurnPlayer) !== player) return false;
    if (d.yakolakTurnLightRevision !== d.yakolakAuthoritativeTurnRevision) return false;
    if (d.yakolakTurnLightDirection !== d.yakolakAuthoritativeTurnDirection) return false;
    if (d.yakolakTurnLightFinalCount !== '1') return false;
    return settledStates.includes(d.yakolakTurnLightState || '');
  }, { player: expectedPlayer, settledStates: [...SETTLED_LIGHT_STATES] }, { timeout: 10000 });
  const observed = await lightSnapshot(page);
  expect(observed.light.owner, `${label}: one lighting owner`).toBe('single-authoritative-controller');
  expect(observed.light.source, `${label}: authoritative source`).toBe('authoritative-turn-signal');
  expect(observed.light.polling, `${label}: no polling`).toBe('none');
  expect(observed.light.scope, `${label}: localized scope`).toBe('localized-seat-spots');
  expect(Number(observed.authoritative.player), `${label}: authoritative player`).toBe(expectedPlayer);
  expect(observed.light.direction, `${label}: rendered focus direction`).toBe(observed.authoritative.direction);
  expect(observed.light.revision, `${label}: rendered revision`).toBe(observed.authoritative.revision);
  expect(observed.light.finalCount, `${label}: exactly one active seat`).toBe('1');
  return observed;
}

async function settledNeutral(page, label) {
  await page.waitForFunction(settledStates => {
    const d = document.body.dataset;
    if (d.yakolakAuthoritativeTurnValid !== 'false') return false;
    if (d.yakolakTurnLightDirection !== '') return false;
    if (d.yakolakTurnLightFinalCount !== '0') return false;
    return settledStates.includes(d.yakolakTurnLightState || '');
  }, [...SETTLED_LIGHT_STATES], { timeout: 10000 });
  const observed = await lightSnapshot(page);
  expect(observed.authoritative.valid, `${label}: no authoritative turn`).toBe('false');
  expect(observed.light.direction, `${label}: no stale seat direction`).toBe('');
  expect(observed.light.finalCount, `${label}: every seat neutral`).toBe('0');
  return observed;
}

async function waitForCrossfade(page, expectedPlayer, label) {
  await page.waitForFunction(player => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' &&
      Number(d.yakolakAuthoritativeTurnPlayer) === player &&
      d.yakolakTurnLightRevision === d.yakolakAuthoritativeTurnRevision &&
      d.yakolakTurnLightDirection === d.yakolakAuthoritativeTurnDirection &&
      d.yakolakTurnLightState === 'crossfading';
  }, expectedPlayer, { timeout: 10000 });
  const observed = await lightSnapshot(page);
  expect(Number(observed.authoritative.player), `${label}: authoritative intermediate player`).toBe(expectedPlayer);
  expect(observed.light.state, `${label}: transition must actually be in flight`).toBe('crossfading');
  return observed;
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
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p95: percentile(values, 0.95),
    max: Math.max(...values),
    over50Ratio: values.filter(value => value > 50).length / values.length,
  };
}

function transitionDurations(states) {
  const starts = new Map();
  const durations = [];
  for (const row of states) {
    if (!row.lightRevision) continue;
    if (row.lightState === 'crossfading' && !starts.has(row.lightRevision)) starts.set(row.lightRevision, row.t);
    if ((row.lightState === 'final' || row.lightState === 'stable') && starts.has(row.lightRevision)) {
      durations.push({ revision: row.lightRevision, durationMs: row.t - starts.get(row.lightRevision), lifecycle: row.authLifecycle, direction: row.lightDirection });
      starts.delete(row.lightRevision);
    }
  }
  return durations;
}

async function attachMetrics(page, testInfo, label) {
  const data = await page.evaluate(() => window.__lighting12 || { frames: [], states: [] });
  const byPhase = phase => data.frames.filter(row => row.phase === phase).map(row => row.dt);
  const metrics = {
    before: summarize(byPhase('before')),
    transition: summarize(byPhase('transition')),
    after: summarize(byPhase('after')),
    transitionDurations: transitionDurations(data.states),
    states: data.states,
  };
  await testInfo.attach(`${label}-metrics.json`, { body: Buffer.from(JSON.stringify(metrics, null, 2)), contentType: 'application/json' });
  const summary = { before: metrics.before, transition: metrics.transition, after: metrics.after, transitionDurations: metrics.transitionDurations };
  console.log(`YAKOLAK_LIGHTING12_BROWSER_METRICS ${JSON.stringify(summary)}`);
  console.log(`::notice title=LIGHTING-12 mobile metrics::${JSON.stringify(summary)}`);
  return metrics;
}

async function attachFailure(page, testInfo, label, state, error) {
  const screenshot = await page.screenshot({ fullPage: true }).catch(() => null);
  if (screenshot) await testInfo.attach(`${label}.png`, { body: screenshot, contentType: 'image/png' });
  const snapshot = await lightSnapshot(page).catch(snapshotError => ({ snapshotError: String(snapshotError) }));
  const trace = await page.evaluate(() => window.__lighting12 || {}).catch(() => ({}));
  await testInfo.attach(`${label}.json`, {
    body: Buffer.from(JSON.stringify({ room: state.current, snapshot, trace, error: String(error?.stack || error) }, null, 2)),
    contentType: 'application/json',
  });
}

test('mobile portrait LIGHTING-12 authoritative transitions stay clear and frame-safe', async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const state = await installRoomApi(page);
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(`console: ${message.text()}`); });
  try {
    await openOnlineRoom(page);
    expect(Number(state.createBody?.targetPlayers), 'room must be 4-player').toBe(4);
    await settled(page, 1, 'initial-p1');
    await installSampler(page);
    await page.waitForTimeout(900);

    await setPhase(page, 'transition');
    await pushRoom(page, state, { turnIndex: 1 });
    await settled(page, 2, 'p1-to-p2');

    // The direct Godot regression is the authoritative rapid-signal test and
    // proves an in-flight P3 tween is cancelled/retargeted by P4. Here the Web
    // transport may coalesce/delay room delivery beyond the 340ms light tween;
    // exercise P3 -> P4 as fast server changes, but assert only states the Web
    // client actually receives so transport polling is not tested as lighting.
    await pushRoom(page, state, { turnIndex: 2 });
    await waitForCrossfade(page, 3, 'p2-to-p3-in-flight');
    await pushRoom(page, state, { turnIndex: 3 });
    await settled(page, 4, 'rapid-p3-to-p4');

    // One failed poll drives the lighting owner to the temporary neutral state.
    // Reconnect transport semantics are outside LIGHTING-12: restoration is
    // asserted when the next accepted authoritative room snapshot arrives,
    // preserving the same P4 turn while bumping only the server room version.
    state.reconnectFailures = 1;
    await wakePoll(page);
    await settledNeutral(page, 'reconnect-neutral');
    await pushRoom(page, state, { turnIndex: 3 });
    await settled(page, 4, 'reconnect-restored-p4');

    await pushRoom(page, state, {
      status: 'finished', completedRounds: 1, winner: { seat: 'p1', color: COLORS[0] },
      scores: { ...state.current.scores, p1: 1 }, matchComplete: false,
    });
    await settledNeutral(page, 'round-end-neutral');
    await pushRoom(page, state, {
      status: 'playing', round: 2, turnIndex: 0, board: emptyBoard(), winner: null,
      matchComplete: false, lastMove: null,
    });
    await settled(page, 1, 'round-2-p1');

    await pushRoom(page, state, {
      status: 'finished', round: 3, completedRounds: 3,
      winner: { seat: 'p1', color: COLORS[0] }, matchComplete: true,
      matchWinner: { seat: 'p1', color: COLORS[0] }, scores: { ...state.current.scores, p1: 3 },
    });
    await settledNeutral(page, 'match-end-neutral');
    await pushRoom(page, state, {
      status: 'playing', round: 1, completedRounds: 0, turnIndex: 1, board: emptyBoard(),
      winner: null, matchComplete: false, matchWinner: null,
      scores: Object.fromEntries(state.current.players.map(player => [player.seat, 0])),
      rematch: Object.fromEntries(state.current.players.map(player => [player.seat, false])),
      lastMove: null, moveNumber: 0,
    });
    await settled(page, 2, 'rematch-p2');

    await setPhase(page, 'after');
    await page.waitForTimeout(900);
    const metrics = await attachMetrics(page, testInfo, 'lighting12-mobile');
    expect(metrics.before.count, 'baseline frame sample count').toBeGreaterThan(20);
    expect(metrics.transition.count, 'transition frame sample count').toBeGreaterThan(20);
    expect(metrics.after.count, 'post-transition frame sample count').toBeGreaterThan(20);
    expect(metrics.transitionDurations.length, 'must record real crossfade durations').toBeGreaterThanOrEqual(4);
    for (const transition of metrics.transitionDurations) {
      expect(transition.durationMs, `crossfade revision ${transition.revision} too short/flashy`).toBeGreaterThanOrEqual(250);
      expect(transition.durationMs, `crossfade revision ${transition.revision} too slow/janky`).toBeLessThanOrEqual(600);
    }
    const allowedP95 = Math.max(50, metrics.before.p95 + 20, metrics.before.p95 * 1.75);
    expect(metrics.transition.p95, `transition p95 ${metrics.transition.p95.toFixed(2)}ms exceeds frame-time guard ${allowedP95.toFixed(2)}ms`).toBeLessThanOrEqual(allowedP95);
    expect(metrics.after.p95, 'frame-time must recover after transitions').toBeLessThanOrEqual(Math.max(50, metrics.before.p95 + 20));
    expect(metrics.transition.over50Ratio, 'visible >50ms jank rate regressed significantly').toBeLessThanOrEqual(metrics.before.over50Ratio + 0.08);
    expect(errors, `browser errors: ${JSON.stringify(errors)}`).toEqual([]);
  } catch (error) {
    await attachFailure(page, testInfo, 'lighting12-mobile-failure', state, error);
    throw error;
  } finally {
    await context.close();
  }
});

test('mobile portrait Reduced Motion skips lighting tween and keeps authoritative focus exact', async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const state = await installRoomApi(page);
  try {
    await openOnlineRoom(page);
    await installSampler(page);
    const initial = await settled(page, 1, 'reduced-initial-p1');
    expect(initial.light.reducedMotion, 'browser reduced-motion preference must be honored').toBe('true');
    expect(initial.light.state, 'initial reduced-motion state').toBe('immediate');

    await pushRoom(page, state, { turnIndex: 2 });
    await page.waitForFunction(() => document.body.dataset.yakolakAuthoritativeTurnPlayer === '3', null, { timeout: 10000 });
    await pushRoom(page, state, { turnIndex: 3 });
    const p4 = await settled(page, 4, 'reduced-rapid-p3-p4');
    expect(p4.light.state, 'Reduced Motion must apply final state immediately').toBe('immediate');

    const trace = await page.evaluate(() => window.__lighting12 || { states: [] });
    const crossfades = trace.states.filter(row => row.lightState === 'crossfading');
    expect(crossfades, `Reduced Motion emitted crossfade states: ${JSON.stringify(crossfades)}`).toEqual([]);
    await testInfo.attach('lighting12-reduced-motion.json', { body: Buffer.from(JSON.stringify(trace, null, 2)), contentType: 'application/json' });
  } catch (error) {
    await attachFailure(page, testInfo, 'lighting12-reduced-motion-failure', state, error);
    throw error;
  } finally {
    await context.close();
  }
});
