import { test, expect } from '@playwright/test';

const BROWSER_ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];
const COLORS = ['marble', 'blue', 'gold', 'green'];

test.use({ launchOptions: { args: BROWSER_ARGS } });

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function makeRoom() {
  const players = COLORS.map((color, index) => ({ seat: `p${index + 1}`, color }));
  return {
    code: '4040', version: 1, protocol: 5, status: 'playing', targetPlayers: 4,
    targetRounds: 3, winsToMatch: 3, players, turnIndex: 0, board: emptyBoard(),
    round: 1, completedRounds: 0,
    scores: Object.fromEntries(players.map(player => [player.seat, 0])),
    winner: null, draw: false, lastMove: null, moveNumber: 0,
    matchComplete: false, matchWinner: null, matchWinners: [],
    rematch: Object.fromEntries(players.map(player => [player.seat, false])),
  };
}

async function installRoomApi(page) {
  const state = { current: makeRoom() };
  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const since = Number(new URL(request.url()).searchParams.get('since') || '-1');
      if (since >= Number(state.current.version)) return route.fulfill({ status: 204, body: '' });
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat: 'p1', room: state.current }),
      });
    }
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: state.current }),
      });
    }
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'not_tested' }) });
  });
  return state;
}

async function wake(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function pushRoom(page, state, overrides) {
  state.current = {
    ...structuredClone(state.current),
    ...structuredClone(overrides),
    version: Number(state.current.version) + 1,
  };
  await wake(page);
}

async function openOnlineRoom(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
      document.body.dataset.yakolakSetup === 'visible' &&
      document.body.dataset.yakolakSetupFlowStage === 'entry' &&
      typeof window.yakolakTestSetupFlowAction === 'function',
    null, { timeout: 60000 }
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
    () => document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
      document.body.dataset.yakolakAuthoritativeTurnPlayer === '1' &&
      document.body.dataset.yakolakTurnPresentationOwner === 'authoritative-revision-controller',
    null, { timeout: 30000 }
  );
  await page.waitForFunction(
    () => document.body.dataset.yakolakTurnPresentationState === 'settled' &&
      document.body.dataset.yakolakTurnPresentationSettled === 'right',
    null, { timeout: 10000 }
  );
}

async function snap(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    return {
      authPlayer: Number(d.yakolakAuthoritativeTurnPlayer || 0),
      authRevision: Number(d.yakolakAuthoritativeTurnRevision || -1),
      authRound: Number(d.yakolakRound || 0),
      state: d.yakolakTurnPresentationState || '',
      revision: Number(d.yakolakTurnPresentationRevision || -1),
      targetRevision: Number(d.yakolakTurnPresentationTargetRevision || -1),
      target: d.yakolakTurnPresentationTarget || '',
      settled: d.yakolakTurnPresentationSettled || '',
      tween: d.yakolakTurnPresentationTween || '',
      serial: Number(d.yakolakTurnPresentationSerial || -1),
      staleFinishes: Number(d.yakolakTurnPresentationStaleFinishes || 0),
    };
  });
}

test('UX-TURN-40 same-owner newer revision retargets one in-flight tween without stale settle metadata', async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const state = await installRoomApi(page);

  try {
    await openOnlineRoom(page);

    await pushRoom(page, state, { turnIndex: 1 });
    await page.waitForFunction(
      () => document.body.dataset.yakolakAuthoritativeTurnPlayer === '2' &&
        document.body.dataset.yakolakTurnPresentationState === 'transitioning' &&
        document.body.dataset.yakolakTurnPresentationTarget === 'back',
      null, { timeout: 10000 }
    );
    const first = await snap(page);

    // A newer accepted revision for the same visual owner/target must adopt the
    // current motion rather than leave its old completion metadata authoritative.
    await pushRoom(page, state, { turnIndex: 1, round: 2 });
    await page.waitForFunction(
      previousRevision => {
        const d = document.body.dataset;
        return Number(d.yakolakAuthoritativeTurnRevision || -1) > previousRevision &&
          d.yakolakAuthoritativeTurnPlayer === '2' &&
          d.yakolakTurnPresentationState === 'retarget-adopted' &&
          d.yakolakTurnPresentationTarget === 'back' &&
          Number(d.yakolakTurnPresentationRevision || -1) === Number(d.yakolakAuthoritativeTurnRevision || -2) &&
          Number(d.yakolakTurnPresentationTargetRevision || -1) === Number(d.yakolakAuthoritativeTurnRevision || -2);
      },
      first.authRevision,
      { timeout: 10000 }
    );
    const adopted = await snap(page);
    expect(adopted.serial, 'same visual target must keep one owning tween').toBe(first.serial);
    expect(adopted.revision).toBe(adopted.authRevision);
    expect(adopted.targetRevision).toBe(adopted.authRevision);

    await page.waitForFunction(
      () => {
        const d = document.body.dataset;
        return d.yakolakTurnPresentationState === 'settled' &&
          d.yakolakTurnPresentationSettled === 'back' &&
          d.yakolakTurnPresentationTween === 'none' &&
          Number(d.yakolakTurnPresentationRevision || -1) === Number(d.yakolakAuthoritativeTurnRevision || -2) &&
          Number(d.yakolakTurnPresentationTargetRevision || -1) === Number(d.yakolakAuthoritativeTurnRevision || -2);
      },
      null, { timeout: 10000 }
    );
    const settled = await snap(page);
    expect(settled.serial).toBe(first.serial);
    expect(settled.authPlayer).toBe(2);
    expect(settled.target).toBe('back');
    expect(settled.settled).toBe('back');
    expect(settled.revision).toBe(settled.authRevision);
    expect(settled.targetRevision).toBe(settled.authRevision);

    await page.waitForTimeout(800);
    const stable = await snap(page);
    expect(stable.serial).toBe(settled.serial);
    expect(stable.revision).toBe(settled.revision);
    expect(stable.staleFinishes).toBe(settled.staleFinishes);
    expect(stable.target).toBe('back');
    expect(stable.settled).toBe('back');
    expect(stable.tween).toBe('none');
  } finally {
    await context.close();
  }
});
