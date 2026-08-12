import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const ARABIC_DIGITS = /[٠-٩۰-۹]/u;
const ARABIC_LETTERS = /[\u0600-\u06FF]/u;
const WESTERN_DIGITS = /[0-9]/u;
const DIGITS21_CATEGORIES = [
  'room_code',
  'player_label',
  'player_count',
  'scores',
  'match_target',
  'piece_counters',
  'dialogs_status',
  'reconnect_ui',
  'round_end',
  'match_end',
];
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
  const players = [{ seat: 'p1', color: 'marble' }];
  return {
    code: '54',
    version: 1,
    protocol: 5,
    status: 'waiting',
    targetPlayers: 4,
    targetRounds: 3,
    winsToMatch: 3,
    players,
    turnIndex: 0,
    board: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}])),
    round: 1,
    completedRounds: 0,
    scores: { p1: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { p1: false },
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

async function waitForFastIntro(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
      document.body.dataset.yakolakSetup === 'visible' &&
      typeof window.yakolakTestSetupFlowAction === 'function' &&
      typeof window.yakolakTestShowDigitFixture === 'function',
    null,
    { timeout: 180000 }
  );
}

async function waitForDigitFixtureBridge(page) {
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof window.yakolakTestShowDigitFixture === 'function' &&
      document.body.dataset.yakolakVisibleStrings !== undefined,
    null,
    { timeout: 90000 }
  );
}

async function collectVisibleStrings(page) {
  return page.evaluate(() => {
    let godot = [];
    try {
      godot = JSON.parse(document.body.dataset.yakolakVisibleStrings || '[]');
    } catch {
      godot = [];
    }

    const dom = [];
    for (const element of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS'].includes(element.tagName)) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.01) continue;
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) continue;

      const directText = [...element.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent || '')
        .join(' ')
        .trim();
      if (directText) dom.push({ name: element.id || element.tagName, type: 'DOM', text: directText });

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const fieldText = (element.value || element.placeholder || '').trim();
        if (fieldText) dom.push({ name: element.id || element.tagName, type: 'DOMField', text: fieldText });
      }
    }
    return [...godot, ...dom];
  });
}

async function expectVisibleWesternDigits(page, context) {
  await page.waitForFunction(() => Boolean(document.body.dataset.yakolakVisibleStrings), null, { timeout: 10000 });
  const records = await collectVisibleStrings(page);
  const violations = records.filter(record => ARABIC_DIGITS.test(String(record.text || '')));
  expect(violations, `${context}: rendered Arabic-Indic digit violation`).toEqual([]);
  return records;
}

async function startFourPlayerOnline(page) {
  await waitForFastIntro(page);
  await page.evaluate(() => window.yakolakTestSetupFlowAction('new'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'count');
  let records = await expectVisibleWesternDigits(page, 'setup player-count screen');
  expect(records.some(record => WESTERN_DIGITS.test(String(record.text || '')))).toBe(true);

  await page.evaluate(() => window.yakolakTestSetupFlowAction('count', 4));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'mode:1');
  records = await expectVisibleWesternDigits(page, 'setup player-label/mode screen');
  expect(records.some(record => String(record.text || '').includes('2'))).toBe(true);

  await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 1, 'online'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'rounds');
  records = await expectVisibleWesternDigits(page, 'setup match-target screen');
  expect(records.some(record => WESTERN_DIGITS.test(String(record.text || '')))).toBe(true);

  await page.evaluate(() => window.yakolakTestSetupFlowAction('rounds', 3));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'color');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('continue'));
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
      document.body.dataset.yakolakOnlineUiState === 'waiting-players',
    null,
    { timeout: 30000 }
  );
  await page.waitForFunction(() => {
    try {
      const records = JSON.parse(document.body.dataset.yakolakVisibleStrings || '[]');
      return records.some(record => String(record.text || '').includes('الغرفة 54'));
    } catch {
      return false;
    }
  }, null, { timeout: 10000 });
  return expectVisibleWesternDigits(page, 'live waiting-room UI');
}

