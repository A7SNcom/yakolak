import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  launchOptions: {
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage'
    ]
  }
});

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    intro: document.body.dataset.yakolakIntro || '',
    setup: document.body.dataset.yakolakSetup || '',
    flow: document.body.dataset.yakolakSetupFlowStage || '',
    state: document.body.dataset.yakolakOnlineUiState || '',
    action: document.body.dataset.yakolakOnlineUiAction || '',
    message: document.body.dataset.yakolakOnlineUiMessage || '',
    surface: document.body.dataset.yakolakOnlineUiSurface || '',
    gameplay: document.body.dataset.yakolakGameplay || '',
  }));
}

test('real invitation path shows joining then room-full with a next action', async ({ page }) => {
  test.setTimeout(120000);
  const joinGate = deferred();
  let joinRequests = 0;

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    const body = request.method() === 'POST' ? JSON.parse(request.postData() || '{}') : {};
    if (body.action === 'preview') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, room: { code: '58', status: 'waiting', targetPlayers: 2, targetRounds: 3, availableColors: ['marble', 'blue', 'gold', 'green'] } })
      });
    }
    if (body.action === 'join') {
      joinRequests += 1;
      await joinGate.promise;
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'room_full' }) });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1&room=58', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.yakolakIntro === 'complete', null, { timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.yakolakOnlineUiState === 'room-ready', null, { timeout: 20000 });
  await page.waitForFunction(() => typeof window.yakolakTestSetupFlowAction === 'function');

  // Follow exactly the visible invitation -> choose color -> join path.
  await page.evaluate(() => window.yakolakTestSetupFlowAction('join-setup'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'color', null, { timeout: 10000 });
  await page.evaluate(() => window.yakolakTestSetupFlowAction('continue'));

  await page.waitForTimeout(1200);
  const joining = await snapshot(page);
  expect(joinRequests, `join request was not issued; UI=${JSON.stringify(joining)}`).toBe(1);
  expect(joining, `join request is pending but UI is ambiguous: ${JSON.stringify(joining)}`).toMatchObject({
    state: 'joining-room',
    surface: 'gameplay',
    action: 'exit',
  });
  expect(joining.message).toContain('جاري الانضمام');

  joinGate.resolve();
  await page.waitForFunction(() => document.body.dataset.yakolakOnlineUiState === 'room-full', null, { timeout: 20000 });
  const full = await snapshot(page);
  expect(full).toMatchObject({ state: 'room-full', surface: 'setup', action: 'back' });
  expect(full.message).toContain('الغرفة ممتلئة');
});
