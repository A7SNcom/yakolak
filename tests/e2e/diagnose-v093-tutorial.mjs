import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const outDir = process.env.ARTIFACT_DIR || 'artifacts/tutorial-diagnostic';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-SA', reducedMotion: 'reduce' });
const page = await context.newPage();
const report = {
  ok: false,
  baseUrl,
  prompts: 0,
  transitions: [],
  pageErrors: [],
  consoleErrors: [],
  final: null,
  error: null,
};

page.on('pageerror', (error) => report.pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') report.consoleErrors.push(message.text());
});

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
  const completed = await page.evaluate((kind) => {
    const s = globalThis.__yakolakGame.state;
    return kind === 'color' ? s.setupStep === 'bots' : s.configured;
  }, type);
  if (completed) return;
  throw new Error(`setup failed ${type}:${value}`);
}

async function snapshot() {
  return page.evaluate(() => {
    const g = globalThis.__yakolakGame;
    const dialog = document.getElementById('yakolakTutorialDialog');
    return {
      tutorial: g.state.tutorial,
      started: g.state.started,
      locked: g.state.locked,
      configured: g.state.configured,
      winner: g.state.winner,
      caption: document.querySelector('.yg-caption')?.textContent || '',
      dialogOpen: Boolean(dialog?.classList.contains('open')),
      prompt: dialog?.querySelector('.yt-text')?.textContent || '',
      visiblePieces: g.pieces.filter((p) => p.mesh.visible).length,
      placedPieces: g.pieces.filter((p) => p.placed).length,
      boardEntries: Object.values(g.state.board || {}).reduce((sum, cell) => sum + Object.values(cell || {}).filter(Boolean).length, 0),
      highlightChildren: g.gameHighlightGroup?.children?.length || 0,
      setupVisible: Boolean(g.setupGroup?.visible),
      camera: {
        x: Math.round(g.camera.position.x),
        y: Math.round(g.camera.position.y),
        z: Math.round(g.camera.position.z),
      },
    };
  });
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.body.classList.contains('yakolak-ready') && globalThis.__yakolakGame?.pieces?.length === 36, null, { timeout: 120_000 });
  await choose('color', 'right');
  await choose('bots', 1);

  await page.waitForFunction(() => {
    const state = globalThis.__yakolakGame.state;
    return state.tutorial || state.started;
  }, null, { timeout: 150_000 });

  const started = Date.now();
  let lastSignature = '';
  let wasOpen = false;
  let finished = false;

  while (Date.now() - started < 120_000) {
    const state = await snapshot();
    const elapsedMs = Date.now() - started;
    const signature = JSON.stringify(state);
    if (signature !== lastSignature) {
      const event = { elapsedMs, ...state };
      report.transitions.push(event);
      console.log(`[tutorial +${elapsedMs}ms] ${signature}`);
      lastSignature = signature;
    }

    if (!state.tutorial) {
      report.final = state;
      assert(report.prompts === 3, `tutorial ended after ${report.prompts} prompts`);
      report.ok = true;
      finished = true;
      break;
    }

    if (state.dialogOpen && !wasOpen) {
      report.prompts += 1;
      report.transitions.push({ elapsedMs, action: 'click_prompt', number: report.prompts, prompt: state.prompt });
      console.log(`[tutorial] clicking prompt ${report.prompts}: ${state.prompt}`);
      await page.evaluate(() => document.querySelector('#yakolakTutorialDialog.open .yt-ok')?.click());
    }
    wasOpen = state.dialogOpen;
    if (!state.dialogOpen) wasOpen = false;
    await page.waitForTimeout(250);
  }

  if (!finished) {
    report.final = await snapshot();
    throw new Error(`tutorial diagnostic timed out after ${report.prompts} prompts`);
  }
} catch (error) {
  report.error = String(error?.stack || error);
  try {
    report.final ||= await snapshot();
    await page.screenshot({ path: `${outDir}/stuck.png`, timeout: 120_000 });
  } catch (captureError) {
    report.captureError = String(captureError?.stack || captureError);
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
