import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const outDir = process.env.ARTIFACT_DIR || 'artifacts/v093';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = { ok: false, baseUrl, results: [] };

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function shot(page, path) {
  await page.screenshot({ path, timeout: 120_000 });
}

async function tap(page, point, mobile) {
  if (mobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function project(page, resolver, arg) {
  const point = await page.evaluate(resolver, arg);
  assert(point && Number.isFinite(point.x) && Number.isFinite(point.y), 'تعذر حساب موضع عنصر ثلاثي الأبعاد');
  return point;
}

async function chooseSetup(page, type, value, mobile) {
  const points = await page.evaluate(({ type, value }) => {
    const g = globalThis.__yakolakGame;
    const hits = [];
    g.setupGroup.traverse((object) => {
      const action = object?.userData?.setupAction;
      if (!action || action.type !== type || String(action.value) !== String(value)) return;
      const p = new g.THREE.Vector3();
      object.getWorldPosition(p);
      p.project(g.camera);
      const rect = g.renderer.domElement.getBoundingClientRect();
      hits.push({
        x: rect.left + (p.x + 1) * rect.width / 2,
        y: rect.top + (1 - p.y) * rect.height / 2,
        priority: object.geometry?.type === 'PlaneGeometry' ? 0 : 1,
        geometry: object.geometry?.type || '',
      });
    });
    hits.sort((a, b) => a.priority - b.priority);
    return hits.filter((point, index, all) => all.findIndex((other) => Math.hypot(other.x - point.x, other.y - point.y) < 3) === index);
  }, { type, value });
  assert(points.length > 0, `لا توجد أسطح للاختيار ${type}:${value}`);
  for (const point of points) {
    await tap(page, point, mobile);
    try {
      await page.waitForFunction((kind) => {
        const state = globalThis.__yakolakGame.state;
        return kind === 'color' ? state.setupStep === 'bots' : state.configured;
      }, type, { timeout: 3500 });
      return;
    } catch {}
  }
  const completed = await page.evaluate((kind) => {
    const state = globalThis.__yakolakGame.state;
    return kind === 'color' ? state.setupStep === 'bots' : state.configured;
  }, type);
  if (completed) return;
  const state = await page.evaluate(() => ({ ...globalThis.__yakolakGame.state }));
  throw new Error(`لم ينجح اختيار ${type}:${value} - ${JSON.stringify(state)}`);
}

async function openHumanTray(page, mobile) {
  const point = await project(page, () => {
    const g = globalThis.__yakolakGame;
    const color = g.state.humanColor;
    const piece = g.pieces.find((p) => p.dir === color && p.type === 'l' && p.side === 0 && !p.placed)
      || g.pieces.find((p) => p.dir === color && !p.placed);
    if (!piece) return null;
    const p = new g.THREE.Vector3();
    piece.mesh.getWorldPosition(p);
    p.project(g.camera);
    const rect = g.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  });
  await tap(page, point, mobile);
}

async function safeZonePoint(page, zoneId) {
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
      if (!best || score > best.score) best = { x, y, score };
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
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () => document.body.classList.contains('yakolak-ready') && globalThis.__yakolakGame?.pieces?.length === 36,
    null,
    { timeout: 120_000 },
  );

  const initial = await page.evaluate(async () => {
    const version = await fetch('./version.json', { cache: 'no-store' }).then((r) => r.json());
    const score = document.getElementById('yakolakGameScore');
    return {
      build: Number(version.build),
      title: document.title,
      pieces: globalThis.__yakolakGame.pieces.length,
      caption: document.querySelector('.yg-caption')?.textContent || '',
      loader: Boolean(document.getElementById('yakolakLoader')),
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scoreOverflow: score ? score.scrollWidth - score.clientWidth : 0,
    };
  });
  assert(initial.build === 93, `${name}: النسخة ليست 93`);
  assert(initial.title === 'Yakolak Live', `${name}: العنوان غير صحيح`);
  assert(initial.pieces === 36, `${name}: عدد القطع تغير`);
  assert(!initial.loader, `${name}: شاشة التحميل لم تختف`);
  assert(initial.scrollWidth <= initial.width + 2, `${name}: تمرير أفقي في الصفحة`);
  assert(initial.caption.includes('اختار'), `${name}: شاشة الاختيار لم تظهر`);
  await shot(page, `${outDir}/${name}-01-loaded.png`);

  await chooseSetup(page, 'color', 'right', mobile);
  await page.waitForFunction(() => globalThis.__yakolakGame.state.setupStep === 'bots', null, { timeout: 15_000 });
  await chooseSetup(page, 'bots', 1, mobile);
  await shot(page, `${outDir}/${name}-01b-configured.png`);

  await page.waitForFunction(() => {
    const state = globalThis.__yakolakGame.state;
    return state.tutorial || state.started;
  }, null, { timeout: 150_000 });

  let tutorialPrompts = 0;
  while (await page.evaluate(() => globalThis.__yakolakGame.state.tutorial)) {
    await page.waitForFunction(() => {
      const g = globalThis.__yakolakGame;
      return !g.state.tutorial || document.querySelector('#yakolakTutorialDialog.open .yt-ok');
    }, null, { timeout: 150_000 });
    const stillTutorial = await page.evaluate(() => globalThis.__yakolakGame.state.tutorial);
    if (!stillTutorial) break;
    if (tutorialPrompts === 0) await shot(page, `${outDir}/${name}-02-tutorial.png`);
    await page.evaluate(() => document.querySelector('#yakolakTutorialDialog.open .yt-ok')?.click());
    await page.waitForFunction(() => !document.querySelector('#yakolakTutorialDialog.open'), null, { timeout: 10_000 });
    tutorialPrompts += 1;
    assert(tutorialPrompts <= 3, `${name}: عدد نوافذ التعليم تجاوز المتوقع`);
  }
  assert(tutorialPrompts === 3, `${name}: اكتملت ${tutorialPrompts} من 3 نوافذ تعليم`);

  await page.waitForFunction(() => {
    const state = globalThis.__yakolakGame.state;
    return state.started && !state.tutorial && !state.locked && !state.winner;
  }, null, { timeout: 120_000 });

  const round = await page.evaluate(() => ({
    players: [...globalThis.__yakolakGame.state.players],
    score: document.getElementById('yakolakGameScore')?.textContent || '',
    visibleZones: globalThis.__yakolakGame.gameGroup.children.filter((o) => o.name?.startsWith('yakolak-drop-zone-') && o.visible).length,
  }));
  assert(round.players.length === 2, `${name}: إعداد اللاعبين تغير`);
  assert(round.score.includes('ث'), `${name}: المؤقت غير ظاهر`);
  assert(round.visibleZones === 9, `${name}: علامات الخانات الخافتة غير ظاهرة`);
  await shot(page, `${outDir}/${name}-03-round.png`);

  await openHumanTray(page, mobile);
  await page.waitForFunction(() => globalThis.__yakolakGame.gameGroup.children.filter((o) => o.name?.startsWith('yakolak-drop-zone-') && o.visible).length === 9, null, { timeout: 15_000 });
  await shot(page, `${outDir}/${name}-04-tray.png`);

  const zoneId = 0;
  const point = await safeZonePoint(page, zoneId);
  await tap(page, point, mobile);
  await page.waitForFunction((id) => {
    const g = globalThis.__yakolakGame;
    return Object.values(g.state.board?.[id] || {}).includes(g.state.humanColor);
  }, zoneId, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const g = globalThis.__yakolakGame;
    return Object.values(g.state.board || {}).some((cell) => Object.values(cell || {}).some((color) => color && color !== g.state.humanColor));
  }, null, { timeout: 20_000 });
  await shot(page, `${outDir}/${name}-05-moves.png`);

  const wins = await page.evaluate(() => {
    const g = globalThis.__yakolakGame;
    return {
      same: g.debugWin('same-size', g.state.humanColor)?.type,
      graded: g.debugWin('graded', g.state.humanColor)?.type,
      cell: g.debugWin('cell', g.state.humanColor)?.type,
    };
  });
  assert(wins.same === 'same-size' && wins.graded === 'graded' && wins.cell === 'cell', `${name}: قواعد الفوز تغيرت`);
  await page.evaluate(() => {
    const g = globalThis.__yakolakGame;
    g.debugTriggerWin('same-size', g.state.humanColor);
  });
  await page.waitForFunction(() => Boolean(globalThis.__yakolakGame.state.winner), null, { timeout: 15_000 });
  await shot(page, `${outDir}/${name}-06-win.png`);

  const fatal = consoleErrors.filter((text) => /uncaught|prod stage1 error|syntaxerror|referenceerror|typeerror/i.test(text));
  assert(pageErrors.length === 0, `${name}: أخطاء صفحة: ${pageErrors.join(' | ')}`);
  assert(fatal.length === 0, `${name}: أخطاء كونسول: ${fatal.join(' | ')}`);

  await context.close();
  return { name, viewport, mobile, initial, round, tutorialPrompts, wins, passed: true };
}

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
