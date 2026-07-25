import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4175';
const outputDir = new URL('../artifacts/v121-piece-normals/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
});

const pageErrors = [];
const consoleErrors = [];

function watch(page, label) {
  page.on('pageerror', error => pageErrors.push(`${label}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(`${label}: ${message.text()}`);
    }
  });
}

async function inspect(page, label) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 65_000 });
  await page.waitForFunction(() =>
    document.body.classList.contains('yakolak-ready') &&
    Boolean(globalThis.__yakolakGame?.renderer) &&
    Boolean(globalThis.__yakolakV121PieceNormals),
  null, { timeout: 65_000 });

  await page.waitForFunction(() => {
    const report = globalThis.__yakolakV121PieceNormals;
    return report.mobile ? report.applied || report.error : report.unchangedRenderCost;
  }, null, { timeout: 30_000 });

  const metrics = await page.evaluate(() => {
    const report = structuredClone(globalThis.__yakolakV121PieceNormals);
    const game = globalThis.__yakolakGame;
    const materials = [...new Set((game.pieces || []).map(piece => piece.mesh.material))].map(material => ({
      type: material.type,
      roughness: material.roughness,
      metalness: material.metalness,
      color: `#${material.color.getHexString()}`,
      emissive: material.emissive ? `#${material.emissive.getHexString()}` : null,
      emissiveIntensity: material.emissiveIntensity || 0
    }));
    return {
      report,
      renderer: { ...game.renderer.info.render },
      pixelRatio: game.renderer.getPixelRatio(),
      materials,
      pieceCount: game.pieces.length,
      uniqueGeometries: new Set(game.pieces.map(piece => piece.mesh.geometry)).size
    };
  });

  await page.screenshot({ path: new URL(`${label}.png`, outputDir), fullPage: false });
  return metrics;
}

let desktopContext;
let mobileContext;
try {
  desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const desktopPage = await desktopContext.newPage();
  const mobilePage = await mobileContext.newPage();
  watch(desktopPage, 'desktop');
  watch(mobilePage, 'mobile');

  const [desktop, mobile] = await Promise.all([
    inspect(desktopPage, 'desktop'),
    inspect(mobilePage, 'mobile')
  ]);

  assert.equal(desktop.report.mobile, false);
  assert.equal(desktop.report.applied, false);
  assert.equal(desktop.report.unchangedRenderCost, true);
  assert.equal(desktop.report.error, null);

  assert.equal(mobile.report.mobile, true);
  assert.equal(mobile.report.applied, true);
  assert.equal(mobile.report.unchangedRenderCost, true);
  assert.equal(mobile.report.error, null);
  assert.equal(mobile.report.geometries.length, 3);
  assert.equal(mobile.pieceCount, 36);
  assert.equal(mobile.uniqueGeometries, 3);

  for (const geometry of mobile.report.geometries) {
    assert.equal(geometry.positionsBefore, geometry.positionsAfter);
    assert.equal(geometry.trianglesBefore, geometry.trianglesAfter);
    assert.equal(geometry.normalCount, geometry.positionsBefore);
  }

  assert.equal(mobile.report.rendererBefore.calls, mobile.report.rendererAfter.calls);
  assert.equal(mobile.report.rendererBefore.triangles, mobile.report.rendererAfter.triangles);
  assert.equal(mobile.report.rendererBefore.points, mobile.report.rendererAfter.points);
  assert.equal(mobile.report.rendererBefore.lines, mobile.report.rendererAfter.lines);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);

  const results = {
    ok: true,
    appUrl: APP_URL,
    desktop,
    mobile,
    pageErrors,
    consoleErrors,
    screenshots: ['desktop.png', 'mobile.png']
  };
  await writeFile(new URL('results.json', outputDir), JSON.stringify(results, null, 2));
  console.log('v121 browser piece-normal verification passed');
} catch (error) {
  await writeFile(new URL('results.json', outputDir), JSON.stringify({
    ok: false,
    error: error.stack || String(error),
    pageErrors,
    consoleErrors
  }, null, 2));
  throw error;
} finally {
  await desktopContext?.close().catch(() => {});
  await mobileContext?.close().catch(() => {});
  await browser.close().catch(() => {});
}
