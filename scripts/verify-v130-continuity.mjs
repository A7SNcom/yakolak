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
    const fatalErrors = [];
    page.on('pageerror', error => fatalErrors.push(String(error?.stack || error)));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (/v130 (bootstrap|branding) failed|brand texture failed/i.test(text)) fatalErrors.push(text);
    });

    const readState = () => page.evaluate(() => {
      const game = globalThis.__yakolakGame;
      const scene = game?.gameGroup?.parent;
      const branding = globalThis.__yakolakV130Branding;
      const stage = globalThis.__yakolakV130;
      const sample = scene?.getObjectByName('yakolak-v130-sample-text-existing-on-second-wall');
      const gameLogo = scene?.getObjectByName('yakolak-v130-game-logo');
      const companyLogo = scene?.getObjectByName('yakolak-v130-company-logo');
      const tableMeshes = Object.values(game?.meshes || {});
      const loaded = mesh => {
        const image=mesh?.material?.map?.image;
        return Boolean(image && (image.naturalWidth>0 || image.width>0));
      };
      const direction=game?.camera&&game?.THREE?game.camera.getWorldDirection(new game.THREE.Vector3()):null;
      return {
        phase: document.body.dataset.phase,
        loaderPresent: Boolean(document.getElementById('yakolakLoader')),
        approvedRoom: Boolean(scene?.getObjectByName('yakolak-soft-empty-room')),
        fakeCssRoom: Boolean(document.querySelector('.world,.tableTop,.wallBack')),
        tableVisible: game?.gameGroup?.visible !== false && tableMeshes.some(mesh => mesh?.visible !== false),
        starPresent: Boolean(scene?.getObjectByName('yakolak-v130-loading-star-on-approved-wall')),
        starVisible: scene?.getObjectByName('yakolak-v130-loading-star-on-approved-wall')?.visible === true,
        brandingPresent: Boolean(scene?.getObjectByName('yakolak-v130-brand-wall')),
        gameLogoVisible: gameLogo?.visible !== false,
        companyLogoVisible: companyLogo?.visible !== false,
        gameLogoLoaded: loaded(gameLogo),
        companyLogoLoaded: loaded(companyLogo),
        sampleHidden: sample?.visible === false,
        facingX: direction?.x,
        roomSource: stage?.roomSource,
        tableSource: stage?.tableSource,
        responsiveLayout: branding?.responsiveLayout,
        brandAssets: branding ? [branding.gameLogoAsset, branding.companyLogoAsset] : []
      };
    });

    await page.goto(`http://127.0.0.1:4173/?clear=${Date.now()}-${current.name}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: new URL(`${current.name}-00-loading.png`, outputDir).pathname });

    await page.waitForFunction(() => document.body.dataset.phase === 'room-reveal', null, { timeout: 45_000 });
    await page.waitForFunction(() => globalThis.__yakolakV130Branding?.gameLogo && globalThis.__yakolakV130Branding?.companyLogo, null, { timeout: 10_000 });
    const revealState = await readState();
    console.log(`${current.name} reveal state:`, JSON.stringify(revealState));
    assert.equal(revealState.loaderPresent, false, `${current.name}: loader overlay did not hand off`);
    assert.equal(revealState.approvedRoom, true, `${current.name}: approved room missing`);
    assert.equal(revealState.fakeCssRoom, false, `${current.name}: replacement CSS room/table exists`);
    assert.equal(revealState.tableVisible, true, `${current.name}: established table is hidden`);
    assert.equal(revealState.starPresent, true, `${current.name}: first-wall star object is missing`);
    assert.equal(revealState.brandingPresent, true, `${current.name}: brand wall was not prepared before the turn`);
    assert.equal(revealState.sampleHidden, true, `${current.name}: legacy sample text is still visible`);
    await page.waitForTimeout(700);
    await page.screenshot({ path: new URL(`${current.name}-01-room-transition.png`, outputDir).pathname });

    await page.waitForFunction(() => document.body.dataset.phase === 'sample-wall', null, { timeout: 20_000 });
    await page.waitForFunction(() => {
      const branding=globalThis.__yakolakV130Branding;
      const images=[branding?.gameLogo?.material?.map?.image,branding?.companyLogo?.material?.map?.image];
      return images.every(image=>image&&(image.naturalWidth>0||image.width>0));
    }, null, { timeout: 15_000 });
    await page.waitForTimeout(300);
    const finalState = await readState();
    console.log(`${current.name} final state:`, JSON.stringify(finalState));
    await page.screenshot({ path: new URL(`${current.name}-02-brand-wall.png`, outputDir).pathname });
    assert.equal(finalState.starVisible, false, `${current.name}: star remained after leaving view`);
    assert.equal(finalState.gameLogoVisible, true, `${current.name}: game logo is hidden`);
    assert.equal(finalState.companyLogoVisible, true, `${current.name}: company logo is hidden`);
    assert.equal(finalState.gameLogoLoaded, true, `${current.name}: YAKOLAK.svg did not load`);
    assert.equal(finalState.companyLogoLoaded, true, `${current.name}: MTKYF.svg did not load`);
    assert.equal(finalState.sampleHidden, true, `${current.name}: sample text returned`);
    assert.ok(finalState.facingX > .9, `${current.name}: camera is not facing the second wall`);
    assert.equal(finalState.roomSource, 'approved-v125-room', `${current.name}: wrong room source`);
    assert.equal(finalState.tableSource, 'established-neutral-table', `${current.name}: wrong table source`);
    assert.equal(finalState.responsiveLayout, current.name==='mobile'?'portrait':'landscape', `${current.name}: wrong responsive logo layout`);
    assert.deepEqual(finalState.brandAssets, [
      'https://raw.githubusercontent.com/A7SNcom/yakolak/main/assets/YAKOLAK.svg',
      'https://raw.githubusercontent.com/A7SNcom/yakolak/main/assets/MTKYF.svg'
    ], `${current.name}: wrong logo assets`);
    assert.deepEqual(fatalErrors, [], `${current.name}: fatal browser errors\n${fatalErrors.join('\n')}`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('v130 official brand-wall continuity passed on desktop and mobile.');
