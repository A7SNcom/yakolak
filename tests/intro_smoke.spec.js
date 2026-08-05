const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 390, height: 844 },
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

async function expectCanvasToFillViewport(page, width, height) {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - width)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.height - height)).toBeLessThanOrEqual(2);
}

test('Godot intro preserves the level table and exact v129 loading-star motion', async ({ page }) => {
  test.setTimeout(300000);
  const failures = [];
  const introLogs = [];

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (text.includes('YAKOLAK_')) introLogs.push(text);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });

  const loaderContract = await page.evaluate(() => {
    const loader = document.getElementById('yakolakLoader');
    const bounce = loader?.querySelector('.starBounce');
    const star = loader?.querySelector('.loadingStar');
    const shadow = loader?.querySelector('.loadingShadow');
    const styles = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent || '')
      .join('\n');
    return {
      source: loader?.dataset.loaderSource || '',
      loaderVisible: Boolean(loader && getComputedStyle(loader).visibility !== 'hidden'),
      bounceName: bounce ? getComputedStyle(bounce).animationName : '',
      bounceDuration: bounce ? getComputedStyle(bounce).animationDuration : '',
      turnName: star ? getComputedStyle(star).animationName : '',
      turnDuration: star ? getComputedStyle(star).animationDuration : '',
      shadowName: shadow ? getComputedStyle(shadow).animationName : '',
      shadowDuration: shadow ? getComputedStyle(shadow).animationDuration : '',
      hasProgress: Boolean(loader?.querySelector('progress')),
      hasExactCompression: styles.includes('translateY(36px) scale(1.17,.72)'),
      hasExactTurn: styles.includes('100%{transform:rotate(24deg)}'),
      hasExactShadow: styles.includes('transform:scale(1.28,1)'),
      hasInventedHorizontalMotion: styles.includes('translateX(') || styles.includes('rotate(-420deg)')
    };
  });

  expect(loaderContract).toEqual({
    source: 'v129-loading-star-motion',
    loaderVisible: true,
    bounceName: 'bounce',
    bounceDuration: '0.82s',
    turnName: 'turn',
    turnDuration: '0.82s',
    shadowName: 'shadow',
    shadowDuration: '0.82s',
    hasProgress: false,
    hasExactCompression: true,
    hasExactTurn: true,
    hasExactShadow: true,
    hasInventedHorizontalMotion: false
  });

  await page.waitForFunction(
    () => ['playing', 'complete'].includes(document.body.dataset.yakolakIntro),
    null,
    { timeout: 60000 }
  );
  await expectCanvasToFillViewport(page, 390, 844);
  await page.waitForFunction(
    () => document.body.dataset.yakolakCorrections === 'corrected-level' &&
          document.body.dataset.yakolakTable === 'approved-star-svg' &&
          document.body.dataset.yakolakTableLevel === 'true' &&
          document.body.dataset.yakolakCamera === 'level-centered' &&
          document.body.dataset.yakolakLoader === 'v129-loading-star-motion',
    null,
    { timeout: 10000 }
  );
  await expect(page.locator('#yakolakLoader')).toHaveCount(0, { timeout: 5000 });

  if (await page.evaluate(() => document.body.dataset.yakolakIntro === 'complete')) {
    await page.keyboard.press('R');
    await page.waitForFunction(
      () => document.body.dataset.yakolakIntro === 'playing',
      null,
      { timeout: 5000 }
    );
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'web/intro-mobile-motion.png', fullPage: false, timeout: 120000 });

  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakGeometry === 'ready',
    null,
    { timeout: 20000 }
  );
  await page.screenshot({ path: 'web/intro-mobile-final.png', fullPage: false, timeout: 120000 });

  expect(await page.evaluate(() => document.body.dataset.yakolakBases)).toBe('4');
  expect(await page.evaluate(() => document.body.dataset.yakolakPieces)).toBe('36');
  expect(await page.evaluate(() => document.body.dataset.yakolakBaseColor)).toBe('161616');
  expect(await page.evaluate(() => document.body.dataset.yakolakDuration)).toBe('5730');
  expect(await page.evaluate(() => document.body.dataset.yakolakTable)).toBe('approved-star-svg');
  expect(await page.evaluate(() => document.body.dataset.yakolakTableLevel)).toBe('true');
  expect(await page.evaluate(() => document.body.dataset.yakolakCamera)).toBe('level-centered');
  expect(await page.evaluate(() => document.body.dataset.yakolakGeometry)).toBe('ready');
  expect(await page.evaluate(() => document.body.dataset.yakolakLoader)).toBe('v129-loading-star-motion');

  const joined = introLogs.join('\n');
  expect(joined).toContain('YAKOLAK_INTRO_PHASE lid-shaking');
  expect(joined).toContain('YAKOLAK_INTRO_PHASE lid-rising');
  expect(joined).toContain('YAKOLAK_INTRO_PHASE bases-deploying');
  expect(joined).toContain('YAKOLAK_INTRO_PHASE stones-moving');
  expect(joined).toContain('YAKOLAK_STAR_TABLE_APPLIED level=true centered=true');
  expect(joined).toContain('camera=level-centered');
  expect(joined).toContain('YAKOLAK_INTRO_COMPLETE');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await expectCanvasToFillViewport(page, 1440, 900);
  expect(await page.evaluate(() => document.body.dataset.yakolakCamera)).toBe('level-centered');
  await page.keyboard.press('R');
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'playing',
    null,
    { timeout: 5000 }
  );
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'web/intro-desktop-motion.png', fullPage: false, timeout: 120000 });

  expect(failures).toEqual([]);
});
