import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const previewUrl = process.env.PREVIEW_URL;
if (!previewUrl) throw new Error('PREVIEW_URL is required');

const outDir = process.env.ARTIFACT_DIR || 'artifacts/e2e';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function projectedPoint(page, resolver) {
  const point = await page.evaluate(resolver);
  assert(point && Number.isFinite(point.x) && Number.isFinite(point.y), 'Could not project a 3D target to the screen');
  return point;
}

async function clickSetupChoice(page, type, value) {
  const point = await projectedPoint(page, ({ type, value }) => {
    const g = globalThis.__yakolakGame;
    const candidates = [];
    g.setupGroup.traverse((o) => {
      const action = o?.userData?.setupAction;
      if (!action || action.type !== type || String(action.value) !== String(value)) return;
      const geometryType = o.geometry?.type || '';
      candidates.push({ o, priority: geometryType === 'CircleGeometry' || geometryType === 'PlaneGeometry' ? 0 : 1 });
    });
    candidates.sort((a, b) => a.priority - b.priority);
    const target = candidates[0]?.o;
    if (!target) return null;
    const p = new g.THREE.Vector3();
    target.getWorldPosition(p);
    p.project(g.camera);
    const r = g.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  }, { type, value });
  await page.mouse.click(point.x, point.y);
}

