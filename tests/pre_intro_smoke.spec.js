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

const intersectionArea = (a, b) => {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
};

const centerX = rect => (rect.left + rect.right) / 2;

test('balanced logos fade around an exact unmirrored star handoff and a direct camera move', async ({ page }) => {
  test.setTimeout(180000);
  const failures = [];
  const sequence = [];

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (text.includes('YAKOLAK_PREINTRO_') || text.includes('YAKOLAK_INTRO_') || text.includes('YAKOLAK_VISUAL_') || text.includes('YAKOLAK_PIXEL_MATCH_') || text.includes('YAKOLAK_REFINEMENT_')) sequence.push(text);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'commit' });

  const loader = page.locator('#yakolakLoader');
  await expect(loader).toBeVisible({ timeout: 5000 });
  expect(await loader.getAttribute('data-loader-source')).toBe('v129-loading-star-motion');
  expect(await page.locator('.loadingStar').getAttribute('viewBox')).toBe('0 0 802 798');
  expect(await page.locator('.loadingStar path').getAttribute('d')).toContain('M0,-191.393');
  await expect(page.locator('.loaderLogoYakolak')).toHaveAttribute('src', 'yakolak-logo.svg');
  await expect(page.locator('.loaderLogoMtkyf svg')).toHaveCount(1);

  await page.waitForTimeout(160);
  const initial = await page.evaluate(() => ({
    yakolakOpacity: Number(getComputedStyle(document.querySelector('.loaderLogoYakolak')).opacity),
    mtkyfOpacity: Number(getComputedStyle(document.querySelector('.loaderLogoMtkyf')).opacity),
    backdrop: getComputedStyle(document.querySelector('.loaderBackdrop')).backgroundColor,
    starColor: getComputedStyle(document.querySelector('.loadingStar path')).fill,
    shadow: getComputedStyle(document.querySelector('.loadingShadow')).backgroundColor
  }));
  expect(initial.yakolakOpacity).toBeLessThan(0.05);
  expect(initial.mtkyfOpacity).toBeLessThan(0.05);
  expect(initial.backdrop).toBe('rgb(0, 0, 0)');
  expect(initial.starColor).toBe('rgb(255, 255, 255)');
  expect(initial.shadow).toBe('rgb(200, 204, 211)');
  await page.screenshot({ path: 'web/preintro-01-black-loader-logo.png' });

  await page.waitForFunction(
    () => document.body.dataset.yakolakBrandPhase === 'visible',
    null,
    { timeout: 5000 }
  );
  const layout = await page.evaluate(() => {
    const toRect = element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return {
      yakolak: toRect(document.querySelector('.loaderLogoYakolak')),
      star: toRect(document.querySelector('.loadingStar')),
      mtkyf: toRect(document.querySelector('.loaderLogoMtkyf')),
      yakolakOpacity: Number(getComputedStyle(document.querySelector('.loaderLogoYakolak')).opacity),
      mtkyfOpacity: Number(getComputedStyle(document.querySelector('.loaderLogoMtkyf')).opacity)
    };
  });
  expect(layout.yakolakOpacity).toBeGreaterThan(0.95);
  expect(layout.mtkyfOpacity).toBeGreaterThan(0.95);
  expect(intersectionArea(layout.yakolak, layout.star)).toBe(0);
  expect(intersectionArea(layout.star, layout.mtkyf)).toBe(0);
  expect(layout.yakolak.bottom).toBeLessThan(layout.star.top - 20);
  expect(layout.star.bottom).toBeLessThan(layout.mtkyf.top - 20);
  expect(Math.abs(centerX(layout.yakolak) - 195)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(centerX(layout.star) - 195)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(centerX(layout.mtkyf) - 195)).toBeLessThanOrEqual(1.5);
  await page.screenshot({ path: 'web/preintro-02-logo-to-wall-star-hold.png' });

  await page.waitForFunction(
    () => document.body.dataset.yakolakMatchReady === 'true' &&
          document.body.dataset.yakolakVisual === 'black-studio-v3' &&
          document.body.dataset.yakolakShapeOrientation === 'svg-native-unmirrored' &&
          document.body.dataset.yakolakCameraMotion === 'direct-centered-lerp' &&
          window.__yakolakMatch?.star?.w > 200,
    null,
    { timeout: 70000 }
  );

  const targetGeometry = await page.evaluate(() => ({
    star: window.__yakolakMatch.star,
    facing: Number(document.body.dataset.yakolakMatchFacing || 0),
    centerError: Number(document.body.dataset.yakolakMatchCenterError || 999)
  }));
  expect(targetGeometry.facing).toBeGreaterThan(0.98);
  expect(targetGeometry.centerError).toBeLessThanOrEqual(1.5);

  await page.waitForFunction(
    () => window.__yakolakHandoffHistory?.includes('matched') &&
          window.__yakolakBrandHistory?.includes('hidden-after-fade'),
    null,
    { timeout: 10000 }
  );
  const match = await page.evaluate(() => ({
    domError: Number(document.body.dataset.yakolakMatchErrorPx || 999),
    centerError: Number(document.body.dataset.yakolakMatchCenterError || 999),
    handoffHistory: window.__yakolakHandoffHistory,
    brandHistory: window.__yakolakBrandHistory,
    star: window.__yakolakMatch?.star || null,
    canvas: (() => {
      const r = document.getElementById('canvas')?.getBoundingClientRect();
      return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
    })()
  }));
  expect(match.canvas).not.toBeNull();
  expect(match.domError).toBeLessThanOrEqual(1.5);
  expect(match.centerError).toBeLessThanOrEqual(1.5);
  expect(match.handoffHistory).toEqual(['waiting', 'locking', 'matching', 'matched']);
  expect(match.brandHistory).toEqual(['hidden', 'entering', 'visible', 'leaving', 'hidden-after-fade']);
  expect(Math.abs((match.star.x + match.star.w / 2) - (match.canvas.x + match.canvas.w / 2))).toBeLessThanOrEqual(1.5);
  expect(Math.abs((match.star.y + match.star.h / 2) - (match.canvas.y + match.canvas.h / 2))).toBeLessThanOrEqual(1.5);
  await page.screenshot({ path: 'web/preintro-03-pixel-matched.png' });

  await expect.poll(
    () => sequence.some(line => line.includes('YAKOLAK_PREINTRO_PHASE camera-orbit')),
    { timeout: 10000 }
  ).toBe(true);
  expect(await page.evaluate(() => document.body.dataset.yakolakCameraMotion)).toBe('direct-centered-lerp');
  expect(await page.evaluate(() => document.body.dataset.yakolakShapeOrientation)).toBe('svg-native-unmirrored');
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
  expect(await page.evaluate(() => document.body.dataset.yakolakLoaderPalette)).toBe('black-white-light-gray-shadow');
  expect(await page.evaluate(() => document.body.dataset.yakolakHandoffSequencing)).toBe('balanced-logos-fade-then-star');
  expect(await page.evaluate(() => document.body.dataset.yakolakBrandLayout)).toBe('yakolak-top-star-center-mtkyf-bottom');

  const joined = sequence.join('\n');
  const visual = sequence.findIndex(line => line.includes('YAKOLAK_VISUAL_POLISH_READY'));
  const refinement = sequence.findIndex(line => line.includes('YAKOLAK_REFINEMENT_READY'));
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
  expect(refinement).toBeGreaterThan(visual);
  expect(matchReady).toBeGreaterThan(refinement);
  expect(matched).toBeGreaterThan(matchReady);
  expect(morph).toBeGreaterThan(matched);
  expect(settling).toBeGreaterThan(morph);
  expect(orbit).toBeGreaterThan(settling);
  expect(cameraSettled).toBeGreaterThan(orbit);
  expect(boxArriving).toBeGreaterThan(cameraSettled);
  expect(preintroComplete).toBeGreaterThan(boxArriving);
  expect(lidShake).toBeGreaterThan(preintroComplete);
  expect(introComplete).toBeGreaterThan(lidShake);
  expect(joined).toContain('shape=svg-native-unmirrored camera=direct-look-at logos=balanced-fade');
  expect(failures).toEqual([]);
});
