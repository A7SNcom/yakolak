const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  video: 'on',
  launchOptions: { args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'
  ] }
});

const overlap = (a, b) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const centerX = r => (r.left + r.right) / 2;

test('balanced logos, exact star teeth, direct camera, and playable intro', async ({ page }) => {
  test.setTimeout(180000);
  const failures = [];
  const events = [];
  page.on('pageerror', e => failures.push(e.message));
  page.on('requestfailed', r => failures.push(`${r.url()} ${r.failure()?.errorText || ''}`));
  page.on('console', m => {
    const text = m.text();
    console.log(`[browser:${m.type()}] ${text}`);
    if (text.includes('YAKOLAK_')) events.push(text);
    if (m.type() === 'error' && !text.includes('favicon')) failures.push(text);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'commit' });
  const loader = page.locator('#yakolakLoader');
  await expect(loader).toBeVisible({ timeout: 5000 });
  expect(await loader.getAttribute('data-loader-source')).toBe('v129-loading-star-motion');
  await expect(page.locator('.loaderLogoYakolak')).toHaveAttribute('src', 'yakolak-logo.svg');
  await expect(page.locator('.loaderLogoMtkyf svg')).toHaveCount(1);

  // Geometry is stable for the full loader lifetime, so inspect it independently
  // from the brief fade state. The exact fade sequence is verified from history.
  const first = await page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom };
    };
    return {
      history: window.__yakolakBrandHistory,
      background: getComputedStyle(document.querySelector('.loaderBackdrop')).backgroundColor,
      starColor: getComputedStyle(document.querySelector('.loadingStar path')).fill,
      shadow: getComputedStyle(document.querySelector('.loadingShadow')).backgroundColor,
      yakolak: rect('.loaderLogoYakolak'),
      star: rect('.loadingStar'),
      mtkyf: rect('.loaderLogoMtkyf')
    };
  });
  expect(first.history[0]).toBe('hidden');
  expect(first.background).toBe('rgb(0, 0, 0)');
  expect(first.starColor).toBe('rgb(255, 255, 255)');
  expect(first.shadow).toBe('rgb(200, 204, 211)');
  expect(overlap(first.yakolak, first.star)).toBe(0);
  expect(overlap(first.star, first.mtkyf)).toBe(0);
  expect(first.yakolak.bottom).toBeLessThan(first.star.top - 20);
  expect(first.star.bottom).toBeLessThan(first.mtkyf.top - 20);
  for (const r of [first.yakolak, first.star, first.mtkyf]) {
    expect(Math.abs(centerX(r) - 195)).toBeLessThanOrEqual(1.5);
  }
  await page.screenshot({ path: 'web/preintro-01-black-loader-logo.png' });
  await page.screenshot({ path: 'web/preintro-02-logo-to-wall-star-hold.png' });

  await page.waitForFunction(() =>
    document.body.dataset.yakolakMatchReady === 'true' &&
    document.body.dataset.yakolakShapeOrientation === 'svg-native-unmirrored' &&
    document.body.dataset.yakolakCameraMotion === 'direct-centered-lerp' &&
    window.__yakolakMatch?.star?.w > 200,
    null, { timeout: 70000 }
  );

  await page.waitForFunction(() =>
    window.__yakolakHandoffHistory?.includes('matched') &&
    window.__yakolakBrandHistory?.includes('hidden-after-fade'),
    null, { timeout: 12000 }
  );
  const match = await page.evaluate(() => {
    const c = document.getElementById('canvas').getBoundingClientRect();
    return {
      domError: +(document.body.dataset.yakolakMatchErrorPx || 999),
      centerError: +(document.body.dataset.yakolakMatchCenterError || 999),
      facing: +(document.body.dataset.yakolakMatchFacing || 0),
      handoff: window.__yakolakHandoffHistory,
      brands: window.__yakolakBrandHistory,
      star: window.__yakolakMatch.star,
      canvas: { x:c.left, y:c.top, w:c.width, h:c.height }
    };
  });
  expect(match.domError).toBeLessThanOrEqual(1.5);
  expect(match.centerError).toBeLessThanOrEqual(1.5);
  expect(match.facing).toBeGreaterThan(.98);
  expect(match.handoff).toEqual(['waiting','locking','matching','matched']);
  expect(match.brands).toEqual(['hidden','entering','visible','leaving','hidden-after-fade']);
  expect(Math.abs(match.star.x + match.star.w/2 - (match.canvas.x + match.canvas.w/2))).toBeLessThanOrEqual(1.5);
  expect(Math.abs(match.star.y + match.star.h/2 - (match.canvas.y + match.canvas.h/2))).toBeLessThanOrEqual(1.5);
  await page.screenshot({ path: 'web/preintro-03-pixel-matched.png' });

  await expect.poll(
    () => events.some(x => x.includes('YAKOLAK_PREINTRO_PHASE camera-orbit')),
    { timeout: 10000 }
  ).toBe(true);
  expect(await page.evaluate(() => document.body.dataset.yakolakCameraMotion)).toBe('direct-centered-lerp');
  expect(await page.evaluate(() => document.body.dataset.yakolakShapeOrientation)).toBe('svg-native-unmirrored');
  await page.screenshot({ path: 'web/preintro-04-camera-orbit.png' });

  await page.waitForFunction(() =>
    document.body.dataset.yakolakPreIntro === 'complete' &&
    document.body.dataset.yakolakIntro === 'complete' &&
    document.body.dataset.yakolakGameplay === 'ready',
    null, { timeout: 25000 }
  );
  await page.screenshot({ path: 'web/preintro-05-unboxing-complete.png' });

  expect(await page.evaluate(() => document.body.dataset.yakolakTable)).toBe('approved-star-svg');
  expect(await page.evaluate(() => document.body.dataset.yakolakTableLevel)).toBe('true');
  expect(await page.evaluate(() => document.body.dataset.yakolakLoaderPalette)).toBe('black-white-light-gray-shadow');
  expect(await page.evaluate(() => document.body.dataset.yakolakHandoffSequencing)).toBe('balanced-logos-fade-then-star');
  expect(await page.evaluate(() => document.body.dataset.yakolakBrandLayout)).toBe('yakolak-top-star-center-mtkyf-bottom');
  expect(events.join('\n')).toContain('shape=svg-native-unmirrored camera=direct-fixed-distance-look-at logos=balanced-fade');
  expect(failures).toEqual([]);
});
