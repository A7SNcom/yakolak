import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'small portrait', width: 320, height: 568, side: false },
  { name: 'medium portrait', width: 390, height: 844, side: false },
  { name: 'small landscape', width: 568, height: 320, side: true },
  { name: 'medium landscape', width: 844, height: 390, side: true },
  { name: 'desktop', width: 1366, height: 768, side: false },
  { name: 'wide desktop', width: 1920, height: 1080, side: false },
];

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

function watchFailures(page) {
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => {
    const url = request.url();
    const errorText = request.failure()?.errorText || '';
    if ((url.endsWith('/index.wasm') || url.endsWith('/index.pck')) && errorText === 'net::ERR_ABORTED') return;
    failures.push(`requestfailed: ${url} ${errorText}`);
  });
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });
  return failures;
}

async function waitForSetup(page) {
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestShowSetup === 'function' &&
          typeof window.yakolakTestStartPassPlay === 'function',
    null,
    { timeout: 60000 }
  );
}

async function readSetupMetrics(page, expectedMode) {
  await page.waitForFunction(
    mode => document.body.dataset.yakolakSetupWizard === 'color' &&
            document.body.dataset.yakolakSetupDirection === 'rtl' &&
            document.body.dataset.yakolakSetupMotion === 'soft-panel-and-table-v3' &&
            document.body.dataset.yakolakSetupLayoutMode === mode &&
            document.body.dataset.yakolakArabicFont === 'thmanyah',
    expectedMode,
    { timeout: 15000 }
  );

  // Camera and panel tweens are deliberate. Measure only the settled composition,
  // never the transient frame produced while an orientation change is in flight.
  await page.waitForTimeout(900);
  await page.waitForFunction(
    mode => document.body.dataset.yakolakSetupLayoutMode === mode &&
            Number.isFinite(Number(document.body.dataset.yakolakBoardSetupXRatio)) &&
            Number.isFinite(Number(document.body.dataset.yakolakBoardSetupYRatio)) &&
            Number.isFinite(Number(document.body.dataset.yakolakSetupCardLeftRatio)) &&
            Number.isFinite(Number(document.body.dataset.yakolakSetupCardTopRatio)) &&
            Number.isFinite(Number(document.body.dataset.yakolakSetupCardRightRatio)) &&
            Number.isFinite(Number(document.body.dataset.yakolakSetupCardBottomRatio)),
    expectedMode,
    { timeout: 15000 }
  );

  return page.evaluate(() => ({
    boardX: Number(document.body.dataset.yakolakBoardSetupXRatio),
    boardY: Number(document.body.dataset.yakolakBoardSetupYRatio),
    cardLeft: Number(document.body.dataset.yakolakSetupCardLeftRatio),
    cardTop: Number(document.body.dataset.yakolakSetupCardTopRatio),
    cardRight: Number(document.body.dataset.yakolakSetupCardRightRatio),
    cardBottom: Number(document.body.dataset.yakolakSetupCardBottomRatio),
    touchMin: Number(document.body.dataset.yakolakSetupTouchMin),
    safeLeft: Number(document.body.dataset.yakolakSafeLeft || 0),
    safeTop: Number(document.body.dataset.yakolakSafeTop || 0),
    safeRight: Number(document.body.dataset.yakolakSafeRight || 0),
    safeBottom: Number(document.body.dataset.yakolakSafeBottom || 0),
    font: document.body.dataset.yakolakArabicFont,
    fontFamily: document.body.dataset.yakolakSetupFontFamily,
    fontWeights: document.body.dataset.yakolakSetupFontWeights,
    direction: document.body.dataset.yakolakSetupDirection,
    layout: document.body.dataset.yakolakSetupLayout,
    layoutMode: document.body.dataset.yakolakSetupLayoutMode,
    scrollable: document.body.dataset.yakolakSetupScrollable,
    hud: document.body.dataset.yakolakHudVisibility,
    motion: document.body.dataset.yakolakSetupMotion,
  }));
}

test('setup survives the full phone/orientation/desktop matrix without clipping or camera jumps', async ({ page }) => {
  test.setTimeout(180000);
  const failures = watchFailures(page);

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await waitForSetup(page);

  for (const viewport of VIEWPORTS) {
    const expectedMode = viewport.side ? 'landscape-side' : 'portrait-stack';
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.yakolakTestShowSetup());
    const setup = await readSetupMetrics(page, expectedMode);

    expect(setup.font, viewport.name).toBe('thmanyah');
    expect(setup.fontFamily, viewport.name).toBe('thmanyah-sans');
    expect(setup.fontWeights, viewport.name).toBe('light,medium,bold');
    expect(setup.direction, viewport.name).toBe('rtl');
    expect(setup.layout, viewport.name).toBe('split-wizard-v1');
    expect(setup.scrollable, viewport.name).toBe('false');
    expect(setup.hud, viewport.name).toBe('hidden');
    expect(setup.motion, viewport.name).toBe('soft-panel-and-table-v3');
    expect(setup.touchMin, viewport.name).toBeGreaterThanOrEqual(48);

    expect(setup.cardLeft, viewport.name).toBeGreaterThanOrEqual(0);
    expect(setup.cardTop, viewport.name).toBeGreaterThanOrEqual(0);
    expect(setup.cardRight, viewport.name).toBeLessThanOrEqual(1);
    expect(setup.cardBottom, viewport.name).toBeLessThanOrEqual(1);
    expect(setup.cardRight - setup.cardLeft, viewport.name).toBeGreaterThan(0.15);
    expect(setup.cardBottom - setup.cardTop, viewport.name).toBeGreaterThan(0.12);
    expect(Number.isFinite(setup.boardX), viewport.name).toBe(true);
    expect(Number.isFinite(setup.boardY), viewport.name).toBe(true);
    expect(setup.boardX, viewport.name).toBeGreaterThan(0);
    expect(setup.boardX, viewport.name).toBeLessThan(1);
    expect(setup.boardY, viewport.name).toBeGreaterThan(0);
    expect(setup.boardY, viewport.name).toBeLessThan(1);

    if (viewport.side) {
      expect(setup.layoutMode, viewport.name).toBe('landscape-side');
      expect(setup.cardLeft, viewport.name).toBeGreaterThan(0.30);
      expect(setup.boardX, viewport.name).toBeLessThan(setup.cardLeft - 0.02);
    } else {
      expect(setup.layoutMode, viewport.name).toBe('portrait-stack');
      expect(setup.cardBottom, viewport.name).toBeLessThan(0.50);
      expect(setup.boardY - setup.cardBottom, viewport.name).toBeGreaterThan(0.08);
    }

    expect(setup.safeLeft, viewport.name).toBeGreaterThanOrEqual(0);
    expect(setup.safeTop, viewport.name).toBeGreaterThanOrEqual(0);
    expect(setup.safeRight, viewport.name).toBeGreaterThanOrEqual(0);
    expect(setup.safeBottom, viewport.name).toBeGreaterThanOrEqual(0);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakQuickMenu === 'ready' &&
          document.body.dataset.yakolakGameplayFont === 'thmanyah' &&
          document.body.dataset.yakolakGameplayFontWeights === 'regular,medium,bold' &&
          document.body.dataset.yakolakScoreHud === 'hidden' &&
          document.body.dataset.yakolakResultOverlay === 'hidden' &&
          document.body.dataset.yakolakCameraFocusInside === 'true',
    null,
    { timeout: 25000 }
  );

  expect(failures).toEqual([]);
  console.log(`YAKOLAK_RESPONSIVE_MATRIX_OK viewports=${VIEWPORTS.length} rtl=true touch=48 safe-area=true gameplay=ready`);
});