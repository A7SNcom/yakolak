import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const chromiumArgs = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage'
];

test.use({ launchOptions: { args: chromiumArgs } });

async function bootstrapSnapshot(page, failures) {
  return page.evaluate((seenFailures) => ({
    intro: document.body.dataset.yakolakIntro || '',
    setup: document.body.dataset.yakolakSetup || '',
    gameplay: document.body.dataset.yakolakGameplay || '',
    touchModel: document.body.dataset.yakolakTouchPickModel || '',
    hasStart: typeof window.yakolakTestStartPassPlay === 'function',
    hasSemanticAudit: typeof window.yakolakTestRunTouchSemanticAudit === 'function',
    canvas: Boolean(document.getElementById('canvas')),
    failures: seenFailures
  }), failures);
}

test('mobile stack and separated-size touch targets improve without wrong taps', async ({ browser }) => {
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
    if (message.type() === 'error' && !text.includes('favicon') && !text.includes('YAKOLAK_ICON_AUDIT_FAILED')) {
      failures.push(`console: ${text}`);
    }
  });

  try {
    await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction(
        () => document.body.dataset.yakolakIntro === 'complete' &&
              document.body.dataset.yakolakSetup === 'visible' &&
              typeof window.yakolakTestStartPassPlay === 'function' &&
              typeof window.yakolakTestRunTouchSemanticAudit === 'function',
        null,
        { timeout: 30000 }
      );
    } catch {
      throw new Error(`touch bootstrap failed: ${JSON.stringify(await bootstrapSnapshot(page, failures))}`);
    }

    await page.evaluate(() => window.yakolakTestStartPassPlay());
    await page.waitForFunction(
      () => document.body.dataset.yakolakGameplay === 'ready' &&
            document.body.dataset.yakolakCurrentPlayer === 'right' &&
            document.body.dataset.yakolakTouchPickModel === 'exact-mesh-then-visible-slop',
      null,
      { timeout: 20000 }
    );

    await page.evaluate(() => window.yakolakTestRunTouchSemanticAudit());
    await page.waitForFunction(
      () => ['passed', 'failed'].includes(document.body.dataset.yakolakTouchSemanticAudit || ''),
      null,
      { timeout: 30000 }
    );

    const metrics = await page.evaluate(() => {
      const d = document.body.dataset;
      const probe = document.getElementById('__yakolak_touch_safe_probe');
      const probeStyle = probe ? getComputedStyle(probe) : null;
      return {
        status: d.yakolakTouchSemanticAudit,
        viewport: d.yakolakTouchSemanticViewport,
        fingers: d.yakolakTouchSemanticFingers,
        samples: Number(d.yakolakTouchSemanticSamples || 0),
        stackCenters: Number(d.yakolakTouchSemanticStackCenters || 0),
        trayCenters: Number(d.yakolakTouchSemanticTrayCenters || 0),
        stackBeforeFalse: Number(d.yakolakTouchSemanticStackBeforeFalse || 0),
        stackAfterFalse: Number(d.yakolakTouchSemanticStackAfterFalse || 0),
        stackBeforeWrong: Number(d.yakolakTouchSemanticStackBeforeWrong || 0),
        stackAfterWrong: Number(d.yakolakTouchSemanticStackAfterWrong || 0),
        trayBeforeFalse: Number(d.yakolakTouchSemanticTrayBeforeFalse || 0),
        trayAfterFalse: Number(d.yakolakTouchSemanticTrayAfterFalse || 0),
        trayBeforeWrong: Number(d.yakolakTouchSemanticTrayBeforeWrong || 0),
        trayAfterWrong: Number(d.yakolakTouchSemanticTrayAfterWrong || 0),
        beforeFalse: Number(d.yakolakTouchSemanticBeforeFalse || 0),
        afterFalse: Number(d.yakolakTouchSemanticAfterFalse || 0),
        beforeWrong: Number(d.yakolakTouchSemanticBeforeWrong || 0),
        afterWrong: Number(d.yakolakTouchSemanticAfterWrong || 0),
        reduction: Number(d.yakolakTouchSemanticReduction || 0),
        maxMs: Number(d.yakolakTouchSemanticMaxMs || 0),
        rescueRadius: Number(d.yakolakTouchRescueRadiusCss || 0),
        safeGutter: Number(d.yakolakTouchSafeGutterCss || 0),
        probeBudget: Number(d.yakolakTouchProbeBudget || 0),
        visualChange: d.yakolakTouchVisualChange,
        probeVisible: probeStyle ? (probeStyle.visibility !== 'hidden' && probeStyle.display !== 'none') : false,
        canvas: document.getElementById('canvas')?.getBoundingClientRect().toJSON() || null
      };
    });

    fs.writeFileSync('/tmp/yakolak-touch-metrics.json', JSON.stringify(metrics));
    console.log(`YAKOLAK_TOUCH_METRICS ${JSON.stringify(metrics)}`);

    expect(metrics.viewport).toBe('390x844');
    expect(metrics.fingers).toBe('36,44,52');
    expect(metrics.stackCenters).toBeGreaterThanOrEqual(3);
    expect(metrics.trayCenters).toBeGreaterThanOrEqual(3);
    expect(metrics.samples).toBeGreaterThan(0);
    expect(metrics.beforeFalse).toBeGreaterThan(0);
    expect(metrics.afterFalse).toBeLessThan(metrics.beforeFalse);
    expect(metrics.afterWrong).toBeLessThanOrEqual(metrics.beforeWrong);
    expect(metrics.stackAfterWrong).toBeLessThanOrEqual(metrics.stackBeforeWrong);
    expect(metrics.trayAfterWrong).toBeLessThanOrEqual(metrics.trayBeforeWrong);
    expect(metrics.reduction).toBeGreaterThanOrEqual(0.15);
    expect(metrics.rescueRadius).toBe(18);
    expect(metrics.safeGutter).toBe(8);
    expect(metrics.probeBudget).toBeLessThanOrEqual(16);
    expect(metrics.visualChange).toBe('none');
    expect(metrics.probeVisible).toBe(false);
    expect(metrics.canvas).not.toBeNull();
    expect(metrics.canvas.width).toBeCloseTo(390, 0);
    expect(metrics.canvas.height).toBeCloseTo(844, 0);
    expect(metrics.maxMs).toBeLessThan(33.4);
    expect(metrics.status).toBe('passed');
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});