async function clickHumanPiece(page) {
  const point = await projectedPoint(page, () => {
    const g = globalThis.__yakolakGame;
    const color = g.state.humanColor;
    const piece = g.pieces.find((p) => p.dir === color && p.type === 'l' && p.side === 0 && !p.placed) ||
      g.pieces.find((p) => p.dir === color && !p.placed);
    if (!piece) return null;
    const p = new g.THREE.Vector3();
    piece.mesh.getWorldPosition(p);
    p.project(g.camera);
    const r = g.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
}

async function clickBoardZone(page, zoneId) {
  const point = await projectedPoint(page, (zoneId) => {
    const g = globalThis.__yakolakGame;
    const z = g.boardZones.find((x) => x.id === zoneId);
    if (!z) return null;
    const p = new g.THREE.Vector3(z.px, z.py, z.pz);
    g.gameGroup.localToWorld(p);
    p.project(g.camera);
    const r = g.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  }, zoneId);
  await page.mouse.click(point.x, point.y);
}

async function runScenario(name, viewport, mobile) {
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
    locale: 'ar-SA',
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedSameOriginRequests = [];

  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    try {
      const failed = new URL(request.url());
      const base = new URL(previewUrl);
      if (failed.origin === base.origin) failedSameOriginRequests.push(`${request.method()} ${failed.pathname}: ${request.failure()?.errorText || 'failed'}`);
    } catch {}
  });

  const startedAt = Date.now();
  await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.body.classList.contains('yakolak-ready') && globalThis.__yakolakGame?.pieces?.length === 36, null, { timeout: 120_000 });

  const version = await page.evaluate(() => fetch('./version.json', { cache: 'no-store' }).then((r) => r.json()));
  assert(Number(version.build) === 92, `${name}: expected build 92, got ${version.build}`);

  const initial = await page.evaluate(() => ({
    title: document.title,
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    height: innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    state: { ...globalThis.__yakolakGame.state },
    caption: document.querySelector('#yakolakGameHud .yg-caption')?.textContent || '',
    loaderExists: Boolean(document.getElementById('yakolakLoader')),
    overlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')),
  }));

  assert(initial.title === 'Yakolak Live', `${name}: unexpected title ${initial.title}`);
  assert(!initial.loaderExists, `${name}: loader did not disappear`);
  assert(!initial.overlay, `${name}: error overlay detected`);
  assert(initial.scrollWidth <= initial.width + 2, `${name}: horizontal overflow ${initial.scrollWidth} > ${initial.width}`);
  assert(initial.caption.includes('اختار'), `${name}: setup caption did not render`);
  await page.screenshot({ path: `${outDir}/${name}-01-loaded.png`, fullPage: true });

  await clickSetupChoice(page, 'color', 'right');
  await page.waitForFunction(() => globalThis.__yakolakGame.state.setupStep === 'bots', null, { timeout: 10_000 });
  await page.screenshot({ path: `${outDir}/${name}-02-player-count.png`, fullPage: true });

  await clickSetupChoice(page, 'bots', 1);
  for (let i = 0; i < 3; i += 1) {
    const ok = page.locator('#yakolakTutorialDialog.open .yt-ok');
    await ok.waitFor({ state: 'visible', timeout: 120_000 });
    if (i === 0) await page.screenshot({ path: `${outDir}/${name}-03-tutorial.png`, fullPage: true });
    await ok.click();
  }

  await page.waitForFunction(() => {
    const s = globalThis.__yakolakGame.state;
    return s.started && !s.tutorial && !s.locked && !s.winner;
  }, null, { timeout: 120_000 });

  const readyState = await page.evaluate(() => ({
    state: { ...globalThis.__yakolakGame.state },
    scoreText: document.getElementById('yakolakGameScore')?.textContent || '',
    caption: document.querySelector('#yakolakGameHud .yg-caption')?.textContent || '',
  }));
  assert(readyState.state.players.length === 2, `${name}: two-player game was not configured`);
  assert(readyState.scoreText.includes('ث'), `${name}: turn timer is not visible`);
  await page.screenshot({ path: `${outDir}/${name}-04-round-ready.png`, fullPage: true });

  await clickHumanPiece(page);
  await page.waitForTimeout(700);
  await clickBoardZone(page, 4);
  await page.waitForFunction(() => {
    const g = globalThis.__yakolakGame;
    const color = g.state.humanColor;
    return g.state.board?.[4]?.l === color || g.state.board?.[4]?.m === color || g.state.board?.[4]?.s === color;
  }, null, { timeout: 15_000 });

  await page.waitForFunction(() => {
    const g = globalThis.__yakolakGame;
    return Object.values(g.state.board || {}).some((cell) => Object.values(cell || {}).some((color) => color && color !== g.state.humanColor));
  }, null, { timeout: 15_000 });
  await page.screenshot({ path: `${outDir}/${name}-05-after-moves.png`, fullPage: true });

  const winLogic = await page.evaluate(() => {
    const g = globalThis.__yakolakGame;
    return {
      sameSize: g.debugWin('same-size', g.state.humanColor),
      graded: g.debugWin('graded', g.state.humanColor),
      cell: g.debugWin('cell', g.state.humanColor),
    };
  });
  assert(winLogic.sameSize?.type === 'same-size', `${name}: same-size win logic failed`);
  assert(winLogic.graded?.type === 'graded', `${name}: graded win logic failed`);
  assert(winLogic.cell?.type === 'cell', `${name}: cell win logic failed`);

  await page.evaluate(() => {
    const g = globalThis.__yakolakGame;
    g.debugTriggerWin('same-size', g.state.humanColor);
  });
  await page.waitForFunction(() => Boolean(globalThis.__yakolakGame.state.winner), null, { timeout: 15_000 });
  await page.screenshot({ path: `${outDir}/${name}-06-win.png`, fullPage: true });

  const fatalConsoleErrors = consoleErrors.filter((text) => /uncaught|prod stage1 error|failed to load module|syntaxerror|referenceerror|typeerror/i.test(text));
  assert(pageErrors.length === 0, `${name}: page errors: ${pageErrors.join(' | ')}`);
  assert(fatalConsoleErrors.length === 0, `${name}: fatal console errors: ${fatalConsoleErrors.join(' | ')}`);
  assert(failedSameOriginRequests.length === 0, `${name}: same-origin request failures: ${failedSameOriginRequests.join(' | ')}`);

  results.push({
    name,
    viewport,
    mobile,
    durationMs: Date.now() - startedAt,
    build: version.build,
    initial,
    readyState,
    winLogic,
    consoleErrors,
    pageErrors,
    failedSameOriginRequests,
    passed: true,
  });
  await context.close();
}

try {
  await runScenario('desktop-1440x900', { width: 1440, height: 900 }, false);
  await runScenario('mobile-390x844', { width: 390, height: 844 }, true);
  await fs.writeFile(`${outDir}/results.json`, JSON.stringify({ ok: true, previewUrl, results }, null, 2));
  console.log(JSON.stringify({ ok: true, results: results.map((r) => ({ name: r.name, durationMs: r.durationMs, build: r.build })) }, null, 2));
} catch (error) {
  await fs.writeFile(`${outDir}/results.json`, JSON.stringify({ ok: false, previewUrl, results, error: String(error?.stack || error) }, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
