const { test, expect } = require('@playwright/test');

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

test('black loader pixel-matches the real table, hands off the logo, and reaches playable intro', async ({ page }) => {
  test.setTimeout(180000);
  const failures = [];
  const sequence = [];

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (text.includes('YAKOLAK_PREINTRO_') || text.includes('YAKOLAK_INTRO_') || text.includes('YAKOLAK_VISUAL_') || text.includes('YAKOLAK_PIXEL_MATCH_')) sequence.push(text);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });

  const loader = page.locator('#yakolakLoader');
  await expect(loader).toBeVisible();
  expect(await loader.getAttribute('data-loader-source')).toBe('v129-loading-star-motion');
  expect(await page.locator('.loadingStar').getAttribute('viewBox')).toBe('0 0 802 798');
  expect(await page.locator('.loadingStar path').getAttribute('d')).toContain('M0,-191.393');
  await expect(page.locator('.loaderLogo')).toHaveAttribute('src', 'yakolak-logo.svg');
  await page.waitForTimeout(520);

  const palette = await page.evaluate(() => {
    const backdrop = document.querySelector('.loaderBackdrop');
    const path = document.querySelector('.loadingStar path');
    const shadow = document.querySelector('.loadingShadow');
    const logo = document.querySelector('.loaderLogo');
    return {
      backdrop: backdrop ? getComputedStyle(backdrop).backgroundColor : '',
      star: path ? getComputedStyle(path).fill : '',
      shadow: shadow ? getComputedStyle(shadow).backgroundColor : '',
      logoOpacity: logo ? Number(getComputedStyle(logo).opacity) : 0,
      logoLoaded: Boolean(logo && logo.complete && logo.naturalWidth > 0)
    };
  });
  expect(palette.backdrop).toBe('rgb(0, 0, 0)');
  expect(palette.star).toBe('rgb(255, 255, 255)');
  expect(palette.shadow).toBe('rgb(113, 130, 255)');
  expect(palette.logoOpacity).toBeGreaterThan(0.45);
  expect(palette.logoLoaded).toBe(true);
  await page.screenshot({ path: 'web/preintro-01-black-loader-logo.png' });

  await page.waitForFunction(
    () => document.body.dataset.yakolakPreIntro === 'match-ready' &&
          document.body.dataset.yakolakVisual === 'black-studio-v3' &&
          document.body.dataset.yakolakWallLogo === 'shared-yakolak-svg' &&
          window.__yakolakMatch?.star?.w > 200 &&
          window.__yakolakMatch?.logo?.w > 40,
    null,
    { timeout: 70000 }
  );
  await page.screenshot({ path: 'web/preintro-02-match-ready.png' });

  await page.waitForFunction(
    () => document.body.dataset.yakolakLoaderHandoff === 'matched',
    null,
    { timeout: 5000 }
  );
  const match = await page.evaluate(() => ({
    domError: Number(document.body.dataset.yakolakMatchErrorPx || 999),
    centerError: Number(document.body.dataset.yakolakMatchCenterError || 999),
    star: window.__yakolakMatch?.star || null,
    logo: window.__yakolakMatch?.logo || null
  }));
  expect(match.domError).toBeLessThanOrEqual(1.5);
  expect(match.centerError).toBeLessThanOrEqual(1.5);
  expect(Math.abs((match.star.x + match.star.w / 2) - 195)).toBeLessThanOrEqual(1.5);
  expect(Math.abs((match.star.y + match.star.h / 2) - 422)).toBeLessThanOrEqual(1.5);
  await page.screenshot({ path: 'web/preintro-03-pixel-matched.png' });

  await expect.poll(
    () => sequence.some(line => line.includes('YAKOLAK_PREINTRO_PHASE camera-orbit')),
    { timeout: 10000 }
  ).toBe(true);
  await page.screenshot({ path: 'web/preintro-04-camera-orbit.png' });

  await page.waitForFunction(
    () => document.body.dataset.yakolakPreIntro === 'complete' &&
          document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakPhase === 'complete' &&
          document.body.dataset.yakolakGameplay === 'ready',
    null,
    { timeout: 25000 }
  );
  await page.screenshot({ path: 'web/preintro-05-unboxing-complete.png' });

  expect(await page.evaluate(() => document.body.dataset.yakolakTable)).toBe('approved-star-svg');
  expect(await page.evaluate(() => document.body.dataset.yakolakTableLevel)).toBe('true');
  expect(await page.evaluate(() => document.body.dataset.yakolakPreIntroDuration)).toBe('3150');
  expect(await page.evaluate(() => document.body.dataset.yakolakMotion)).toBe('pixel-matched-2d-to-3d-v3');
  expect(await page.evaluate(() => document.body.dataset.yakolakLoaderPalette)).toBe('black-white-indigo-shadow');

  const joined = sequence.join('\n');
  const visual = sequence.findIndex(line => line.includes('YAKOLAK_VISUAL_POLISH_READY'));
  const matchReady = sequence.findIndex(line => line.includes('YAKOLAK_PIXEL_MATCH_READY'));
  const matched = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE matched'));
  const morph = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE star-to-3d'));
  const settling = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE table-settling'));
  const orbit = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE camera-orbit'));
  const cameraSettled = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE camera-settled'));
  const boxArriving = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_PHASE box-arriving'));
  const preintroComplete = sequence.findIndex(line => line.includes('YAKOLAK_PREINTRO_COMPLETE'));
  const lidShake = sequence.findIndex((line, index) => index > preintroComplete && line.includes('YAKOLAK_INTRO_PHASE lid-shaking'));
  const introComplete = sequence.findIndex((line, index) => index > lidShake && line.includes('YAKOLAK_INTRO_COMPLETE'));

  expect(visual).toBeGreaterThanOrEqual(0);
  expect(matchReady).toBeGreaterThan(visual);
  expect(matched).toBeGreaterThan(matchReady);
  expect(morph).toBeGreaterThan(matched);
  expect(settling).toBeGreaterThan(morph);
  expect(orbit).toBeGreaterThan(settling);
  expect(cameraSettled).toBeGreaterThan(orbit);
  expect(boxArriving).toBeGreaterThan(cameraSettled);
  expect(preintroComplete).toBeGreaterThan(boxArriving);
  expect(lidShake).toBeGreaterThan(preintroComplete);
  expect(introComplete).toBeGreaterThan(lidShake);
  expect(joined).toContain('match=pixel-exact logo=wall camera=side');
  expect(failures).toEqual([]);
});
