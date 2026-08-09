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

test('setup stays compact, uses real Thmanyah weights, and leaves no empty gameplay chrome above it', async ({ page }) => {
  test.setTimeout(120000);
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => {
    const url = request.url();
    const errorText = request.failure()?.errorText || '';
    // Chromium can cancel one duplicate/speculative WASM fetch after Godot has
    // already booted from the successful request. This is harmless and is
    // treated the same way as the main gameplay browser smoke test.
    if (url.endsWith('/index.wasm') && errorText === 'net::ERR_ABORTED') return;
    failures.push(`requestfailed: ${url} ${errorText}`);
  });
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestShowSetup === 'function' &&
          typeof window.yakolakTestStartPassPlay === 'function',
    null,
    { timeout: 60000 }
  );

  await page.evaluate(() => window.yakolakTestShowSetup());
  await page.waitForFunction(
    () => document.body.dataset.yakolakSetupLayout === 'split-wizard-v1' &&
          document.body.dataset.yakolakSetupWizard === 'color' &&
          document.body.dataset.yakolakArabicFont === 'thmanyah' &&
          document.body.dataset.yakolakSetupFontFamily === 'thmanyah-sans' &&
          document.body.dataset.yakolakSetupFontWeights === 'light,medium,bold' &&
          document.body.dataset.yakolakSetupScrollable === 'false' &&
          document.body.dataset.yakolakHudVisibility === 'hidden' &&
          Number.isFinite(Number(document.body.dataset.yakolakBoardSetupYRatio)),
    null,
    { timeout: 15000 }
  );

  const setup = await page.evaluate(() => ({
    boardY: Number(document.body.dataset.yakolakBoardSetupYRatio),
    cardBottom: Number(document.body.dataset.yakolakSetupCardBottomRatio),
    font: document.body.dataset.yakolakArabicFont,
    fontFamily: document.body.dataset.yakolakSetupFontFamily,
    fontWeights: document.body.dataset.yakolakSetupFontWeights,
    layout: document.body.dataset.yakolakSetupLayout,
    scrollable: document.body.dataset.yakolakSetupScrollable,
    hud: document.body.dataset.yakolakHudVisibility
  }));

  expect(setup.font).toBe('thmanyah');
  expect(setup.fontFamily).toBe('thmanyah-sans');
  expect(setup.fontWeights).toBe('light,medium,bold');
  expect(setup.layout).toBe('split-wizard-v1');
  expect(setup.scrollable).toBe('false');
  expect(setup.hud).toBe('hidden');
  expect(setup.cardBottom).toBeLessThan(0.50);
  expect(setup.boardY).toBeGreaterThan(0.58);
  expect(setup.boardY).toBeLessThan(0.88);
  expect(setup.boardY - setup.cardBottom).toBeGreaterThan(0.10);

  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakQuickMenu === 'ready' &&
          document.body.dataset.yakolakGameplayFont === 'thmanyah' &&
          document.body.dataset.yakolakGameplayFontWeights === 'regular,medium,bold' &&
          document.body.dataset.yakolakScoreHud === 'hidden' &&
          document.body.dataset.yakolakResultOverlay === 'hidden',
    null,
    { timeout: 20000 }
  );

  expect(failures).toEqual([]);
  console.log(`YAKOLAK_SPLIT_SETUP_OK thmanyah=multi-weight card=${setup.cardBottom.toFixed(3)} board=${setup.boardY.toFixed(3)} hud=${setup.hud}`);
});