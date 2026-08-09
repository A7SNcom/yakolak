import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

test.use({
  viewport: { width: 1280, height: 720 },
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

function visibleSceneRatio(buffer) {
  const png = PNG.sync.read(buffer);
  let visible = 0;
  let sampled = 0;
  const startY = Math.floor(png.height * 0.20);
  for (let y = startY; y < png.height; y += 3) {
    for (let x = 0; x < png.width; x += 3) {
      const i = (png.width * y + x) << 2;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 200) continue;
      sampled += 1;
      if (Math.max(r, g, b) >= 16) visible += 1;
    }
  }
  return sampled ? visible / sampled : 0;
}

async function cameraHealth(page) {
  return page.evaluate(() => ({
    player: document.body.dataset.yakolakCurrentPlayer,
    direction: document.body.dataset.yakolakTestCurrentDirection,
    stage: document.body.dataset.yakolakCameraStage,
    current: document.body.dataset.yakolakCameraCurrent,
    boardVisible: document.body.dataset.yakolakBoardVisible,
    focusInside: document.body.dataset.yakolakCameraFocusInside,
    facing: Number(document.body.dataset.yakolakCameraFacing || 0),
    fov: Number(document.body.dataset.yakolakCameraFov || 0),
    gameplay: document.body.dataset.yakolakGameplay,
    moves: Number(document.body.dataset.yakolakMoves || 0)
  }));
}

async function expectContinuousZoom(page) {
  await page.waitForFunction(() => {
    const effective = Number(document.body.dataset.yakolakTurnEffectiveFov || 0);
    const finished = Number(document.body.dataset.yakolakCameraTransitionFinishedFov || 0);
    const restored = Number(document.body.dataset.yakolakCameraZoomFov || 0);
    return effective > 0 && Math.abs(finished - effective) < 0.08 && Math.abs(restored - effective) < 0.08;
  }, null, { timeout: 5000 });

  const zoom = await page.evaluate(() => ({
    base: Number(document.body.dataset.yakolakTurnBaseFov || 0),
    effective: Number(document.body.dataset.yakolakTurnEffectiveFov || 0),
    finished: Number(document.body.dataset.yakolakCameraTransitionFinishedFov || 0),
    restored: Number(document.body.dataset.yakolakCameraZoomFov || 0),
    ratio: Number(document.body.dataset.yakolakCameraZoomRatio || 1)
  }));
  expect(zoom.ratio).toBeLessThan(0.99);
  expect(Math.abs(zoom.base - zoom.effective)).toBeGreaterThan(0.5);
  expect(Math.abs(zoom.finished - zoom.effective)).toBeLessThan(0.08);
  expect(Math.abs(zoom.restored - zoom.effective)).toBeLessThan(0.08);
}

async function startPassPlay(page, failures, songRequests) {
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => {
    const url = request.url();
    const errorText = request.failure()?.errorText || '';
    if ((url.endsWith('/index.wasm') || url.endsWith('/index.pck')) && errorText === 'net::ERR_ABORTED') return;
    failures.push(`requestfailed: ${url} ${errorText}`);
  });
  page.on('request', request => {
    if (request.url().includes('song.mp3')) songRequests.push(request.url());
  });
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          document.body.dataset.yakolakMusic === 'playing' &&
          document.body.dataset.yakolakClosedBoxSpawn === 'offscreen-top' &&
          document.body.dataset.yakolakLegalMarkerStyle === 'surface-ring' &&
          typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestPlayOneMove === 'function' &&
          typeof window.yakolakTestClearSelection === 'function',
    null,
    { timeout: 60000 }
  );

  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakCameraStage === 'ready' &&
          document.body.dataset.yakolakCameraCurrent === 'true' &&
          document.body.dataset.yakolakBoardVisible === 'true' &&
          Number(document.body.dataset.yakolakCameraFacing || 0) > 0.995 &&
          document.body.dataset.yakolakPiecePickModel === 'mesh-triangle-frontmost' &&
          document.body.dataset.yakolakPiecePickInputParity === 'shared-screen-ray' &&
          document.body.dataset.yakolakPiecePickDirection === 'right',
    null,
    { timeout: 15000 }
  );
}

