const { test, expect } = require('@playwright/test');

// Visual gate: exact loader -> polished table formation -> closed box arrival ->
// complete unboxing. Fast phases are verified from emitted events, not by racing
// the browser dataset for a single short frame.
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

test('the polished loading-star journey reaches the complete playable intro', async ({ page }) => {
  test.setTimeout(180000);
  const failures = [];
  const sequence = [];

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (text.includes('YAKOLAK_PREINTRO_') || text.includes('YAKOLAK_INTRO_') || text.includes('YAKOLAK_VISUAL_')) sequence.push(text);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });

  const loader = page.locator('#yakolakLoader');
  await expect(loader).toBeVisible();
  expect(await loader.getAttribute('data-loader-source')).toBe('v129-loading-star-motion');
  expect(await page.locator('.loadingStar').getAttribute('viewBox')).toBe('0 0 802 798');
  expect(await page.locator('.loadingStar path').getAttribute('d')).toContain('M0,-191.393');
  await page.screenshot({ path: 'web/preintro-01-loader.png' });

  await page.waitForFunction(
    () => document.body.dataset.yakolakVisual === 'studio-neutral-v2' &&
          document.body.dataset.yakolakLighting === 'balanced-studio' &&
          document.body.dataset.yakolakPalette === 'professional-neutral' &&
          document.body.dataset.yakolakMotion === 'cinematic-continuous-v2' &&
          document.body.dataset.yakolakPreIntroShape === 'loading-star-to-approved-table' &&
          document.body.dataset.yakolakLoaderHandoff === 'continuous-star-to-table' &&
          document.body.dataset.yakolakPreIntro !== 'waiting-for-handoff',
    null,
    { timeout: 70000 }
  );
  await expect(loader).toHaveCount(0, { timeout: 5000 });

  await expect.poll(
    () => sequence.some(line => line.includes('YAKOLAK_PREINTRO_PHASE table-settled')),
    { timeout: 10000 }
  ).toBe(true);
  await page.screenshot({ path: 'web/preintro-02-table-transition.png' });

  await expect.poll(
    () => sequence.some(line => line.includes('YAKOLAK_PREINTRO_PHASE box-arriving')),
    { timeout: 10000 }
  ).toBe(true);
  await page.waitForTimeout(220);
  await page.screenshot({ path: 'web/preintro-03-box-arriving.png' });

  await page.waitForFunction(
    () => document.body.dataset.yakolakPreIntro === 'complete' &&
          document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakPhase === 'complete' &&
          document.body.dataset.yakolakGameplay === 'ready',
    null,
    { timeout: 25000 }
  );
  await page.screenshot({ path: 'web/preintro-04-unboxing-complete.png' });

  expect(await page.evaluate(() => document.body.dataset.yakolakTable)).toBe('approved-star-svg');
  expect(await page.evaluate(() => document.body.dataset.yakolakTableLevel)).toBe('true');
  expect(await page.evaluate(() => document.body.dataset.yakolakPreIntroDuration)).toBe('2880');

  const joined = sequence.join('\n');
  const visual = sequence.findIndex(line => line.includes('YAKOLAK_VISUAL_POLISH_READY'));
  const handoff = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE handoff'));
  const floating = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE star-floating'));
  const forming = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE table-forming'));
  const settling = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE table-settling'));
  const settled = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE table-settled'));
  const boxArriving = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE box-arriving'));
  const preintroComplete = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_COMPLETE'));
  const lidShake = sequence.findIndex((line, index) => index > preintroComplete && line.includes('YAKOLAK_INTRO_PHASE lid-shaking'));
  const lidRise = sequence.findIndex((line, index) => index > lidShake && line.includes('YAKOLAK_INTRO_PHASE lid-rising'));
  const bases = sequence.findIndex((line, index) => index > lidRise && line.includes('YAKOLAK_INTRO_PHASE bases-deploying'));
  const stones = sequence.findIndex((line, index) => index > bases && line.includes('YAKOLAK_INTRO_PHASE stones-moving'));
  const introComplete = sequence.findIndex((line, index) => index > stones && line.includes('YAKOLAK_INTRO_COMPLETE'));

  expect(visual).toBeGreaterThanOrEqual(0);
  expect(handoff).toBeGreaterThan(visual);
  expect(floating).toBeGreaterThan(handoff);
  expect(forming).toBeGreaterThan(floating);
  expect(settling).toBeGreaterThan(forming);
  expect(settled).toBeGreaterThan(settling);
  expect(boxArriving).toBeGreaterThan(settled);
  expect(preintroComplete).toBeGreaterThan(boxArriving);
  expect(lidShake).toBeGreaterThan(preintroComplete);
  expect(lidRise).toBeGreaterThan(lidShake);
  expect(bases).toBeGreaterThan(lidRise);
  expect(stones).toBeGreaterThan(bases);
  expect(introComplete).toBeGreaterThan(stones);
  expect(joined).toContain('motion=cinematic-continuous-v2');
  expect(joined).toContain('palette=studio-neutral');
  expect(failures).toEqual([]);
});
