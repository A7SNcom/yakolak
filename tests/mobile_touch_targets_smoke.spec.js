import { test, expect } from '@playwright/test';

const chromiumArgs = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage'
];

test('mobile touch targets reduce finger misses without visual inflation', async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
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
    console.log(`[touch:${message.type()}] ${text}`);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  try {
    await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.dataset.yakolakIntro === 'complete' &&
            document.body.dataset.yakolakSetup === 'visible' &&
            typeof window.yakolakTestStartPassPlay === 'function',
      null,
      { timeout: 60000 }
    );

    await page.evaluate(() => window.yakolakTestStartPassPlay());
    await page.waitForFunction(
      () => document.body.dataset.yakolakGameplay === 'ready' &&
            document.body.dataset.yakolakCurrentPlayer === 'right' &&
            document.body.dataset.yakolakTouchPickModel === 'exact-mesh-then-visible-slop',
      null,
      { timeout: 20000 }
    );

    await page.waitForFunction(
      () => ['passed', 'failed'].includes(document.body.dataset.yakolakTouchAudit || ''),
      null,
      { timeout: 30000 }
    );

    const metrics = await page.evaluate(() => {
      const d = document.body.dataset;
      const probe = document.getElementById('__yakolak_touch_safe_probe');
      const probeStyle = probe ? getComputedStyle(probe) : null;
      return {
        status: d.yakolakTouchAudit,
        viewport: d.yakolakTouchAuditViewport,
        fingers: d.yakolakTouchAuditFingerDiameters,
        centers: Number(d.yakolakTouchAuditCenters || 0),
        samples: Number(d.yakolakTouchAuditSamples || 0),
        beforeFalse: Number(d.yakolakTouchAuditBeforeFalse || 0),
        afterFalse: Number(d.yakolakTouchAuditAfterFalse || 0),
        beforeWrong: Number(d.yakolakTouchAuditBeforeWrong || 0),
        afterWrong: Number(d.yakolakTouchAuditAfterWrong || 0),
        reduction: Number(d.yakolakTouchAuditReduction || 0),
        rescueRadius: Number(d.yakolakTouchRescueRadiusCss || 0),
        safeGutter: Number(d.yakolakTouchSafeGutterCss || 0),
        probeBudget: Number(d.yakolakTouchProbeBudget || 0),
        visualChange: d.yakolakTouchVisualChange,
        probeVisible: probeStyle ? (probeStyle.visibility !== 'hidden' && probeStyle.display !== 'none') : false,
        canvas: document.getElementById('canvas')?.getBoundingClientRect().toJSON() || null
      };
    });

    console.log(`YAKOLAK_TOUCH_METRICS ${JSON.stringify(metrics)}`);

    expect(metrics.viewport).toBe('390x844');
    expect(metrics.fingers).toBe('36,44,52');
    expect(metrics.centers).toBeGreaterThanOrEqual(6);
    expect(metrics.samples).toBeGreaterThan(0);
    expect(metrics.beforeFalse).toBeGreaterThan(0);
    expect(metrics.afterFalse).toBeLessThan(metrics.beforeFalse);
    expect(metrics.afterWrong).toBeLessThanOrEqual(metrics.beforeWrong);
    expect(metrics.reduction).toBeGreaterThanOrEqual(0.35);
    expect(metrics.rescueRadius).toBe(18);
    expect(metrics.safeGutter).toBe(8);
    expect(metrics.probeBudget).toBeLessThanOrEqual(24);
    expect(metrics.visualChange).toBe('none');
    expect(metrics.probeVisible).toBe(false);
    expect(metrics.canvas).not.toBeNull();
    expect(metrics.canvas.width).toBeCloseTo(390, 0);
    expect(metrics.canvas.height).toBeCloseTo(844, 0);
    expect(metrics.status).toBe('passed');
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});
