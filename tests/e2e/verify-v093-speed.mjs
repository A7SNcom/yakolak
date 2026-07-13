import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const outDir = process.env.ARTIFACT_DIR || 'artifacts/v093-speed';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = { ok: false, results: [] };

function assert(value, message) { if (!value) throw new Error(message); }
async function tap(page, point, mobile) { if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y); }

async function choose(page, type, value, mobile) {
  const points = await page.evaluate(({ type, value }) => {
    const g = globalThis.__yakolakGame; const rect = g.renderer.domElement.getBoundingClientRect(); const out = [];
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
    await tap(page, point, mobile);
    try {
      await page.waitForFunction((kind) => kind === 'color' ? globalThis.__yakolakGame.state.setupStep === 'bots' : globalThis.__yakolakGame.state.configured, type, { timeout: 2500, polling: 100 });
      return;
    } catch {}
  }
  assert(await page.evaluate((kind) => kind === 'color' ? globalThis.__yakolakGame.state.setupStep === 'bots' : globalThis.__yakolakGame.state.configured, type), `setup failed ${type}:${value}`);
}

async function scenario(name, viewport, mobile) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce', locale: 'ar-SA' });
  const page = await context.newPage();
  const pageErrors = []; const consoleErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const startedAt = Date.now();
  await page.goto(`${baseUrl}/?reducedMotion=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.body.classList.contains('yakolak-ready') && globalThis.__yakolakGame?.pieces?.length === 36, null, { timeout: 45000, polling: 100 });
  const readyMs = Date.now() - startedAt;
  assert(readyMs < 15000, `${name}: load too slow ${readyMs}ms`);
  await page.screenshot({ path: `${outDir}/${name}-loaded.png`, timeout: 30000 });

  await choose(page, 'color', 'right', mobile);
  await choose(page, 'bots', 1, mobile);
  await page.waitForFunction(() => globalThis.__yakolakGame.state.tutorial, null, { timeout: 30000, polling: 100 });
  const tutorialStart = Date.now();
  let prompts = 0;
  while (await page.evaluate(() => globalThis.__yakolakGame.state.tutorial)) {
    await page.waitForFunction(() => !globalThis.__yakolakGame.state.tutorial || document.querySelector('#yakolakTutorialDialog.open .yt-ok'), null, { timeout: 30000, polling: 100 });
    if (!await page.evaluate(() => globalThis.__yakolakGame.state.tutorial)) break;
    const previousPrompt = await page.evaluate(() => document.querySelector('#yakolakTutorialDialog.open .yt-text')?.textContent || '');
    await page.evaluate(() => document.querySelector('#yakolakTutorialDialog.open .yt-ok')?.click());
    prompts += 1;
    assert(prompts <= 3, `${name}: too many tutorial prompts`);
    await page.waitForFunction((before) => {
      const g = globalThis.__yakolakGame;
      const text = document.querySelector('#yakolakTutorialDialog.open .yt-text')?.textContent || '';
      return !g.state.tutorial || (text && text !== before);
    }, previousPrompt, { timeout: 30000, polling: 100 });
  }
  const tutorialMs = Date.now() - tutorialStart;
  assert(prompts === 3, `${name}: prompts ${prompts}`);
  assert(tutorialMs < 30000, `${name}: tutorial too slow ${tutorialMs}ms`);
  await page.waitForFunction(() => { const s=globalThis.__yakolakGame.state; return s.started && !s.tutorial && !s.locked; }, null, { timeout: 15000, polling: 100 });

  const playStart = Date.now();
  const piecePoint = await page.evaluate(() => {
    const g=globalThis.__yakolakGame; const piece=g.pieces.find(p=>p.dir===g.state.humanColor && p.type==='l' && !p.placed); const v=new g.THREE.Vector3(); piece.mesh.getWorldPosition(v); v.project(g.camera); const r=g.renderer.domElement.getBoundingClientRect(); return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
  });
  await tap(page, piecePoint, mobile);
  await page.waitForTimeout(120);
  const zonePoint = await page.evaluate(() => {
    const g=globalThis.__yakolakGame; const z=g.boardZones[0]; const v=new g.THREE.Vector3(z.px-18,z.py,z.pz-18); g.gameGroup.localToWorld(v); v.project(g.camera); const r=g.renderer.domElement.getBoundingClientRect(); return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
  });
  await tap(page, zonePoint, mobile);
  await page.waitForFunction(() => Object.values(globalThis.__yakolakGame.state.board?.[0]||{}).includes(globalThis.__yakolakGame.state.humanColor), null, { timeout: 5000, polling: 100 });
  const humanMoveMs = Date.now() - playStart;
  assert(humanMoveMs < 5000, `${name}: human move too slow ${humanMoveMs}ms`);

  const botStart = Date.now();
  await page.waitForFunction(() => {
    const g=globalThis.__yakolakGame;
    return Object.values(g.state.board||{}).some(cell => Object.values(cell||{}).some(color => color && color !== g.state.humanColor));
  }, null, { timeout: 5000, polling: 100 });
  const botReplyMs = Date.now() - botStart;
  assert(botReplyMs < 5000, `${name}: bot reply too slow ${botReplyMs}ms`);

  const wins = await page.evaluate(() => {
    const g=globalThis.__yakolakGame;
    return { same:g.debugWin('same-size',g.state.humanColor)?.type, graded:g.debugWin('graded',g.state.humanColor)?.type, cell:g.debugWin('cell',g.state.humanColor)?.type };
  });
  assert(wins.same==='same-size' && wins.graded==='graded' && wins.cell==='cell', `${name}: win rules changed`);
  await page.evaluate(() => globalThis.__yakolakGame.debugTriggerWin('same-size',globalThis.__yakolakGame.state.humanColor));
  await page.waitForFunction(() => Boolean(globalThis.__yakolakGame.state.winner), null, { timeout: 5000, polling: 100 });
  await page.screenshot({ path: `${outDir}/${name}-win.png`, timeout: 30000 });

  const fatal = consoleErrors.filter(t => /uncaught|syntaxerror|referenceerror|typeerror|prod stage1 error/i.test(t));
  assert(pageErrors.length===0, `${name}: page errors ${pageErrors.join(' | ')}`);
  assert(fatal.length===0, `${name}: console errors ${fatal.join(' | ')}`);
  await context.close();
  return { name, readyMs, tutorialMs, humanMoveMs, botReplyMs, prompts, wins, passed:true };
}

try {
  report.results.push(await scenario('desktop-1440x900',{width:1440,height:900},false));
  report.results.push(await scenario('mobile-390x844',{width:390,height:844},true));
  report.ok=true;
  console.log(JSON.stringify(report,null,2));
} catch (error) {
  report.error=String(error?.stack||error); console.error(error); process.exitCode=1;
} finally {
  await fs.writeFile(`${outDir}/results.json`,JSON.stringify(report,null,2));
  await browser.close();
}
