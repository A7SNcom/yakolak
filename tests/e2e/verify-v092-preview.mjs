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

async function projectedPoint(page, resolver, arg) {
  const point = await page.evaluate(resolver, arg);
  assert(point && Number.isFinite(point.x) && Number.isFinite(point.y), 'Could not project a 3D target to the screen');
  return point;
}

async function pressPoint(page, point, mobile) {
  if (mobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function clickSetupChoice(page, type, value, mobile) {
  const point = await projectedPoint(page, ({ type, value }) => {
    const g = globalThis.__yakolakGame;
    const candidates = [];
    g.setupGroup.traverse((object) => {
      const action = object?.userData?.setupAction;
      if (!action || action.type !== type || String(action.value) !== String(value)) return;
      const geometryType = object.geometry?.type || '';
      candidates.push({ object, priority: geometryType === 'CircleGeometry' || geometryType === 'PlaneGeometry' ? 0 : 1 });
    });
    candidates.sort((a, b) => a.priority - b.priority);
    const target = candidates[0]?.object;
    if (!target) return null;
    const position = new g.THREE.Vector3();
    target.getWorldPosition(position);
    position.project(g.camera);
    const rect = g.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (position.x + 1) * rect.width / 2,
      y: rect.top + (1 - position.y) * rect.height / 2,
    };
  }, { type, value });
  await pressPoint(page, point, mobile);
}

async function clickHumanPiece(page, mobile) {
  const point = await projectedPoint(page, () => {
    const g = globalThis.__yakolakGame;
    const color = g.state.humanColor;
    const piece = g.pieces.find((candidate) => candidate.dir === color && candidate.type === 'l' && candidate.side === 0 && !candidate.placed)
      || g.pieces.find((candidate) => candidate.dir === color && !candidate.placed);
    if (!piece) return null;
    const position = new g.THREE.Vector3();
    piece.mesh.getWorldPosition(position);
    position.project(g.camera);
    const rect = g.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (position.x + 1) * rect.width / 2,
      y: rect.top + (1 - position.y) * rect.height / 2,
    };
  });
  await pressPoint(page, point, mobile);
}

