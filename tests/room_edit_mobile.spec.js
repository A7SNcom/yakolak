import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  launchOptions: {
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'
    ]
  }
});

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function waitingRoom(overrides = {}) {
  const players = overrides.players || [{ seat: 'p1', color: 'marble' }];
  return {
    code: '15',
    version: overrides.version ?? 1,
    protocol: 5,
    status: 'waiting',
    targetPlayers: overrides.targetPlayers ?? 2,
    targetRounds: overrides.targetRounds ?? 3,
    winsToMatch: overrides.targetRounds ?? 3,
    players,
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: Object.fromEntries(players.map(player => [player.seat, 0])),
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: Object.fromEntries(players.map(player => [player.seat, false])),
    ...overrides,
  };
}

async function canvasSnapshot(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('canvas')?.getBoundingClientRect();
    return {
      x: canvas?.x ?? -1, y: canvas?.y ?? -1,
      width: canvas?.width ?? -1, height: canvas?.height ?? -1,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });
}

async function tap(page, selector) {
  const locator = page.locator(selector);
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${selector} should have a touchable box`).not.toBeNull();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(point.x, `${selector} center x`).toBeGreaterThanOrEqual(0);
  expect(point.x, `${selector} center x`).toBeLessThanOrEqual(390);
  expect(point.y, `${selector} center y`).toBeGreaterThanOrEqual(0);
  expect(point.y, `${selector} center y`).toBeLessThanOrEqual(844);
  await page.touchscreen.tap(point.x, point.y);
}

async function waitForEditorHistoryCleanup(page) {
  await page.waitForFunction(() => !history.state?.yakolakRoomEdit);
}

test('ROOM-EDIT-15 mobile editor saves, cancels, backs out, reopens and handles stale state without layout shift', async ({ page }) => {
  test.setTimeout(150000);
  let current = waitingRoom();
  let conflictMode = false;
  const editBodies = [];
  const failures = [];

  page.on('pageerror', error => failures.push(`pageerror:${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      failures.push(`console:${message.text()}`);
    }
  });

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 204, body: '' });
    const body = JSON.parse(request.postData() || '{}');

    if (body.action === 'create') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: current })
      });
    }

    if (body.action === 'edit') {
      editBodies.push(structuredClone(body));
      if (conflictMode || Number(body.version) !== Number(current.version)) {
        conflictMode = false;
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'version_conflict', room: current })
        });
      }
      current = {
        ...current,
        version: current.version + 1,
        targetPlayers: body.changes.targetPlayers,
        targetRounds: body.changes.targetRounds,
        winsToMatch: body.changes.targetRounds,
        players: current.players.map(player => player.seat === 'p1'
          ? { ...player, color: body.changes.color }
          : player),
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat: 'p1', room: current })
      });
    }

    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'invalid_action' })
    });
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' && typeof window.yakolakTestStartOnline === 'function',
    null,
    { timeout: 60000 }
  );
  await page.evaluate(() => window.yakolakTestStartOnline());
  await page.waitForSelector('#yakolak-room-edit-button', { state: 'visible', timeout: 30000 });

  const baseline = await canvasSnapshot(page);
  expect(baseline.width).toBeCloseTo(390, 0);
  expect(baseline.height).toBeCloseTo(844, 0);

  // Open: all controls fit the portrait safe area and keep touch targets usable.
  await tap(page, '#yakolak-room-edit-button');
  await page.waitForSelector('#yakolak-room-edit-modal', { state: 'visible' });
  const opened = await page.evaluate(() => {
    const modal = document.getElementById('yakolak-room-edit-modal');
    const panel = modal?.firstElementChild?.getBoundingClientRect();
    const controls = [...(modal?.querySelectorAll('select,button') || [])].map(node => {
      const r = node.getBoundingClientRect();
      return { id: node.id, width: r.width, height: r.height };
    });
    return { panel: panel?.toJSON() || null, controls };
  });
  expect(opened.panel).not.toBeNull();
  expect(opened.panel.x).toBeGreaterThanOrEqual(0);
  expect(opened.panel.y).toBeGreaterThanOrEqual(0);
  expect(opened.panel.x + opened.panel.width).toBeLessThanOrEqual(390);
  expect(opened.panel.y + opened.panel.height).toBeLessThanOrEqual(844);
  for (const control of opened.controls) expect(control.height, control.id).toBeGreaterThanOrEqual(44);
  expect(await canvasSnapshot(page)).toEqual(baseline);

  // Cancel/close must be mutation-free, then the editor can reopen cleanly.
  await page.selectOption('#yakolak-room-edit-color', 'gold');
  await tap(page, '#yakolak-room-edit-cancel');
  await expect(page.locator('#yakolak-room-edit-modal')).toHaveCount(0);
  await waitForEditorHistoryCleanup(page);
  expect(editBodies).toHaveLength(0);
  await tap(page, '#yakolak-room-edit-button');
  await expect(page.locator('#yakolak-room-edit-color')).toHaveValue('marble');
  const backdrop = await page.locator('#yakolak-room-edit-modal').boundingBox();
  expect(backdrop).not.toBeNull();
  await page.touchscreen.tap(backdrop.x + 3, backdrop.y + 3);
  await expect(page.locator('#yakolak-room-edit-modal')).toHaveCount(0);
  await waitForEditorHistoryCleanup(page);
  expect(editBodies).toHaveLength(0);

  // Browser Back closes only the modal; it must not navigate away from the room.
  await tap(page, '#yakolak-room-edit-button');
  const urlBeforeBack = page.url();
  await page.evaluate(() => history.back());
  await expect(page.locator('#yakolak-room-edit-modal')).toHaveCount(0);
  await waitForEditorHistoryCleanup(page);
  expect(page.url()).toBe(urlBeforeBack);
  await expect(page.locator('#yakolak-room-edit-button')).toBeVisible();

  // Save all editable fields from one captured canonical version.
  await tap(page, '#yakolak-room-edit-button');
  await page.selectOption('#yakolak-room-edit-color', 'gold');
  await page.selectOption('#yakolak-room-edit-players', '4');
  await page.selectOption('#yakolak-room-edit-rounds', '5');
  await tap(page, '#yakolak-room-edit-save');
  await expect(page.locator('#yakolak-room-edit-modal')).toHaveCount(0);
  await waitForEditorHistoryCleanup(page);
  await expect(page.locator('#yakolak-room-edit-notice')).toContainText('تم حفظ التعديل');
  expect(editBodies.at(-1)).toMatchObject({
    action: 'edit',
    code: '15',
    version: 1,
    changes: { color: 'gold', targetPlayers: 4, targetRounds: 5 },
  });
  expect(current).toMatchObject({ version: 2, targetPlayers: 4, targetRounds: 5, winsToMatch: 5 });
  expect(current.players[0]).toEqual({ seat: 'p1', color: 'gold' });

  // A competing canonical update makes the open editor stale. The stale save
  // must surface an error, hydrate latest state, and never overwrite it.
  await tap(page, '#yakolak-room-edit-button');
  expect(await page.locator('#yakolak-room-edit-rounds').inputValue()).toBe('5');
  current = { ...current, version: 3, targetRounds: 3, winsToMatch: 3 };
  conflictMode = true;
  await page.selectOption('#yakolak-room-edit-rounds', '5');
  await tap(page, '#yakolak-room-edit-save');
  await expect(page.locator('#yakolak-room-edit-modal')).toHaveCount(0);
  await waitForEditorHistoryCleanup(page);
  await expect(page.locator('#yakolak-room-edit-notice')).toContainText('تغيرت الغرفة');
  expect(editBodies.at(-1).version).toBe(2);
  expect(current).toMatchObject({ version: 3, targetRounds: 3, winsToMatch: 3 });

  await tap(page, '#yakolak-room-edit-button');
  await expect(page.locator('#yakolak-room-edit-color')).toHaveValue('gold');
  await expect(page.locator('#yakolak-room-edit-players')).toHaveValue('4');
  await expect(page.locator('#yakolak-room-edit-rounds')).toHaveValue('3');
  await tap(page, '#yakolak-room-edit-cancel');
  await waitForEditorHistoryCleanup(page);

  expect(await canvasSnapshot(page)).toEqual(baseline);
  expect(baseline.scrollWidth).toBeLessThanOrEqual(baseline.viewportWidth);
  expect(failures).toEqual([]);
});
