import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-SA' });
const page = await context.newPage();

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function choose(type, value) {
  const points = await page.evaluate(({ type, value }) => {
    const g = globalThis.__yakolakGame;
    const rect = g.renderer.domElement.getBoundingClientRect();
    const out = [];
    g.setupGroup.traverse((object) => {
      const action = object?.userData?.setupAction;
      if (!action || action.type !== type || String(action.value) !== String(value)) return;
      const p = new g.THREE.Vector3();
      object.getWorldPosition(p);
      p.project(g.camera);
      out.push({ x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 });
    });
    return out;
  }, { type, value });
  assert(points.length, `no points for ${type}:${value}`);
  for (const point of points) {
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(300);
    const done = await page.evaluate((kind) => {
      const s = globalThis.__yakolakGame.state;
      return kind === 'color' ? s.setupStep === 'bots' : s.configured;
    }, type);
    if (done) return;
  }
  throw new Error(`setup failed ${type}:${value}`);
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.body.classList.contains('yakolak-ready') && globalThis.__yakolakGame?.pieces?.length === 36, null, { timeout: 120_000 });
  await choose('color', 'right');
  await choose('bots', 1);

  const started = Date.now();
  let prompts = 0;
  let lastSignature = '';
  let wasOpen = false;
  while (Date.now() - started < 120_000) {
    const snapshot = await page.evaluate(() => {
      const g = globalThis.__yakolakGame;
      const dialog = document.getElementById('yakolakTutorialDialog');
      return {
        tutorial: g.state.tutorial,
        started: g.state.started,
        locked: g.state.locked,
        winner: g.state.winner,
        caption: document.querySelector('.yg-caption')?.textContent || '',
        dialogOpen: Boolean(dialog?.classList.contains('open')),
        prompt: dialog?.querySelector('.yt-text')?.textContent || '',
        visiblePieces: g.pieces.filter((p) => p.mesh.visible).length,
        placedPieces: g.pieces.filter((p) => p.placed).length,
      };
    });
    const signature = JSON.stringify(snapshot);
    if (signature !== lastSignature) {
      console.log(`[tutorial +${Date.now() - started}ms] ${signature}`);
      lastSignature = signature;
    }
    if (!snapshot.tutorial) {
      assert(prompts === 3, `tutorial ended after ${prompts} prompts`);
      console.log(JSON.stringify({ ok: true, prompts, durationMs: Date.now() - started, final: snapshot }, null, 2));
      process.exitCode = 0;
      break;
    }
    if (snapshot.dialogOpen && !wasOpen) {
      prompts += 1;
      console.log(`[tutorial] clicking prompt ${prompts}: ${snapshot.prompt}`);
      await page.evaluate(() => document.querySelector('#yakolakTutorialDialog.open .yt-ok')?.click());
    }
    wasOpen = snapshot.dialogOpen;
    if (!snapshot.dialogOpen) wasOpen = false;
    await page.waitForTimeout(250);
  }
  const state = await page.evaluate(() => ({
    state: { ...globalThis.__yakolakGame.state },
    caption: document.querySelector('.yg-caption')?.textContent || '',
    dialogOpen: Boolean(document.getElementById('yakolakTutorialDialog')?.classList.contains('open')),
  }));
  if (state.state.tutorial) throw new Error(`tutorial diagnostic timed out: ${JSON.stringify(state)}`);
} finally {
  await context.close();
  await browser.close();
}
