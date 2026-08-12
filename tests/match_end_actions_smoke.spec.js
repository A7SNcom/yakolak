import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 393, height: 852 },
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

async function startLocalMatch(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestForceMatchComplete === 'function' &&
          typeof window.yakolakTestRematch === 'function' &&
          typeof window.yakolakTestPostMatchReturn === 'function',
    null,
    { timeout: 60000 }
  );
  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'right',
    null,
    { timeout: 15000 }
  );
}

async function finishMatch(page) {
  await page.evaluate(() => window.yakolakTestForceMatchComplete());
  await page.waitForFunction(
    () => document.body.dataset.yakolakPostMatchPrimary === 'rematch' &&
          document.body.dataset.yakolakPostMatchSecondary === 'setup' &&
          (document.body.dataset.yakolakPostMatchResult || '').length > 0,
    null,
    { timeout: 10000 }
  );
}

test('MATCH-END-26 rematch is one clean same-runtime transition under duplicate taps', async ({ page }) => {
  test.setTimeout(120000);
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await startLocalMatch(page);
  const runtimeToken = await page.evaluate(() => {
    window.__yakolakMatchEndRuntimeToken = crypto.randomUUID();
    return window.__yakolakMatchEndRuntimeToken;
  });
  await finishMatch(page);

  const resultText = await page.evaluate(() => document.body.dataset.yakolakPostMatchResult || '');
  expect(resultText).toContain('بطل المباراة');
  expect(resultText).toContain('إعادة المباراة');
  expect(resultText).not.toContain('المس');

  // Two taps in the same browser task are one user intent. The first exact
  // production action wins; the second must observe the already-committed state.
  await page.evaluate(() => {
    window.yakolakTestRematch();
    window.yakolakTestRematch();
  });
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakPostMatchPrimary === '' &&
          document.body.dataset.yakolakPostMatchPending === '' &&
          Number(document.body.dataset.yakolakMoves || -1) === 0 &&
          Number(document.body.dataset.yakolakResiduePlayed || -1) === 0 &&
          Number(document.body.dataset.yakolakResidueOccupied || -1) === 0 &&
          Number(document.body.dataset.yakolakResidueStray || -1) === 0,
    null,
    { timeout: 15000 }
  );

  expect(await page.evaluate(() => window.__yakolakMatchEndRuntimeToken)).toBe(runtimeToken);
  expect(failures).toEqual([]);
});

test('MATCH-END-26 local return-to-setup commits once and leaves no match residue', async ({ page }) => {
  test.setTimeout(120000);
  await startLocalMatch(page);
  const runtimeToken = await page.evaluate(() => {
    window.__yakolakMatchEndRuntimeToken = crypto.randomUUID();
    return window.__yakolakMatchEndRuntimeToken;
  });
  await finishMatch(page);

  await page.evaluate(() => {
    window.yakolakTestPostMatchReturn();
    window.yakolakTestPostMatchReturn();
  });
  await page.waitForFunction(
    () => document.body.dataset.yakolakSetup === 'visible' &&
          document.body.dataset.yakolakPostMatchPrimary === '' &&
          document.body.dataset.yakolakPostMatchSecondary === '' &&
          document.body.dataset.yakolakPostMatchPending === '' &&
          Number(document.body.dataset.yakolakResiduePlayed || -1) === 0 &&
          Number(document.body.dataset.yakolakResidueOccupied || -1) === 0 &&
          Number(document.body.dataset.yakolakResidueStray || -1) === 0,
    null,
    { timeout: 10000 }
  );

  expect(await page.evaluate(() => window.__yakolakMatchEndRuntimeToken)).toBe(runtimeToken);
});
