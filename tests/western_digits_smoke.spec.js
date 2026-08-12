import { test, expect } from '@playwright/test';

const ARABIC_DIGITS = /[٠-٩۰-۹]/;
const BROWSER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage',
];

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  launchOptions: { args: BROWSER_ARGS },
});

function room54() {
  const players = [
    { seat: 'p1', color: 'marble' },
    { seat: 'p2', color: 'blue' },
    { seat: 'p3', color: 'gold' },
    { seat: 'p4', color: 'green' },
  ];
  return {
    code: '54',
    version: 1,
    protocol: 5,
    status: 'playing',
    targetPlayers: 4,
    targetRounds: 3,
    winsToMatch: 3,
    players,
    turnIndex: 3,
    board: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}])),
    round: 1,
    completedRounds: 0,
    scores: { p1: 0, p2: 0, p3: 0, p4: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { p1: false, p2: false, p3: false, p4: false },
  };
}

async function installRoomApi(page) {
  const state = { room: room54(), createBody: null };
  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ status: 204, body: '' });
    }
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      state.createBody = body;
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: state.room }),
      });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });
  return state;
}

async function startFourPlayerOnline(page) {
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
    () => document.body.dataset.yakolakGameplay === 'ready' &&
      document.getElementById('yakolak-invite-copy')?.textContent?.includes('الغرفة 54'),
    null,
    { timeout: 30000 }
  );
}

test('room code renders Western digits through the shared boundary without mutating numeric state', async ({ page }) => {
  test.setTimeout(120000);
  const state = await installRoomApi(page);
  await startFourPlayerOnline(page);

  const observed = await page.evaluate(() => ({
    invite: document.getElementById('yakolak-invite-copy')?.textContent || '',
    urlRoom: new URL(location.href).searchParams.get('room') || '',
    players: document.body.dataset.yakolakPlayers || '',
    rounds: document.body.dataset.yakolakSetupRounds || '',
  }));

  expect(observed.invite).toContain('الغرفة 54');
  expect(observed.invite).not.toMatch(ARABIC_DIGITS);
  expect(observed.urlRoom).toBe('54');
  expect(observed.players).toBe('4');
  expect(observed.rounds).toBe('3');

  expect(state.room.code).toBe('54');
  expect(typeof state.createBody?.targetPlayers).toBe('number');
  expect(state.createBody?.targetPlayers).toBe(4);
  expect(typeof state.createBody?.targetRounds).toBe('number');
  expect(state.createBody?.targetRounds).toBe(3);
});