function sideSuffix(side) {
  if (side < 0) return 'Minus1';
  if (side > 0) return 'Plus1';
  return '0';
}

function sizeCap(size) {
  return size[0].toUpperCase() + size.slice(1);
}

async function waitForPickTargets(page, direction) {
  await page.waitForFunction(
    expectedDirection => {
      const d = document.body.dataset;
      return d.yakolakPiecePickDirection === expectedDirection &&
             d.yakolakPiecePickModel === 'mesh-triangle-frontmost' &&
             Number(d.yakolakTestSideMinus1MediumX || 0) > 0 &&
             Number(d.yakolakTestSide0SmallX || 0) > 0 &&
             Number(d.yakolakTestSide0MediumX || 0) > 0 &&
             Number(d.yakolakTestSide0LargeX || 0) > 0 &&
             Number(d.yakolakTestSidePlus1MediumX || 0) > 0;
    },
    direction,
    { timeout: 7000 }
  );
  // Target telemetry is refreshed every ~220 ms while browser automation is active.
  await page.waitForTimeout(280);
}

async function pickTarget(page, side, size, inputMode) {
  const suffix = sideSuffix(side);
  const cap = sizeCap(size);
  const target = await page.evaluate(({ suffix, cap }) => {
    const d = document.body.dataset;
    return {
      x: Number(d[`yakolakTestSide${suffix}${cap}X`]),
      y: Number(d[`yakolakTestSide${suffix}${cap}Y`])
    };
  }, { suffix, cap });
  expect(Number.isFinite(target.x) && target.x > 0).toBeTruthy();
  expect(Number.isFinite(target.y) && target.y > 0).toBeTruthy();
  if (inputMode === 'touch') await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
}

async function expectExactStone(page, direction, side, size) {
  const expectedName = `Stone_${direction}_${side}_${size}`;
  await page.waitForFunction(
    ({ expectedName, size }) => document.body.dataset.yakolakSelected === expectedName &&
                              document.body.dataset.yakolakSelectedSize === size &&
                              document.body.dataset.yakolakTray === 'open',
    { expectedName, size },
    { timeout: 5000 }
  );
  const selected = await page.evaluate(() => ({
    name: document.body.dataset.yakolakSelected,
    size: document.body.dataset.yakolakSelectedSize,
    tray: document.body.dataset.yakolakTray
  }));
  expect(selected.name).toBe(expectedName);
  expect(selected.size).toBe(size);
  expect(selected.tray).toBe('open');
}

async function clearSelection(page) {
  await page.evaluate(() => window.yakolakTestClearSelection());
  await page.waitForFunction(
    () => document.body.dataset.yakolakTray === 'closed' &&
          document.body.dataset.yakolakGameplay === 'ready',
    null,
    { timeout: 5000 }
  );
  await page.waitForTimeout(320);
}

async function verifyRaisedTraySwitching(page, direction, side, inputMode) {
  await waitForPickTargets(page, direction);
  await pickTarget(page, side, 'large', inputMode);
  await expectExactStone(page, direction, side, 'large');

  // The reported failure lived here: after the tray opened, the old code used
  // overlapping solid AABB proxies. Switch across both holes while the tray is
  // still open and require the exact rendered stone identity on every tap.
  await page.waitForTimeout(340);
  await pickTarget(page, side, 'small', inputMode);
  await expectExactStone(page, direction, side, 'small');

  await page.waitForTimeout(340);
  await pickTarget(page, side, 'medium', inputMode);
  await expectExactStone(page, direction, side, 'medium');
  await clearSelection(page);
}

async function verifyNeighborStacks(page, direction, inputMode) {
  for (const side of [-1, 0, 1]) {
    await waitForPickTargets(page, direction);
    await pickTarget(page, side, 'medium', inputMode);
    await expectExactStone(page, direction, side, 'medium');
    await clearSelection(page);
  }
}