async function clickBoardZone(page, zoneId, mobile) {
  const point = await projectedPoint(page, (targetZoneId) => {
    const g = globalThis.__yakolakGame;
    const zone = g.boardZones.find((candidate) => candidate.id === targetZoneId);
    if (!zone) return null;

    const rect = g.renderer.domElement.getBoundingClientRect();
    const offsets = [
      [0, 0], [-18, -18], [-18, 18], [18, -18], [18, 18],
      [-22, 0], [22, 0], [0, -22], [0, 22],
    ];
    const visibleHumanPieces = g.pieces.filter((piece) => piece.mesh.visible && !piece.placed && piece.dir === g.state.humanColor);
    const raycaster = new g.THREE.Raycaster();
    const ndc = new g.THREE.Vector2();
    let best = null;

    for (const [dx, dz] of offsets) {
      const world = new g.THREE.Vector3(zone.px + dx, zone.py, zone.pz + dz);
      g.gameGroup.localToWorld(world);
      const projected = world.clone().project(g.camera);
      const x = rect.left + (projected.x + 1) * rect.width / 2;
      const y = rect.top + (1 - projected.y) * rect.height / 2;

      ndc.set(((x - rect.left) / rect.width) * 2 - 1, -(((y - rect.top) / rect.height) * 2 - 1));
      raycaster.setFromCamera(ndc, g.camera);
      const directHit = raycaster.intersectObjects(visibleHumanPieces.map((piece) => piece.mesh), false).length > 0;

      let minScreenDistance = Infinity;
      for (const piece of visibleHumanPieces) {
        const pieceWorld = new g.THREE.Vector3();
        piece.mesh.getWorldPosition(pieceWorld);
        const pieceProjected = pieceWorld.project(g.camera);
        const pieceX = rect.left + (pieceProjected.x + 1) * rect.width / 2;
        const pieceY = rect.top + (1 - pieceProjected.y) * rect.height / 2;
        minScreenDistance = Math.min(minScreenDistance, Math.hypot(x - pieceX, y - pieceY));
      }

      const score = (directHit ? -10000 : 0) + minScreenDistance;
      if (!best || score > best.score) best = { x, y, score, directHit, minScreenDistance, dx, dz };
    }
    return best;
  }, zoneId);

  await pressPoint(page, point, mobile);
  return point;
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
      if (failed.origin === base.origin) {
        failedSameOriginRequests.push(`${request.method()} ${failed.pathname}: ${request.failure()?.errorText || 'failed'}`);
      }
    } catch {}
  });

  const startedAt = Date.now();
  await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () => document.body.classList.contains('yakolak-ready') && globalThis.__yakolakGame?.pieces?.length === 36,
    null,
    { timeout: 120_000 },
  );

  const version = await page.evaluate(() => fetch('./version.json', { cache: 'no-store' }).then((response) => response.json()));
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

  await clickSetupChoice(page, 'color', 'right', mobile);
  await page.waitForFunction(() => globalThis.__yakolakGame.state.setupStep === 'bots', null, { timeout: 10_000 });
  await page.screenshot({ path: `${outDir}/${name}-02-player-count.png`, fullPage: true });

  await clickSetupChoice(page, 'bots', 1, mobile);
  for (let index = 0; index < 3; index += 1) {
    const ok = page.locator('#yakolakTutorialDialog.open .yt-ok');
    await ok.waitFor({ state: 'visible', timeout: 120_000 });
    if (index === 0) await page.screenshot({ path: `${outDir}/${name}-03-tutorial.png`, fullPage: true });
    await ok.click();
  }

  await page.waitForFunction(() => {
    const state = globalThis.__yakolakGame.state;
    return state.started && !state.tutorial && !state.locked && !state.winner;
  }, null, { timeout: 120_000 });

  const readyState = await page.evaluate(() => ({
    state: { ...globalThis.__yakolakGame.state },
    scoreText: document.getElementById('yakolakGameScore')?.textContent || '',
    caption: document.querySelector('#yakolakGameHud .yg-caption')?.textContent || '',
  }));
  assert(readyState.state.players.length === 2, `${name}: two-player game was not configured`);
  assert(readyState.scoreText.includes('ث'), `${name}: turn timer is not visible`);
  await page.screenshot({ path: `${outDir}/${name}-04-round-ready.png`, fullPage: true });

  await clickHumanPiece(page, mobile);
  await page.waitForFunction(() => {
    const game = globalThis.__yakolakGame;
    return game.gameGroup.children.some((object) => object.name?.startsWith('yakolak-drop-zone-') && object.visible);
  }, null, { timeout: 10_000 });
  await page.screenshot({ path: `${outDir}/${name}-04b-piece-opened.png`, fullPage: true });

  const targetZone = 0;
  const zonePoint = await clickBoardZone(page, targetZone, mobile);
  try {
    await page.waitForFunction((zoneId) => {
      const game = globalThis.__yakolakGame;
      const color = game.state.humanColor;
      return game.state.board?.[zoneId]?.l === color
        || game.state.board?.[zoneId]?.m === color
        || game.state.board?.[zoneId]?.s === color;
    }, targetZone, { timeout: 15_000 });
  } catch (error) {
    const failedState = await page.evaluate((zoneId) => ({
      zoneId,
      state: { ...globalThis.__yakolakGame.state },
      board: globalThis.__yakolakGame.state.board,
      caption: document.querySelector('#yakolakGameHud .yg-caption')?.textContent || '',
    }), targetZone);
    await page.screenshot({ path: `${outDir}/${name}-04c-zone-click-failed.png`, fullPage: true });
    throw new Error(`${name}: zone click did not commit at ${JSON.stringify(zonePoint)}; ${JSON.stringify(failedState)}; ${error}`);
  }

  await page.waitForFunction(() => {
    const game = globalThis.__yakolakGame;
    return Object.values(game.state.board || {}).some((cell) => Object.values(cell || {}).some((color) => color && color !== game.state.humanColor));
  }, null, { timeout: 15_000 });
  await page.screenshot({ path: `${outDir}/${name}-05-after-moves.png`, fullPage: true });

  const winLogic = await page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    return {
      sameSize: game.debugWin('same-size', game.state.humanColor),
      graded: game.debugWin('graded', game.state.humanColor),
      cell: game.debugWin('cell', game.state.humanColor),
    };
  });
  assert(winLogic.sameSize?.type === 'same-size', `${name}: same-size win logic failed`);
  assert(winLogic.graded?.type === 'graded', `${name}: graded win logic failed`);
  assert(winLogic.cell?.type === 'cell', `${name}: cell win logic failed`);

  await page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    game.debugTriggerWin('same-size', game.state.humanColor);
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
    targetZone,
    zonePoint,
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
  console.log(JSON.stringify({
    ok: true,
    results: results.map((result) => ({ name: result.name, durationMs: result.durationMs, build: result.build })),
  }, null, 2));
} catch (error) {
  await fs.writeFile(`${outDir}/results.json`, JSON.stringify({
    ok: false,
    previewUrl,
    results,
    error: String(error?.stack || error),
  }, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
