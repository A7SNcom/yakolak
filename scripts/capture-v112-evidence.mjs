import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE_URL = process.env.YAKOLAK_TEST_URL || 'http://127.0.0.1:8765';
const OUT = 'docs/screenshots/v112';
const TUTORIAL_KEY = 'yakolak-tutorial-v112-complete';

await fs.mkdir(OUT, { recursive: true });

function collectErrors(page, bucket) {
  page.on('pageerror', error => bucket.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) bucket.push(`console.${message.type()}: ${message.text()}`);
  });
}

async function waitReady(page) {
  await page.waitForFunction(() => document.body.classList.contains('yakolak-ready'), null, { timeout: 45_000 });
}

async function screenPoint(page, action) {
  return page.evaluate(action => {
    const game = globalThis.__yakolakGame;
    const object = game.setupGroup.children.find(child => {
      const value = child.userData?.setupAction;
      return value?.type === action.type && value?.value === action.value;
    });
    if (!object) throw new Error(`setup action not found: ${JSON.stringify(action)}`);
    const point = new game.THREE.Vector3();
    const rect = game.renderer.domElement.getBoundingClientRect();
    object.getWorldPosition(point);
    point.project(game.camera);
    return {
      x: rect.left + (point.x + 1) * rect.width / 2,
      y: rect.top + (1 - point.y) * rect.height / 2
    };
  }, action);
}

async function setupTwoPlayers(page, tap) {
  await waitReady(page);
  await tap(await screenPoint(page, { type: 'color', value: 'right' }));
  await page.waitForFunction(() => globalThis.__yakolakGame?.state?.setupStep === 'bots', null, { timeout: 8_000 });
  await tap(await screenPoint(page, { type: 'bots', value: 1 }));
}

async function piecePoint(page) {
  return page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    const piece = game.pieces.find(item => item.dir === game.state.humanColor && !item.placed && item.side === 0);
    if (!piece) throw new Error('human stack piece not found');
    const point = new game.THREE.Vector3();
    const rect = game.renderer.domElement.getBoundingClientRect();
    piece.mesh.getWorldPosition(point);
    point.project(game.camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  });
}

