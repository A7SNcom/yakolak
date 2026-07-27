import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const outputDir = new URL('../artifacts/v130-continuity/', import.meta.url);
fs.mkdirSync(outputDir, { recursive: true });

const cases = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }
];

const browser = await chromium.launch({ headless: true });
try {
  for (const current of cases) {
    const page = await browser.newPage({ viewport: current.viewport, deviceScaleFactor: current.deviceScaleFactor });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
    page.on('console', message => {
      if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
    });

    await page.goto(`http://127.0.0.1:4173/?clear=${Date.now()}-${current.name}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: new URL(`${current.name}-00-loading.png`, outputDir).pathname });

    await page.waitForFunction(() => document.body.dataset.phase === 'room-reveal', null, { timeout: 45_000 });
    await page.waitForTimeout(900);
    const revealState = await page.evaluate(() => {
      const game = globalThis.__yakolakGame;
      const scene = game?.gameGroup?.parent;
      return {
        phase: document.body.dataset.phase,
        loaderPresent: Boolean(document.getElementById('yakolakLoader')),
        approvedRoom: Boolean(scene?.getObjectByName('yakolak-soft-empty-room')),
        realTable: Boolean(game?.gameGroup && game?.meshes),
        starVisible: scene?.getObjectByName('yakolak-v130-loading-star-on-approved-wall')?.visible === true,
        sampleTextPresent: Boolean(scene?.getObjectByName('yakolak-v130-sample-text-existing-on-second-wall')),
        sampleTextVisible: scene?.getObjectByName('yakolak-v130-sample-text-existing-on-second-wall')?.visible !== false,
        fakeCssRoom: Boolean(document.querySelector('.world,.tableTop,.wallBack'))
      };
    });
    assert.equal(revealState.loaderPresent, false, `${current.name}: loader overlay should hand off to the wall star`);
    assert.equal(revealState.approvedRoom, true, `${current.name}: approved room missing`);
    assert.equal(revealState.realTable, true, `${current.name}: established table missing`);
    assert.equal(revealState.starVisible, true, `${current.name}: star disappeared before leaving view`);
    assert.equal(revealState.sampleTextPresent, true, `${current.name}: sample text was not already on the second wall`);
    assert.equal(revealState.sampleTextVisible, true, `${current.name}: sample text starts hidden`);
    assert.equal(revealState.fakeCssRoom, false, `${current.name}: replacement CSS room/table still exists`);
    await page.screenshot({ path: new URL(`${current.name}-01-room-reveal.png`, outputDir).pathname });

    await page.waitForFunction(() => document.body.dataset.phase === 'sample-wall', null, { timeout: 20_000 });
    const finalState = await page.evaluate(() => {
      const game = globalThis.__yakolakGame;
      const scene = game?.gameGroup?.parent;
      const stage = globalThis.__yakolakV130;
      return {
        phase: document.body.dataset.phase,
        starVisible: scene?.getObjectByName('yakolak-v130-loading-star-on-approved-wall')?.visible === true,
        sampleTextVisible: scene?.getObjectByName('yakolak-v130-sample-text-existing-on-second-wall')?.visible !== false,
        targetX: game?.controls?.target?.x,
        roomSource: stage?.roomSource,
        tableSource: stage?.tableSource,
        textBeforeTurn: stage?.sampleTextPresentBeforeCameraTurn,
        starAfterView: stage?.starLeavesViewBeforeHide
      };
    });
    assert.equal(finalState.phase, 'sample-wall', `${current.name}: did not finish at second wall`);
    assert.equal(finalState.starVisible, false, `${current.name}: first-wall star was not retired after leaving view`);
    assert.equal(finalState.sampleTextVisible, true, `${current.name}: sample text vanished`);
    assert.ok(finalState.targetX > 2200, `${current.name}: camera is not facing the second wall`);
    assert.equal(finalState.roomSource, 'approved-v125-room', `${current.name}: wrong room source`);
    assert.equal(finalState.tableSource, 'established-neutral-table', `${current.name}: wrong table source`);
    assert.equal(finalState.textBeforeTurn, true, `${current.name}: text continuity contract missing`);
    assert.equal(finalState.starAfterView, true, `${current.name}: star continuity contract missing`);
    await page.screenshot({ path: new URL(`${current.name}-02-sample-wall.png`, outputDir).pathname });

    assert.deepEqual(pageErrors, [], `${current.name}: browser errors\n${pageErrors.join('\n')}`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('v130 approved-room continuity visual verification passed on desktop and mobile.');
