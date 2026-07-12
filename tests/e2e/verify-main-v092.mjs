import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.BASE_URL || 'https://yakolak.vercel.app';
const outDir = process.env.ARTIFACT_DIR || 'artifacts/e2e';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function tap(page, point, mobile) {
  if (mobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function project(page, resolver, arg) {
  const point = await page.evaluate(resolver, arg);
  assert(point && Number.isFinite(point.x) && Number.isFinite(point.y), 'تعذر حساب موضع العنصر');
  return point;
}

async function chooseSetup(page, type, value, mobile) {
  const point = await project(page, ({ type, value }) => {
    const g = globalThis.__yakolakGame;
    const hits = [];
    g.setupGroup.traverse((object) => {
      const action = object?.userData?.setupAction;
      if (!action || action.type !== type || String(action.value) !== String(value)) return;
      hits.push({ object, priority: object.geometry?.type === 'PlaneGeometry' ? 0 : 1 });
    });
    hits.sort((a, b) => a.priority - b.priority);
    const object = hits[0]?.object;
    if (!object) return null;
    const p = new g.THREE.Vector3();
    object.getWorldPosition(p);
    p.project(g.camera);
    const rect = g.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  }, { type, value });
  await tap(page, point, mobile);
}

async function openHumanTray(page, mobile) {
  const point = await project(page, () => {
    const g = globalThis.__yakolakGame;
    const color = g.state.humanColor;
    const piece = g.pieces.find((p) => p.dir === color && p.type === 'l' && p.side === 0 && !p.placed)
      || g.pieces.find((p) => p.dir === color && !p.placed);
    if (!piece) return null;
    const pos = new g.THREE.Vector3();
    piece.mesh.getWorldPosition(pos);
    pos.project(g.camera);
    const rect = g.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (pos.x + 1) * rect.width / 2, y: rect.top + (1 - pos.y) * rect.height / 2 };
  });
  await tap(page, point, mobile);
}

async function chooseSafeZonePoint(page, zoneId) {
  return project(page, (id) => {
    const g = globalThis.__yakolakGame;
    const zone = g.boardZones.find((item) => item.id === id);
    if (!zone) return null;
    const rect = g.renderer.domElement.getBoundingClientRect();
    const pieces = g.pieces.filter((p) => p.mesh.visible && !p.placed && p.dir === g.state.humanColor);
    const offsets = [[0, 0], [-18, -18], [-18, 18], [18, -18], [18, 18], [-22, 0], [22, 0], [0, -22], [0, 22]];
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
      const blocked = raycaster.intersectObjects(pieces.map((p) => p.mesh), false).length > 0;
      let nearest = Infinity;
      for (const piece of pieces) {
        const p = new g.THREE.Vector3();
        piece.mesh.getWorldPosition(p);
        p.project(g.camera);
        const px = rect.left + (p.x + 1) * rect.width / 2;
        const py = rect.top + (1 - p.y) * rect.height / 2;
        nearest = Math.min(nearest, Math.hypot(x - px, y - py));
      }
      const score = (blocked ? -10000 : 0) + nearest;
      if (!best || score > best.score) best = { x, y, score, blocked, dx, dz };
    }
    return best;
  }, zoneId);
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
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () => document.body.classList.contains('yakolak-ready') && globalThis.__yakolakGame?.pieces?.length === 36,
    null,
    { timeout: 120_000 },
  );

  const initial = await page.evaluate(async () => {
    const version = await fetch('./version.json', { cache: 'no-store' }).then((r) => r.json());
    return {
      build: Number(version.build),
      title: document.title,
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      caption: document.querySelector('#yakolakGameHud .yg-caption')?.textContent || '',
      loader: Boolean(document.getElementById('yakolakLoader')),
      pieces: globalThis.__yakolakGame.pieces.length,
    };
  });
  assert(initial.build === 92, `${name}: النسخة ليست 92`);
  assert(initial.title === 'Yakolak Live', `${name}: عنوان الصفحة غير صحيح`);
  assert(initial.pieces === 36, `${name}: عدد القطع غير صحيح`);
  assert(!initial.loader, `${name}: شاشة التحميل لم تختف`);
  assert(initial.scrollWidth <= initial.width + 2, `${name}: يوجد تمرير أفقي`);
  assert(initial.caption.includes('اختار'), `${name}: شاشة البداية لم تظهر`);
  await page.screenshot({ path: `${outDir}/${name}-01-loaded.png`, fullPage: true });

  await chooseSetup(page, 'color', 'right', mobile);
  await page.waitForFunction(() => globalThis.__yakolakGame.state.setupStep === 'bots', null, { timeout: 15_000 });
  await chooseSetup(page, 'bots', 1, mobile);

  for (let step = 0; step < 3; step += 1) {
    const button = page.locator('#yakolakTutorialDialog.open .yt-ok');
    await button.waitFor({ state: 'visible', timeout: 120_000 });
    if (step === 0) await page.screenshot({ path: `${outDir}/${name}-02-tutorial.png`, fullPage: true });
    await button.click();
  }

  await page.waitForFunction(() => {
    const state = globalThis.__yakolakGame.state;
    return state.started && !state.tutorial && !state.locked && !state.winner;
  }, null, { timeout: 120_000 });

  const round = await page.evaluate(() => ({
    players: [...globalThis.__yakolakGame.state.players],
    score: document.getElementById('yakolakGameScore')?.textContent || '',
  }));
  assert(round.players.length === 2, `${name}: لم تبدأ لعبة لاعبين`);
  assert(round.score.includes('ث'), `${name}: المؤقت غير ظاهر`);
  await page.screenshot({ path: `${outDir}/${name}-03-round.png`, fullPage: true });

  await openHumanTray(page, mobile);
  await page.waitForFunction(() => {
    const g = globalThis.__yakolakGame;
    return g.gameGroup.children.some((object) => object.name?.startsWith('yakolak-drop-zone-') && object.visible);
  }, null, { timeout: 15_000 });
  await page.screenshot({ path: `${outDir}/${name}-04-tray.png`, fullPage: true });

  const zoneId = 0;
  const zonePoint = await chooseSafeZonePoint(page, zoneId);
  await tap(page, zonePoint, mobile);
  await page.waitForFunction((id) => {
    const g = globalThis.__yakolakGame;
    const color = g.state.humanColor;
    return Object.values(g.state.board?.[id] || {}).includes(color);
  }, zoneId, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const g = globalThis.__yakolakGame;
    return Object.values(g.state.board || {}).some((cell) => Object.values(cell || {}).some((color) => color && color !== g.state.humanColor));
  }, null, { timeout: 20_000 });
  await page.screenshot({ path: `${outDir}/${name}-05-moves.png`, fullPage: true });

  const wins = await page.evaluate(() => {
    const g = globalThis.__yakolakGame;
    return {
      same: g.debugWin('same-size', g.state.humanColor)?.type,
      graded: g.debugWin('graded', g.state.humanColor)?.type,
      cell: g.debugWin('cell', g.state.humanColor)?.type,
    };
  });
  assert(wins.same === 'same-size' && wins.graded === 'graded' && wins.cell === 'cell', `${name}: منطق الفوز غير مكتمل`);
  await page.evaluate(() => {
    const g = globalThis.__yakolakGame;
    g.debugTriggerWin('same-size', g.state.humanColor);
  });
  await page.waitForFunction(() => Boolean(globalThis.__yakolakGame.state.winner), null, { timeout: 15_000 });
  await page.screenshot({ path: `${outDir}/${name}-06-win.png`, fullPage: true });

  const fatal = consoleErrors.filter((text) => /uncaught|prod stage1 error|syntaxerror|referenceerror|typeerror/i.test(text));
  assert(pageErrors.length === 0, `${name}: أخطاء صفحة: ${pageErrors.join(' | ')}`);
  assert(fatal.length === 0, `${name}: أخطاء كونسول: ${fatal.join(' | ')}`);

  await context.close();
  return { name, viewport, mobile, build: initial.build, zonePoint, wins, passed: true };
}

const report = { ok: false, baseUrl, results: [] };
try {
  report.results.push(await runScenario('desktop-1440x900', { width: 1440, height: 900 }, false));
  report.results.push(await runScenario('mobile-390x844', { width: 390, height: 844 }, true));
  report.ok = true;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = String(error?.stack || error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(`${outDir}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
