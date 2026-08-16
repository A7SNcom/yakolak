import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE_URL = (process.env.YAKOLAK_UX_SELECT_44_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const LABEL = process.env.YAKOLAK_UX_SELECT_44_LABEL || 'source';
const ARTIFACT_DIR = `artifacts/ux-select-44-${LABEL}`;

mkdirSync(ARTIFACT_DIR, { recursive: true });

// Exact nested-ring target solving is intentionally rendered/geometry-backed.
// Keep the strict assertions and enough room for software WebGL on CI.
test.describe.configure({ timeout: 600000 });

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
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

async function startMatrix(page) {
  await page.goto(`${BASE_URL}/?yakolakTestFast=1&uxSelect44=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestSelect44StartMatrix === 'function' &&
          typeof window.yakolakTestSelect44SetPlayer === 'function' &&
          typeof window.yakolakTestSelect44Lifecycle === 'function' &&
          typeof window.yakolakTestSelect44RefreshPickTarget === 'function' &&
          typeof window.yakolakTestRefreshAuthorityPickTarget === 'function',
    null,
    { timeout: 60000 }
  );
  await page.evaluate(() => window.yakolakTestSelect44StartMatrix());
  await waitForPlayer(page, 0, 'right');
  await expectSelectionCount(page, 0);
}

async function waitForPlayer(page, index, direction) {
  if (index !== 0) {
    await page.evaluate(playerIndex => window.yakolakTestSelect44SetPlayer(playerIndex), index);
  }
  await page.waitForFunction(
    expected => document.body.dataset.yakolakGameplay === 'ready' &&
                document.body.dataset.yakolakGameplayReady === 'true' &&
                document.body.dataset.yakolakCurrentPlayer === expected &&
                document.body.dataset.yakolakCameraStage === 'ready',
    direction,
    { timeout: 15000 }
  );
}

async function freshPickTarget(page, direction, side, size) {
  // Use the authoritative gameplay-ready probe rather than a fixed delay. After
  // commit/turn changes the visible state can update a frame before input is valid.
  await page.waitForFunction(
    expected => document.body.dataset.yakolakGameplayReady === 'true' &&
                document.body.dataset.yakolakCurrentPlayer === expected,
    direction,
    { timeout: 10000 }
  );
  const before = await page.evaluate(() => Number(document.body.dataset.yakolakSelect44TargetRevision || 0));
  await page.evaluate(({ side, size }) => window.yakolakTestSelect44RefreshPickTarget(side, size), { side, size });
  await page.waitForFunction(
    ({ previous, direction, side, size }) => Number(document.body.dataset.yakolakSelect44TargetRevision || 0) > previous &&
                                            document.body.dataset.yakolakSelect44TargetDirection === direction &&
                                            Number(document.body.dataset.yakolakSelect44TargetSide) === side &&
                                            document.body.dataset.yakolakSelect44TargetSize === size,
    { previous: before, direction, side, size },
    { timeout: 10000 }
  );
  const target = await page.evaluate(() => ({
    x: Number(document.body.dataset.yakolakSelect44TargetX || 0),
    y: Number(document.body.dataset.yakolakSelect44TargetY || 0)
  }));
  expect(target.x).toBeGreaterThan(0);
  expect(target.y).toBeGreaterThan(0);
  expect(target.x).toBeLessThan(390);
  expect(target.y).toBeLessThan(844);
  return target;
}

async function freshBoardTarget(page, direction) {
  await page.evaluate(() => window.yakolakTestRefreshAuthorityPickTarget());
  await page.waitForFunction(
    expected => document.body.dataset.yakolakTestAuthorityTargetDirection === expected &&
                Number(document.body.dataset.yakolakTestAuthorityCellX || 0) > 0 &&
                Number(document.body.dataset.yakolakTestAuthorityCellY || 0) > 0,
    direction,
    { timeout: 5000 }
  );
  const target = await page.evaluate(() => ({
    x: Number(document.body.dataset.yakolakTestAuthorityCellX || 0),
    y: Number(document.body.dataset.yakolakTestAuthorityCellY || 0)
  }));
  expect(target.x).toBeGreaterThan(0);
  expect(target.y).toBeGreaterThan(0);
  expect(target.x).toBeLessThan(390);
  expect(target.y).toBeLessThan(844);
  return target;
}

async function tapPiece(page, direction, side, size) {
  const target = await freshPickTarget(page, direction, side, size);
  await page.touchscreen.tap(target.x, target.y);
  const expectedName = `Stone_${direction}_${side}_${size}`;
  await page.waitForFunction(
    ({ expectedName, size }) => document.body.dataset.yakolakSelected === expectedName &&
                              document.body.dataset.yakolakSelectedSize === size &&
                              document.body.dataset.yakolakTray === 'open' &&
                              document.body.dataset.yakolakSelectionEmphasisCount === '1' &&
                              document.body.dataset.yakolakSelectionEmphasisOwner === expectedName,
    { expectedName, size },
    { timeout: 5000 }
  );
  return expectedName;
}

async function expectSelectionCount(page, count, owner = '') {
  await page.waitForFunction(
    ({ count, owner }) => document.body.dataset.yakolakSelectionEmphasisCount === String(count) &&
                          document.body.dataset.yakolakSelectionEmphasisOwner === owner,
    { count, owner },
    { timeout: 5000 }
  );
}

async function assertCueContract(page, owner) {
  const state = await page.evaluate(() => ({
    count: Number(document.body.dataset.yakolakSelectionEmphasisCount || -1),
    owner: document.body.dataset.yakolakSelectionEmphasisOwner || '',
    style: document.body.dataset.yakolakSelectionStyle || '',
    outline: document.body.dataset.yakolakSelectionOutline || '',
    grow: Number(document.body.dataset.yakolakSelectionOutlineGrow || 0),
    emission: Number(document.body.dataset.yakolakSelectionEmissionEnergy || 0)
  }));
  expect(state.count).toBe(1);
  expect(state.owner).toBe(owner);
  expect(state.style).toBe('contrast-outline-soft-emission');
  expect(['dark', 'light']).toContain(state.outline);
  expect(state.grow).toBeCloseTo(1.02, 2);
  expect(state.emission).toBeCloseTo(0.16, 2);
}

async function clearSelection(page) {
  await page.evaluate(() => window.yakolakTestSelect44Lifecycle('cancel'));
  await page.waitForFunction(
    () => document.body.dataset.yakolakTray === 'closed' &&
          document.body.dataset.yakolakSelected === '' &&
          document.body.dataset.yakolakSelectionEmphasisCount === '0' &&
          document.body.dataset.yakolakSelectionEmphasisOwner === '',
    null,
    { timeout: 5000 }
  );
}

async function screenshotSelection(page, color, size) {
  await page.screenshot({
    path: `${ARTIFACT_DIR}/${color}-${size}-selected.png`,
    fullPage: false
  });
}

test('UX-SELECT-44 renders exactly one unmistakable selected piece for every player color and size', async ({ page }) => {
  await startMatrix(page);

  const players = [
    { index: 0, direction: 'right', color: 'marble' },
    { index: 1, direction: 'back', color: 'blue' },
    { index: 2, direction: 'left', color: 'gold' },
    { index: 3, direction: 'front', color: 'green' }
  ];

  for (const player of players) {
    await waitForPlayer(page, player.index, player.direction);

    // Opening a nested stack intentionally selects its large ring first.
    let owner = await tapPiece(page, player.direction, 0, 'large');
    await assertCueContract(page, owner);
    await screenshotSelection(page, player.color, 'large');

    // While the tray is open, real taps switch to the exact nested ring.
    owner = await tapPiece(page, player.direction, 0, 'small');
    await assertCueContract(page, owner);
    await screenshotSelection(page, player.color, 'small');

    owner = await tapPiece(page, player.direction, 0, 'medium');
    await assertCueContract(page, owner);
    await screenshotSelection(page, player.color, 'medium');

    await clearSelection(page);
    await expectSelectionCount(page, 0);
  }
});

test('UX-SELECT-44 clears the single selected emphasis on commit, turn change, round reset, and reconnect hydration', async ({ page }) => {
  await startMatrix(page);

  // Commit: real piece tap -> real legal board tap -> next turn, with no stale emphasis.
  await tapPiece(page, 'right', 0, 'large');
  const cell = await freshBoardTarget(page, 'right');
  await page.touchscreen.tap(cell.x, cell.y);
  await page.waitForFunction(
    () => document.body.dataset.yakolakCurrentPlayer === 'back' &&
          document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakGameplayReady === 'true' &&
          document.body.dataset.yakolakSelected === '' &&
          document.body.dataset.yakolakSelectionEmphasisCount === '0',
    null,
    { timeout: 10000 }
  );

  // Authoritative turn-change cleanup uses the real stale-selection cancellation path.
  await tapPiece(page, 'back', 0, 'large');
  await page.evaluate(() => window.yakolakTestSelect44Lifecycle('turn-change'));
  await expectSelectionCount(page, 0);
  await expect(page.locator('body')).toHaveAttribute('data-yakolak-selected', '');

  // Round reset restores every home material before the reset animation proceeds.
  await tapPiece(page, 'back', 0, 'large');
  await page.evaluate(() => window.yakolakTestSelect44Lifecycle('round-reset'));
  await expectSelectionCount(page, 0);

  // Hydration applies the authoritative board only after clearing tray/selection materials and probes.
  await page.waitForTimeout(900);
  await page.evaluate(() => window.yakolakTestSelect44SetPlayer(0));
  await waitForPlayer(page, 0, 'right');
  await tapPiece(page, 'right', 0, 'large');
  await page.evaluate(() => window.yakolakTestSelect44Lifecycle('reconnect-hydration'));
  await expectSelectionCount(page, 0);
  await expect(page.locator('body')).toHaveAttribute('data-yakolak-selected', '');
  await expect(page.locator('body')).toHaveAttribute('data-yakolak-selected-size', '');
});