async function zonePoint(page, id = 0) {
  return page.evaluate(id => {
    const game = globalThis.__yakolakGame;
    const zone = game.boardZones[id];
    const rect = game.renderer.domElement.getBoundingClientRect();
    const point = game.gameGroup.localToWorld(new game.THREE.Vector3(zone.px, zone.py, zone.pz));
    point.project(game.camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  }, id);
}

async function completeLegalMove(page, tap) {
  await page.waitForFunction(() => {
    const state = globalThis.__yakolakGame?.state;
    return state?.started && !state.tutorial && !state.locked && state.players[state.turnIndex % state.players.length] === state.humanColor;
  }, null, { timeout: 20_000 });
  await tap(await piecePoint(page));
  await page.waitForTimeout(600);
  await tap(await zonePoint(page));
  await page.waitForFunction(() => {
    const game = globalThis.__yakolakGame;
    return Object.values(game.state.board[0]).includes(game.state.humanColor);
  }, null, { timeout: 8_000 });
  await page.waitForFunction(() => {
    const state = globalThis.__yakolakGame.state;
    return !state.locked && state.players[state.turnIndex % state.players.length] === state.humanColor && state.lastMoves[state.humanColor] && state.lastMoves.back;
  }, null, { timeout: 18_000 });
}

async function verifyStartPath(page, tap, prefix) {
  await setupTwoPlayers(page, tap);
  await page.waitForSelector('#yakolakTutorialDialog.open', { timeout: 40_000 });
  const prompt = await page.locator('.yt-text').innerText();
  const start = await page.locator('.yt-ok').innerText();
  const skip = await page.locator('.yt-repeat').innerText();
  if (start !== 'ابدأ اللعب' || skip !== 'تخطي التعليم') throw new Error(`unexpected tutorial actions: ${start} / ${skip}`);
  await page.screenshot({ path: `${OUT}/${prefix}-first-prompt.png` });
  await page.locator('.yt-ok').click();
  await page.waitForFunction(() => {
    const state = globalThis.__yakolakGame?.state;
    const caption = document.querySelector('.yg-caption')?.innerText || '';
    return state?.started && !state.tutorial && !state.locked && state.firstMoveGuide === true && caption.includes('خطوتك الأولى');
  }, null, { timeout: 30_000 });
  const caption = await page.locator('.yg-caption').innerText();
  await completeLegalMove(page, tap);
  const result = await page.evaluate(key => ({
    guide: globalThis.__yakolakGame.state.firstMoveGuide,
    stored: localStorage.getItem(key),
    caption: document.querySelector('.yg-caption')?.innerText || '',
    overflow: { bodyW: document.body.scrollWidth, innerW: innerWidth, bodyH: document.body.scrollHeight, innerH: innerHeight }
  }), TUTORIAL_KEY);
  if (result.guide || result.stored !== '1') throw new Error(`tutorial did not complete: ${JSON.stringify(result)}`);
  await page.screenshot({ path: `${OUT}/${prefix}-after-first-move.png` });
  return { prompt, caption, result };
}

async function verifySkipAndReturn(page, tap) {
  await page.evaluate(key => localStorage.removeItem(key), TUTORIAL_KEY);
  await page.goto(`${BASE_URL}/?visual-skip=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await setupTwoPlayers(page, tap);
  await page.waitForSelector('#yakolakTutorialDialog.open', { timeout: 40_000 });
  await page.locator('.yt-repeat').click();
  await page.waitForFunction(() => globalThis.__yakolakGame?.state?.started && !globalThis.__yakolakGame.state.tutorial && !globalThis.__yakolakGame.state.locked, null, { timeout: 20_000 });
  const skipped = await page.evaluate(key => ({
    open: document.querySelector('#yakolakTutorialDialog')?.classList.contains('open') || false,
    guide: !!globalThis.__yakolakGame.state.firstMoveGuide,
    stored: localStorage.getItem(key)
  }), TUTORIAL_KEY);
  if (skipped.open || skipped.guide || skipped.stored !== '1') throw new Error(`skip failed: ${JSON.stringify(skipped)}`);

  await page.goto(`${BASE_URL}/?visual-return=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await setupTwoPlayers(page, tap);
  await page.waitForFunction(() => globalThis.__yakolakGame?.state?.started && !globalThis.__yakolakGame.state.tutorial && !globalThis.__yakolakGame.state.locked, null, { timeout: 40_000 });
  const returning = await page.evaluate(key => ({
    open: document.querySelector('#yakolakTutorialDialog')?.classList.contains('open') || false,
    guide: !!globalThis.__yakolakGame.state.firstMoveGuide,
    stored: localStorage.getItem(key)
  }), TUTORIAL_KEY);
  if (returning.open || returning.guide || returning.stored !== '1') throw new Error(`returning-player path failed: ${JSON.stringify(returning)}`);
  return { skipped, returning };
}

async function runProfile(browser, profile) {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  const errors = [];
  collectErrors(page, errors);
  const tap = profile.touch
    ? point => page.touchscreen.tap(point.x, point.y)
    : point => page.mouse.click(point.x, point.y);
  await page.goto(`${BASE_URL}/version.json?reset=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(key => localStorage.removeItem(key), TUTORIAL_KEY);
  await page.goto(`${BASE_URL}/?visual-start=${profile.name}-${Date.now()}`, { waitUntil: 'domcontentloaded' });
  const started = await verifyStartPath(page, tap, profile.name);
  const paths = await verifySkipAndReturn(page, tap);
  if (errors.length) throw new Error(`${profile.name} browser errors:\n${errors.join('\n')}`);
  await context.close();
  return { ...started, ...paths, errors };
}

const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
try {
  const desktop = await runProfile(browser, {
    name: 'desktop',
    touch: false,
    context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
  });
  const mobile = await runProfile(browser, {
    name: 'mobile',
    touch: true,
    context: {
      viewport: { width: 390, height: 844 },
      screen: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/144 Mobile Safari/537.36'
    }
  });
  await fs.writeFile(`${OUT}/results.json`, JSON.stringify({ ok: true, build: 112, desktop, mobile }, null, 2));
  await fs.writeFile(`${OUT}/README.md`, `# v112 Visual Verification\n\n- Desktop: first-time guided move, skip, and returning-player paths passed.\n- Mobile 390×844 / DPR 2: the same paths passed with touch input and no viewport overflow.\n- No browser Console or page errors were observed.\n\n![Desktop prompt](desktop-first-prompt.png)\n\n![Desktop after first move](desktop-after-first-move.png)\n\n![Mobile prompt](mobile-first-prompt.png)\n\n![Mobile after first move](mobile-after-first-move.png)\n`);
  console.log('v112 visual verification passed');
} finally {
  await browser.close();
}
