const { test, expect } = require('@playwright/test');

// Final preview gate: the loader silhouette, 3D star, settled table, and approved
// unboxing must remain one ordered journey without slowing the visible motion.
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  video: 'on',
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

test('the exact loading star continuously becomes the approved table before unboxing', async ({ page }) => {
  test.setTimeout(180000);
  const failures = [];
  const sequence = [];

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (text.includes('YAKOLAK_PREINTRO_') || text.includes('YAKOLAK_INTRO_PHASE')) sequence.push(text);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });

  const loader = page.locator('#yakolakLoader');
  await expect(loader).toBeVisible();
  expect(await loader.getAttribute('data-loader-source')).toBe('v129-loading-star-motion');
  expect(await page.locator('.loadingStar').getAttribute('viewBox')).toBe('0 0 802 798');
  expect(await page.locator('.loadingStar path').getAttribute('d')).toContain('M0,-191.393');

  // The handoff is deliberately brief. Accept any later pre-intro state,
  // then verify the exact timeline order from the emitted events below.
  await page.waitForFunction(
    () => document.body.dataset.yakolakPreIntroShape === 'loading-star-to-approved-table' &&
          document.body.dataset.yakolakLoaderHandoff === 'continuous-star-to-table' &&
          document.body.dataset.yakolakPreIntro !== 'waiting-for-handoff',
    null,
    { timeout: 70000 }
  );
  await expect(loader).toHaveCount(0, { timeout: 5000 });

  await page.waitForFunction(
    () => document.body.dataset.yakolakPreIntro === 'complete' &&
          document.body.dataset.yakolakIntro === 'playing' &&
          ['lid-shaking', 'lid-rising', 'bases-deploying', 'stones-moving'].includes(document.body.dataset.yakolakPhase),
    null,
    { timeout: 15000 }
  );

  expect(await page.evaluate(() => document.body.dataset.yakolakTable)).toBe('approved-star-svg');
  expect(await page.evaluate(() => document.body.dataset.yakolakTableLevel)).toBe('true');
  expect(await page.evaluate(() => document.body.dataset.yakolakPreIntroDuration)).toBe('3360');

  const joined = sequence.join('\n');
  const handoff = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE handoff'));
  const floating = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE star-floating'));
  const forming = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE table-forming'));
  const settling = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE table-settling'));
  const settled = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE table-settled'));
  const completed = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_COMPLETE'));
  const unboxing = sequence.findIndex((line, index) =>
    index > completed && line.includes('YAKOLAK_INTRO_PHASE lid-shaking')
  );

  expect(handoff).toBeGreaterThanOrEqual(0);
  expect(floating).toBeGreaterThan(handoff);
  expect(forming).toBeGreaterThan(floating);
  expect(settling).toBeGreaterThan(forming);
  expect(settled).toBeGreaterThan(settling);
  expect(completed).toBeGreaterThan(settled);
  expect(unboxing).toBeGreaterThan(completed);
  expect(joined).toContain('star=loading-star table=approved-star-svg');
  expect(failures).toEqual([]);
});
