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
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const pageErrors = [];
    const ignoredNetworkErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (text.includes('Failed to load resource')) ignoredNetworkErrors.push(text);
      else pageErrors.push(`console: ${text}`);
    });

    const readDiagnostic = () => page.evaluate(() => {
      const game = globalThis.__yakolakGame;
      const scene = game?.gameGroup?.parent;
      const stage = globalThis.__yakolakV130;
      const tableMeshes = Object.values(game?.meshes || {});
      return {
        phase: document.body.dataset.phase,
        loaderPresent: Boolean(document.getElementById('yakolakLoader')),
        approvedRoom: Boolean(scene?.getObjectByName('yakolak-soft-empty-room')),
        realTable: Boolean(game?.gameGroup && game?.meshes),
        tableVisible: game?.gameGroup?.visible !== false && tableMeshes.some(mesh => mesh?.visible !== false),
        starVisible: scene?.getObjectByName('yakolak-v130-loading-star-on-approved-wall')?.visible === true,
        sampleTextPresent: Boolean(scene?.getObjectByName('yakolak-v130-sample-text-existing-on-second-wall')),
        sampleTextVisible: scene?.getObjectByName('yakolak-v130-sample-text-existing-on-second-wall')?.visible !== false,
        fakeCssRoom: Boolean(document.querySelector('.world,.tableTop,.wallBack')),
        target: game?.controls?.target ? { x: game.controls.target.x, y: game.controls.target.y, z: game.controls.target.z } : null,
        camera: game?.camera?.position ? { x: game.camera.position.x, y: game.camera.position.y, z: game.camera.position.z } : null,
        stage: stage ? {
          roomSource: stage.roomSource,
          tableSource: stage.tableSource,
          textBeforeTurn: stage.sampleTextPresentBeforeCameraTurn,
          starAfterView: stage.starLeavesViewBeforeHide
        } : null
      };
    });

    await page.goto(`http://127.0.0.1:4173/?clear=${Date.now()}-${current.name}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: new URL(`${current.name}-00-loading.png`, outputDir).pathname });

    await page.waitForFunction(() => document.body.dataset.phase === 'room-reveal', null, { timeout: 45_000 });
    await page.waitForTimeout(2600);
    const revealState = await readDiagnostic();
    console.log(`${current.name} reveal state:`, JSON.stringify(revealState));
    await page.screenshot({ path: new URL(`${current.name}-01-room-and-table.png`, outputDir).pathname });
    assert.equal(revealState.loaderPresent, false, `${current.name}: loader overlay should hand off to the wall star`);
    assert.equal(revealState.approvedRoom, true, `${current.name}: approved room missing`);
    assert.equal(revealState.realTable, true, `${current.name}: established table missing`);
    assert.equal(revealState.tableVisible, true, `${current.name}: established table is hidden`);
    assert.equal(revealState.starVisible, true, `${current.name}: star disappeared before leaving view`);
    assert.equal(revealState.sampleTextPresent, true, `${current.name}: sample text was not already on the second wall`);
    assert.equal(revealState.sampleTextVisible, true, `${current.name}: sample text starts hidden`);
    assert.equal(revealState.fakeCssRoom, false, `${current.name}: replacement CSS room/table still exists`);

    try {
      await page.waitForFunction(() => document.body.dataset.phase === 'sample-wall', null, { timeout: 20_000 });
    } catch (error) {
      const stuckState = await readDiagnostic();
      console.error(`${current.name} phase wait failed:`, JSON.stringify(stuckState), '\nBrowser errors:', pageErrors.join('\n'));
      await page.screenshot({ path: new URL(`${current.name}-99-stuck.png`, outputDir).pathname });
      throw error;
    }

    const finalState = await readDiagnostic();
    console.log(`${current.name} final state:`, JSON.stringify(finalState));
    if (ignoredNetworkErrors.length) console.log(`${current.name} ignored local API errors:`, ignoredNetworkErrors.length);
    await page.screenshot({ path: new URL(`${current.name}-02-sample-wall.png`, outputDir).pathname });
    assert.equal(finalState.phase, 'sample-wall', `${current.name}: did not finish at second wall`);
    assert.equal(finalState.starVisible, false, `${current.name}: first-wall star was not retired after leaving view`);
    assert.equal(finalState.sampleTextVisible, true, `${current.name}: sample text vanished`);
    assert.ok(finalState.target?.x > 2200, `${current.name}: camera is not facing the second wall`);
    assert.equal(finalState.stage?.roomSource, 'approved-v125-room', `${current.name}: wrong room source`);
    assert.equal(finalState.stage?.tableSource, 'established-neutral-table', `${current.name}: wrong table source`);
    assert.equal(finalState.stage?.textBeforeTurn, true, `${current.name}: text continuity contract missing`);
    assert.equal(finalState.stage?.starAfterView, true, `${current.name}: star continuity contract missing`);

    assert.deepEqual(pageErrors, [], `${current.name}: browser errors\n${pageErrors.join('\n')}`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('v130 approved-room continuity visual verification passed on desktop and mobile.');
