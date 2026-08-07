import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 393, height: 852 },
  hasTouch: true,
  isMobile: true,
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

test('intro naturally reaches setup and a real match', async ({ page }) => {
  test.setTimeout(420000);
  const fatal = [];
  page.on('pageerror', error => fatal.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (message.type() === 'error' && !text.includes('favicon')) fatal.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(
    () => typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestShowSetup === 'function',
    null,
    { timeout: 30000 }
  );

  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible',
    null,
    { timeout: 330000 }
  );

  await page.evaluate(() => window.yakolakTestStartPassPlay());

  await page.waitForFunction(
    () => document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakPlayers === '2',
    null,
    { timeout: 30000 }
  );

  expect(fatal).toEqual([]);
  console.log('YAKOLAK_NATURAL_FLOW_OK intro>setup>match');
});
