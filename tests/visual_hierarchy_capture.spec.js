import { test } from '@playwright/test';

const OUTPUT = 'visual-hierarchy';

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

async function waitForSetup(page) {
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestSetupFlowAction === 'function' &&
          typeof window.yakolakTestStartPassPlay === 'function',
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(900);
}

async function capture(page, name) {
  await page.screenshot({ path: `${OUTPUT}/${name}.png`, fullPage: true });
}

test('capture representative 2D hierarchy states without touching intro', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await waitForSetup(page);

  await capture(page, '01-room-entry');

  await page.evaluate(() => window.yakolakTestSetupFlowAction('new'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'count', null, { timeout: 15000 });
  await page.waitForTimeout(450);
  await capture(page, '02-player-count');

  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakQuickMenu === 'ready',
    null,
    { timeout: 25000 }
  );
  await page.waitForTimeout(650);
  await capture(page, '03-gameplay-hud');
});
