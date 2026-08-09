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
  const startY = Math.floor(png.height * 0.20); // ignore the HUD area
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

test('first real move hands the same-device game to player two without a black scene or zoom snap', async ({ page }) => {
  test.setTimeout(120000);
  const failures = [];
  const songRequests = [];

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => {
    const url = request.url();
    const errorText = request.failure()?.errorText || '';
    // Chromium can cancel one duplicate/speculative WASM fetch after Godot has
    // already booted from the successful request. Keep real WASM/network
    // failures fatal; ignore only this exact harmless cancellation.
    if (url.endsWith('/index.wasm') && errorText === 'net::ERR_ABORTED') return;
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
          typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestPlayOneMove === 'function',
    null,
    { timeout: 60000 }
  );

  // The full song must already be inside the downloaded game package.
  expect(songRequests).toEqual([]);

  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakCameraStage === 'ready' &&
          document.body.dataset.yakolakCameraCurrent === 'true' &&
          document.body.dataset.yakolakBoardVisible === 'true' &&
          Number(document.body.dataset.yakolakCameraFacing || 0) > 0.995,
    null,
    { timeout: 15000 }
  );

  const firstImage = await page.screenshot({ fullPage: false });
  const firstRatio = visibleSceneRatio(firstImage);
  expect(firstRatio).toBeGreaterThan(0.01);

  // Apply real desktop zoom before changing turns. The chosen ratio must remain
  // part of the camera tween itself, not disappear during motion then snap back.
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakCameraZoomRatio || 1) < 0.99,
    null,
    { timeout: 5000 }
  );

  // Reproduce the exact reported failure: player 1 places one stone, then the
  // camera hands the same device to player 2.
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakMoves || 0) >= 1 &&
          document.body.dataset.yakolakCurrentPlayer === 'back' &&
          document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCameraStage === 'ready' &&
          document.body.dataset.yakolakCameraCurrent === 'true' &&
          document.body.dataset.yakolakBoardVisible === 'true' &&
          document.body.dataset.yakolakCameraFocusInside === 'true' &&
          Number(document.body.dataset.yakolakCameraFacing || 0) > 0.995,
    null,
    { timeout: 20000 }
  );
  await expectContinuousZoom(page);

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

  // A second real move proves the camera can hand control back again too and
  // the same zoom ratio remains continuous in the reverse direction.
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
  console.log(`YAKOLAK_REAL_TURN_CAMERA_OK first=${firstRatio.toFixed(4)} second=${secondRatio.toFixed(4)}`);
});