test('desktop mouse keeps exact L/M/S identity across tray, neighbors, zoom and camera angle', async ({ page }) => {
  test.setTimeout(150000);
  const failures = [];
  const songRequests = [];
  await startPassPlay(page, failures, songRequests);
  expect(songRequests).toEqual([]);

  const firstImage = await page.screenshot({ fullPage: false });
  const firstRatio = visibleSceneRatio(firstImage);
  expect(firstRatio).toBeGreaterThan(0.01);

  await verifyRaisedTraySwitching(page, 'right', 0, 'mouse');
  await verifyNeighborStacks(page, 'right', 'mouse');

  // Exercise the same exact mesh ray after desktop FOV zoom changes.
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakCameraZoomRatio || 1) < 0.99,
    null,
    { timeout: 5000 }
  );
  await page.waitForTimeout(320);
  await verifyRaisedTraySwitching(page, 'right', 0, 'mouse');

  // Move once to rotate the active camera to player two, then repeat the exact
  // stone checks from a different perspective while preserving the chosen FOV.
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakMoves || 0) >= 1 &&
          document.body.dataset.yakolakCurrentPlayer === 'back' &&
          document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCameraStage === 'ready' &&
          document.body.dataset.yakolakCameraCurrent === 'true' &&
          document.body.dataset.yakolakBoardVisible === 'true' &&
          document.body.dataset.yakolakCameraFocusInside === 'true' &&
          Number(document.body.dataset.yakolakCameraFacing || 0) > 0.995 &&
          document.body.dataset.yakolakPiecePickDirection === 'back',
    null,
    { timeout: 20000 }
  );
  await expectContinuousZoom(page);
  await verifyRaisedTraySwitching(page, 'back', 0, 'mouse');
  await verifyNeighborStacks(page, 'back', 'mouse');

  const secondHealth = await cameraHealth(page);
  expect(secondHealth.player).toBe('back');
  expect(secondHealth.direction).toBe('back');
  expect(secondHealth.current).toBe('true');
  expect(secondHealth.boardVisible).toBe('true');
  expect(secondHealth.focusInside).toBe('true');
  expect(secondHealth.facing).toBeGreaterThan(0.995);

  const secondImage = await page.screenshot({ fullPage: false });
  const secondRatio = visibleSceneRatio(secondImage);
  expect(secondRatio).toBeGreaterThan(0.01);
  expect(secondRatio).toBeGreaterThan(firstRatio * 0.20);

  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakMoves || 0) >= 2 &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCameraCurrent === 'true' &&
          document.body.dataset.yakolakBoardVisible === 'true' &&
          Number(document.body.dataset.yakolakCameraFacing || 0) > 0.995,
    null,
    { timeout: 20000 }
  );
  await expectContinuousZoom(page);

  expect(songRequests).toEqual([]);
  expect(failures).toEqual([]);
  console.log(`YAKOLAK_EXACT_DESKTOP_PICK_OK first=${firstRatio.toFixed(4)} second=${secondRatio.toFixed(4)} input=mouse geometry=mesh-triangle`);
});

test('mobile touch uses the same exact stone ray in portrait and after camera rotation', async ({ browser }) => {
  test.setTimeout(150000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  const failures = [];
  const songRequests = [];

  try {
    await startPassPlay(page, failures, songRequests);
    await verifyRaisedTraySwitching(page, 'right', 0, 'touch');
    await verifyNeighborStacks(page, 'right', 'touch');

    await page.evaluate(() => window.yakolakTestPlayOneMove());
    await page.waitForFunction(
      () => Number(document.body.dataset.yakolakMoves || 0) >= 1 &&
            document.body.dataset.yakolakCurrentPlayer === 'back' &&
            document.body.dataset.yakolakGameplay === 'ready' &&
            document.body.dataset.yakolakCameraStage === 'ready' &&
            document.body.dataset.yakolakPiecePickDirection === 'back',
      null,
      { timeout: 20000 }
    );
    await verifyRaisedTraySwitching(page, 'back', 0, 'touch');
    await verifyNeighborStacks(page, 'back', 'touch');

    expect(songRequests).toEqual([]);
    expect(failures).toEqual([]);
    console.log('YAKOLAK_EXACT_MOBILE_PICK_OK viewport=390x844 input=touch geometry=mesh-triangle angles=right,back');
  } finally {
    await context.close();
  }
});
