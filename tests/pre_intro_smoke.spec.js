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

test('balanced logos, gradual material bridge, slow camera, soft box, and playable intro', async ({ page }) => {
  test.setTimeout(210000);
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
  expect(await loader.getAttribute('data-loader-source')).toBe('v130-loading-star-motion');
  await expect(page.locator('.loaderLogoYakolak')).toHaveAttribute('src', 'yakolak-logo.svg');
  await expect(page.locator('.loaderLogoMtkyf svg')).toHaveCount(1);

  const first = await page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom };
    };
    const mtkyf = document.querySelector('.loaderLogoMtkyf');
    return {
      history: window.__yakolakBrandHistory,
      background: getComputedStyle(document.querySelector('.loaderBackdrop')).backgroundColor,
      starColor: getComputedStyle(document.querySelector('.loadingStar path')).fill,
      shadow: getComputedStyle(document.querySelector('.loadingShadow')).backgroundColor,
      mtkyfBack: getComputedStyle(mtkyf.querySelector('path:not(.cls-1)')).fill,
      mtkyfFront: getComputedStyle(mtkyf.querySelector('.cls-1')).fill,
      mtkyfPalette: document.body.dataset.yakolakMtkyfPalette,
      visualBridge: document.body.dataset.yakolakVisualBridge,
      timingPolicy: document.body.dataset.yakolakTimingPolicy,
      loaderMinimumMs: document.body.dataset.yakolakLoaderMinimumMs,
      motionHistory: window.__yakolakStarMotionHistory,
      contour: document.body.dataset.yakolakContourSource,
      yakolak: rect('.loaderLogoYakolak'),
      star: rect('.loadingStar'),
      mtkyf: rect('.loaderLogoMtkyf')
    };
  });
  expect(first.history[0]).toBe('hidden');
  expect(first.background).toBe('rgb(0, 0, 0)');
  expect(first.starColor).toBe('rgb(255, 255, 255)');
  expect(first.shadow).toBe('rgb(215, 217, 222)');
  expect(first.mtkyfBack).toBe('rgb(0, 0, 0)');
  expect(first.mtkyfFront).toBe('rgb(255, 255, 255)');
  expect(first.mtkyfPalette).toBe('original-black-white');
  expect(first.visualBridge).toBe('white-to-material-crossfade');
  expect(first.timingPolicy).toBe('minimum-gated-v1');
  expect(first.loaderMinimumMs).toBe('2600');
  expect(first.motionHistory[0]).toBe('resting');
  expect(first.contour).toBe('table-svg-exact-path');
  expect(overlap(first.yakolak, first.star)).toBe(0);
  expect(overlap(first.star, first.mtkyf)).toBe(0);
  expect(first.yakolak.bottom).toBeLessThan(first.star.top - 40);
  expect(first.star.bottom).toBeLessThan(first.mtkyf.top - 40);
  for (const r of [first.yakolak, first.star, first.mtkyf]) {
    expect(Math.abs(centerX(r) - 195)).toBeLessThanOrEqual(1.5);
  }
  await page.screenshot({ path: 'web/preintro-01-black-loader-logo.png' });

  await page.waitForFunction(() =>
    window.__yakolakBrandHistory?.includes('visible'),
    null, { timeout: 15000 }
  );
  await page.screenshot({ path: 'web/preintro-02-logo-to-wall-star-hold.png' });

  await page.waitForFunction(() =>
    document.body.dataset.yakolakMatchReady === 'true' &&
    document.body.dataset.yakolakShapeOrientation === 'canonical-shared-svg' &&
    document.body.dataset.yakolakCameraMotion === 'direct-slow-safe-framed' &&
    window.__yakolakMatch?.star?.w > 200 &&
    /^#[0-9a-f]{6}$/i.test(window.__yakolakMatch?.starColor || ''),
    null, { timeout: 70000 }
  );

  await page.waitForFunction(() =>
    window.__yakolakHandoffHistory?.includes('matched') &&
    window.__yakolakBrandHistory?.includes('hidden-after-fade') &&
    document.body.dataset.yakolakTeethAlignment === 'canonical-zero-degree-shared-contour',
    null, { timeout: 14000 }
  );
  const match = await page.evaluate(() => {
    const c = document.getElementById('canvas').getBoundingClientRect();
    return {
      domError: +(document.body.dataset.yakolakMatchErrorPx || 999),
      centerError: +(document.body.dataset.yakolakMatchCenterError || 999),
      facing: +(document.body.dataset.yakolakMatchFacing || 0),
      handoff: window.__yakolakHandoffHistory,
      brands: window.__yakolakBrandHistory,
      teeth: document.body.dataset.yakolakTeethAlignment,
      starColor: window.__yakolakMatch.starColor,
      star: window.__yakolakMatch.star,
      canvas: { x:c.left, y:c.top, w:c.width, h:c.height },
      motionHistory: window.__yakolakStarMotionHistory
    };
  });
  expect(match.domError).toBeLessThanOrEqual(1.5);
  expect(match.centerError).toBeLessThanOrEqual(1.5);
  expect(match.facing).toBeGreaterThan(.98);
  expect(match.teeth).toBe('canonical-zero-degree-shared-contour');
  expect(match.starColor).toMatch(/^#[0-9a-f]{6}$/i);
  expect(match.handoff).toEqual(['waiting','locking','matching','matched']);
  expect(match.brands).toEqual(['hidden','entering','visible','leaving','hidden-after-fade']);
  expect(match.motionHistory).toEqual(['resting','warming','running','settling','rested']);
  expect(Math.abs(match.star.x + match.star.w/2 - (match.canvas.x + match.canvas.w/2))).toBeLessThanOrEqual(1.5);
  expect(Math.abs(match.star.y + match.star.h/2 - (match.canvas.y + match.canvas.h/2))).toBeLessThanOrEqual(1.5);
  await page.screenshot({ path: 'web/preintro-03-pixel-matched.png' });

  await expect.poll(
    () => events.some(x => x.includes('YAKOLAK_PREINTRO_PHASE camera-orbit')),
    { timeout: 12000 }
  ).toBe(true);
  expect(await page.evaluate(() => document.body.dataset.yakolakCameraMotion)).toBe('direct-slow-safe-framed');
  expect(await page.evaluate(() => document.body.dataset.yakolakCameraDuration)).toBe('1250');
  expect(await page.evaluate(() => document.body.dataset.yakolakShapeOrientation)).toBe('canonical-shared-svg');
  expect(await page.evaluate(() => document.body.dataset.yakolakMaterialBridge)).toBe('white-emission-to-material');
  await expect.poll(
    () => page.evaluate(() => +(document.body.dataset.yakolakCameraMaxCoverage || 0)),
    { timeout: 8000 }
  ).toBeGreaterThan(0);
  const maxCoverage = await page.evaluate(() => +(document.body.dataset.yakolakCameraMaxCoverage || 99));
  expect(maxCoverage).toBeLessThanOrEqual(.905);
  await page.screenshot({ path: 'web/preintro-04-camera-orbit.png' });

  await expect.poll(
    () => events.some(x => x.includes('YAKOLAK_PREINTRO_PHASE box-closed-descending')),
    { timeout: 15000 }
  ).toBe(true);
  expect(await page.evaluate(() => document.body.dataset.yakolakBoxReveal)).toBe('closed-rigid-body-drop');
  expect(await page.evaluate(() => document.body.dataset.yakolakBoxRevealDuration)).toBe('1200');
  expect(await page.evaluate(() => document.body.dataset.yakolakBoxLandedHold)).toBe('420');
  expect(await page.evaluate(() => document.body.dataset.yakolakBoxLidPolicy)).toBe('present-during-drop-exit-only');
  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxVisibleParts)).toBe('board,base-right,base-left,base-front,base-back,lid');
  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxShellCount)).toBe('6');
  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxAssembly)).toBe('prebuilt-before-first-drop-frame');
  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxPoseSource)).toBe('intro-timeline-zero');
  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxCorrections)).toBe('suspended-during-drop');
  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxRigidity)).toBe('locked-local-transforms');
  expect(await page.evaluate(() => document.body.dataset.yakolakInternalContentPolicy)).toBe('stones-hidden-until-lid-lift');
  expect(events.join('\n')).toContain('YAKOLAK_CLOSED_BOX_POSE_LOCK source=intro-timeline-zero corrections=suspended shell_parts=6 stones_hidden=36 rigid=true');
  await page.screenshot({ path: 'web/preintro-05-closed-six-part-box-drop.png' });
  expect(await page.evaluate(() => document.body.dataset.yakolakOrbitIsolation)).toBe('game-hidden-shadows-off-pedestal-delayed');
  expect(await page.evaluate(() => document.body.dataset.yakolakSceneFlow)).toBe('star>material>camera>closed-box-drop>lid-open');

  await page.waitForFunction(() =>
    document.body.dataset.yakolakPreIntro === 'complete' &&
    document.body.dataset.yakolakIntro === 'complete' &&
    document.body.dataset.yakolakGameplay === 'ready',
    null, { timeout: 30000 }
  );
  await page.screenshot({ path: 'web/preintro-05-unboxing-complete.png' });

  const governedPhases = await page.evaluate(() => window.__yakolakPreIntroPhases || []);
  const phaseAt = state => governedPhases.find(entry => entry.state === state)?.at;
  const orderedStates = [
    'matched','star-to-3d','table-settling','camera-orbit',
    'camera-settled','box-closed-descending','box-closed-landed','complete'
  ];
  for (let index = 1; index < orderedStates.length; index += 1) {
    expect(phaseAt(orderedStates[index])).toBeGreaterThan(phaseAt(orderedStates[index - 1]));
  }
  expect(phaseAt('star-to-3d') - phaseAt('matched')).toBeGreaterThanOrEqual(210);
  expect(phaseAt('table-settling') - phaseAt('star-to-3d')).toBeGreaterThanOrEqual(920);
  expect(phaseAt('camera-orbit') - phaseAt('table-settling')).toBeGreaterThanOrEqual(250);
  expect(phaseAt('camera-settled') - phaseAt('camera-orbit')).toBeGreaterThanOrEqual(1180);
  expect(phaseAt('box-closed-descending') - phaseAt('camera-settled')).toBeGreaterThanOrEqual(170);
  expect(phaseAt('box-closed-landed') - phaseAt('box-closed-descending')).toBeGreaterThanOrEqual(1130);
  expect(phaseAt('complete') - phaseAt('box-closed-landed')).toBeGreaterThanOrEqual(360);

  expect(await page.evaluate(() => document.body.dataset.yakolakTable)).toBe('approved-star-svg');
  expect(await page.evaluate(() => document.body.dataset.yakolakTableLevel)).toBe('true');
  expect(await page.evaluate(() => document.body.dataset.yakolakLoaderPalette)).toBe('black-white-lighter-gray-shadow');
  expect(await page.evaluate(() => document.body.dataset.yakolakHandoffSequencing)).toBe('logos-fade-then-canonical-star');
  expect(await page.evaluate(() => document.body.dataset.yakolakBrandLayout)).toBe('yakolak-upper-center-star-center-mtkyf-lower-center');
  expect(events.join('\n')).toContain('shape=canonical-shared-svg camera=direct-slow-safe-framed table=coordinated logos=balanced-fade');
  expect(events.join('\n')).toContain('box=timeline-zero-locked lid=exit-only orbit=isolated');
  expect(events.join('\n')).toContain('YAKOLAK_CLOSED_BOX_POSE_LOCK_RELEASED corrections=restored-after-intro-zero');
  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxCorrections)).toBe('restored-for-unboxing');
  expect(failures).toEqual([]);
});