test('room code and live Arabic setup/gameplay render only Western digits without mutating numeric state', async ({ page }) => {
  test.setTimeout(300000);
  const state = await installRoomApi(page);
  const visible = await startFourPlayerOnline(page);

  const observed = await page.evaluate(() => ({
    urlRoom: new URL(location.href).searchParams.get('room') || '',
    players: document.body.dataset.yakolakPlayers || '',
    rounds: document.body.dataset.yakolakSetupRounds || '',
    onlineMessage: document.body.dataset.yakolakOnlineUiMessage || '',
  }));

  expect(visible.some(record => String(record.text || '').includes('الغرفة 54'))).toBe(true);
  expect(visible.some(record => String(record.text || '').includes('انضم 1 من 4'))).toBe(true);
  expect(observed.onlineMessage).toContain('انضم 1 من 4');
  expect(observed.onlineMessage).not.toMatch(ARABIC_DIGITS);
  expect(observed.urlRoom).toBe('54');
  expect(observed.players).toBe('4');
  expect(observed.rounds).toBe('3');

  expect(state.room.code).toBe('54');
  expect(typeof state.createBody?.targetPlayers).toBe('number');
  expect(state.createBody?.targetPlayers).toBe(4);
  expect(typeof state.createBody?.targetRounds).toBe('number');
  expect(state.createBody?.targetRounds).toBe(3);
});

test('DIGITS-21 rendered regression matrix covers Arabic and English numeric UI and captures mobile RTL proof', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  await waitForDigitFixtureBridge(page);

  for (const mode of ['ar', 'en']) {
    await page.evaluate(selectedMode => window.yakolakTestShowDigitFixture(selectedMode), mode);
    await page.waitForFunction(
      ({ expectedMode, expectedCount }) => {
        if (document.body.dataset.yakolakDigits21Fixture !== expectedMode) return false;
        try {
          const records = JSON.parse(document.body.dataset.yakolakVisibleStrings || '[]');
          const fixture = records.filter(record => String(record.name || '').startsWith('Digits21_'));
          if (fixture.length !== expectedCount) return false;
          const copy = fixture.map(record => String(record.text || '')).join(' | ');
          return expectedMode === 'ar' ? copy.includes('رمز الغرفة 54') : copy.includes('Room code 54');
        } catch {
          return false;
        }
      },
      { expectedMode: mode, expectedCount: DIGITS21_CATEGORIES.length },
      { timeout: 10000 }
    );

    const visible = await expectVisibleWesternDigits(page, `DIGITS-21 ${mode} visible-string scan`);
    const fixture = visible.filter(record => String(record.name || '').startsWith('Digits21_'));
    const names = fixture.map(record => String(record.name).replace(/^Digits21_/, '')).sort();
    expect(names).toEqual([...DIGITS21_CATEGORIES].sort());
    expect(fixture.every(record => WESTERN_DIGITS.test(String(record.text || '')))).toBe(true);

    if (mode === 'ar') {
      expect(fixture.some(record => ARABIC_LETTERS.test(String(record.text || '')) && WESTERN_DIGITS.test(String(record.text || '')))).toBe(true);
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      expect(viewport).toEqual({ width: 390, height: 844 });
      await page.waitForTimeout(750);
      await mkdir('artifacts', { recursive: true });
      const screenshotPath = 'artifacts/digits-21-arabic-mobile.png';
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await testInfo.attach('DIGITS-21 Arabic mobile portrait', { path: screenshotPath, contentType: 'image/png' });
    } else {
      expect(fixture.some(record => /[A-Za-z]/u.test(String(record.text || '')) && WESTERN_DIGITS.test(String(record.text || '')))).toBe(true);
    }

    const hiddenSample = await page.evaluate(() => document.body.dataset.yakolakDigits21HiddenSample || '');
    expect(hiddenSample).toMatch(ARABIC_DIGITS);
    expect(fixture.some(record => record.name === 'Digits21HiddenTranslation')).toBe(false);
  }
});
