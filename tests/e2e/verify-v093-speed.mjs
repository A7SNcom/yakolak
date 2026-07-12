import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });

function assert(value, message) { if (!value) throw new Error(message); }

async function choose(page, type, value, mobile) {
  const points = await page.evaluate(({ type, value }) => {
    const g = globalThis.__yakolakGame;
    const rect = g.renderer.domElement.getBoundingClientRect();
    const out = [];
    g.setupGroup.traverse((object) => {
      const action = object?.userData?.setupAction;
      if (!action || action.type !== type || String(action.value) !== String(value)) return;
      const p = new g.THREE.Vector3(); object.getWorldPosition(p); p.project(g.camera);
      out.push({ x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 });
    });
    return out;
  }, { type, value });
  assert(points.length, `no setup points ${type}:${value}`);
  for (const point of points) {
    if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
    try {
      await page.waitForFunction((kind) => kind === 'color' ? globalThis.__yakolakGame.state.setupStep === 'bots' : globalThis.__yakolakGame.state.configured, type, { timeout: 2500 });
      return;
    } catch {}
  }
  assert(await page.evaluate((kind) => kind === 'color' ? globalThis.__yakolakGame.state.setupStep === 'bots' : globalThis.__yakolakGame.state.configured, type), `setup failed ${type}:${value}`);
}

async function scenario(name, viewport, mobile) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce', locale: 'ar-SA' });
  const page = await context.newPage();
  const pageErrors = []; page.on('pageerror', e => pageErrors.push(String(e)));
  const startedAt = Date.now();
  await page.goto(`${baseUrl}/?reducedMotion=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.body.classList.contains('yakolak-ready') && globalThis.__yakolakGame?.pieces?.length === 36, null, { timeout: 45000 });
  const readyMs = Date.now() - startedAt;
  assert(readyMs < 15000, `${name}: load too slow ${readyMs}ms`);

  await choose(page, 'color', 'right', mobile);
  await choose(page, 'bots', 1, mobile);
  await page.waitForFunction(() => globalThis.__yakolakGame.state.tutorial, null, { timeout: 30000 });
  const tutorialStart = Date.now();
  let prompts = 0;
  while (await page.evaluate(() => globalThis.__yakolakGame.state.tutorial)) {
    await page.waitForFunction(() => !globalThis.__yakolakGame.state.tutorial || document.querySelector('#yakolakTutorialDialog.open .yt-ok'), null, { timeout: 30000 });
    if (!await page.evaluate(() => globalThis.__yakolakGame.state.tutorial)) break;
    await page.evaluate(() => document.querySelector('#yakolakTutorialDialog.open .yt-ok')?.click());
    prompts++;
    assert(prompts <= 3, `${name}: too many tutorial prompts`);
    await page.waitForFunction(() => !document.querySelector('#yakolakTutorialDialog.open'), null, { timeout: 5000 });
  }
  const tutorialMs = Date.now() - tutorialStart;
  assert(prompts === 3, `${name}: prompts ${prompts}`);
  assert(tutorialMs < 30000, `${name}: tutorial too slow ${tutorialMs}ms`);
  await page.waitForFunction(() => { const s=globalThis.__yakolakGame.state; return s.started && !s.tutorial && !s.locked; }, null, { timeout: 15000 });

  const playStart = Date.now();
  const point = await page.evaluate(() => {
    const g=globalThis.__yakolakGame; const piece=g.pieces.find(p=>p.dir===g.state.humanColor && p.type==='l' && !p.placed); const v=new g.THREE.Vector3(); piece.mesh.getWorldPosition(v); v.project(g.camera); const r=g.renderer.domElement.getBoundingClientRect(); return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
  });
  if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(150);
  const zonePoint = await page.evaluate(() => {
    const g=globalThis.__yakolakGame; const z=g.boardZones[0]; const v=new g.THREE.Vector3(z.px-18,z.py,z.pz-18); g.gameGroup.localToWorld(v); v.project(g.camera); const r=g.renderer.domElement.getBoundingClientRect(); return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
  });
  if (mobile) await page.touchscreen.tap(zonePoint.x, zonePoint.y); else await page.mouse.click(zonePoint.x, zonePoint.y);
  await page.waitForFunction(() => Object.values(globalThis.__yakolakGame.state.board?.[0]||{}).includes(globalThis.__yakolakGame.state.humanColor), null, { timeout: 5000 });
  const moveMs = Date.now() - playStart;
  assert(moveMs < 5000, `${name}: move too slow ${moveMs}ms`);
  assert(pageErrors.length === 0, `${name}: page errors ${pageErrors.join(' | ')}`);
  await context.close();
  return { name, readyMs, tutorialMs, moveMs, prompts, passed: true };
}

try {
  const results = [];
  results.push(await scenario('desktop', { width: 1440, height: 900 }, false));
  results.push(await scenario('mobile', { width: 390, height: 844 }, true));
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally { await browser.close(); }
