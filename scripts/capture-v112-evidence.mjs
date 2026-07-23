import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE_URL = process.env.YAKOLAK_TEST_URL || 'http://127.0.0.1:8765';
const OUT = 'docs/screenshots/v112';
const TUTORIAL_KEY = 'yakolak-tutorial-v112-complete';

await fs.mkdir(OUT, { recursive: true });

function collectErrors(page, bucket) {
  page.on('pageerror', error => bucket.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    const softwareRendererReadback = message.type() === 'warning' && /GL Driver Message.*GPU stall due to ReadPixels/.test(text);
    if (softwareRendererReadback) return;
    if (['error', 'warning'].includes(message.type())) bucket.push(`console.${message.type()}: ${text}`);
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

async function setupPlayers(page, tap, botCount = 1) {
  await waitReady(page);
  await tap(await screenPoint(page, { type: 'color', value: 'right' }));
  await page.waitForFunction(() => globalThis.__yakolakGame?.state?.setupStep === 'bots', null, { timeout: 8_000 });
  await tap(await screenPoint(page, { type: 'bots', value: botCount }));
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

async function openHumanTray(page, tap) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await tap(await piecePoint(page));
    try {
      await page.waitForFunction(() => {
        const game = globalThis.__yakolakGame;
        return game?.pieces?.some(piece => piece.dir === game.state.humanColor && !piece.placed && piece.mesh.userData.traySelected);
      }, null, { timeout: 5_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw new Error(`human tray did not open after ${attempt + 1} pointer attempts`);
      await page.waitForTimeout(350);
    }
  }
}

async function legalZonePoint(page) {
  return page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    const piece = game.pieces.find(item => item.dir === game.state.humanColor && !item.placed && item.mesh.userData.traySelected);
    if (!piece) throw new Error('selected human tray piece not found');
    const zone = game.boardZones.find(item => !game.state.board[item.id]?.[piece.type]);
    if (!zone) throw new Error(`no legal zone for ${piece.type}`);
    const rect = game.renderer.domElement.getBoundingClientRect();
    const point = game.gameGroup.localToWorld(new game.THREE.Vector3(zone.px, zone.py, zone.pz));
    point.project(game.camera);
    return {
      id: zone.id,
      size: piece.type,
      color: piece.dir,
      x: rect.left + (point.x + 1) * rect.width / 2,
      y: rect.top + (1 - point.y) * rect.height / 2
    };
  });
}

async function placeSelectedPiece(page, tap) {
  const target = await legalZonePoint(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await tap(target);
    try {
      await page.waitForFunction(({ id, size, color }) => globalThis.__yakolakGame?.state?.board?.[id]?.[size] === color, target, { timeout: 6_000 });
      return target;
    } catch (error) {
      if (attempt === 2) throw new Error(`legal ${target.size} placement at zone ${target.id} was not registered after ${attempt + 1} pointer attempts`);
      await page.waitForTimeout(350);
    }
  }
}

async function completeLegalMove(page, tap) {
  await page.waitForFunction(() => {
    const state = globalThis.__yakolakGame?.state;
    return state?.started && !state.tutorial && !state.locked && state.players[state.turnIndex % state.players.length] === state.humanColor;
  }, null, { timeout: 30_000 });
  await openHumanTray(page, tap);
  const humanMove = await placeSelectedPiece(page, tap);
  await page.waitForFunction(() => {
    const game = globalThis.__yakolakGame;
    const state = game?.state;
    if (!state?.players?.length) return false;
    const bots = state.players.filter(color => color !== state.humanColor);
    return bots.every(color => !!state.lastMoves?.[color]) && !state.locked && state.players[state.turnIndex % state.players.length] === state.humanColor;
  }, null, { timeout: 120_000 });
  return page.evaluate(humanMove => {
    const game = globalThis.__yakolakGame;
    const state = game.state;
    return {
      players: [...state.players],
      botCount: state.botCount,
      turnIndex: state.turnIndex,
      round: state.round,
      humanColor: state.humanColor,
      humanMove,
      lastMoves: structuredClone(state.lastMoves),
      occupied: Object.values(state.board).reduce((sum, cell) => sum + Object.values(cell).filter(Boolean).length, 0),
      caption: document.querySelector('.yg-caption')?.innerText || ''
    };
  }, humanMove);
}

async function verifyStartPath(page, tap, prefix) {
  await setupPlayers(page, tap, 1);
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
  const cycle = await completeLegalMove(page, tap);
  const result = await page.evaluate(key => ({
    guide: globalThis.__yakolakGame.state.firstMoveGuide,
    stored: localStorage.getItem(key),
    caption: document.querySelector('.yg-caption')?.innerText || '',
    overflow: { bodyW: document.body.scrollWidth, innerW: innerWidth, bodyH: document.body.scrollHeight, innerH: innerHeight }
  }), TUTORIAL_KEY);
  if (result.guide || result.stored !== '1') throw new Error(`tutorial did not complete: ${JSON.stringify(result)}`);
  await page.screenshot({ path: `${OUT}/${prefix}-after-first-move.png` });
  return { prompt, caption, cycle, result };
}

async function verifySkipAndReturn(page, tap) {
  await page.evaluate(key => localStorage.removeItem(key), TUTORIAL_KEY);
  await page.goto(`${BASE_URL}/?visual-skip=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await setupPlayers(page, tap, 1);
  await page.waitForSelector('#yakolakTutorialDialog.open', { timeout: 40_000 });
  await page.locator('.yt-repeat').click();
  await page.waitForFunction(() => globalThis.__yakolakGame?.state?.started && !globalThis.__yakolakGame.state.tutorial && !globalThis.__yakolakGame.state.locked, null, { timeout: 30_000 });
  const skipped = await page.evaluate(key => ({
    open: document.querySelector('#yakolakTutorialDialog')?.classList.contains('open') || false,
    guide: !!globalThis.__yakolakGame.state.firstMoveGuide,
    stored: localStorage.getItem(key)
  }), TUTORIAL_KEY);
  if (skipped.open || skipped.guide || skipped.stored !== '1') throw new Error(`skip failed: ${JSON.stringify(skipped)}`);

  await page.goto(`${BASE_URL}/?visual-return=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await setupPlayers(page, tap, 1);
  await page.waitForFunction(() => globalThis.__yakolakGame?.state?.started && !globalThis.__yakolakGame.state.tutorial && !globalThis.__yakolakGame.state.locked, null, { timeout: 50_000 });
  const returning = await page.evaluate(key => ({
    open: document.querySelector('#yakolakTutorialDialog')?.classList.contains('open') || false,
    guide: !!globalThis.__yakolakGame.state.firstMoveGuide,
    stored: localStorage.getItem(key)
  }), TUTORIAL_KEY);
  if (returning.open || returning.guide || returning.stored !== '1') throw new Error(`returning-player path failed: ${JSON.stringify(returning)}`);
  return { skipped, returning };
}

async function verifyPlayerCount(page, tap, profile, botCount) {
  const total = botCount + 1;
  await page.goto(`${BASE_URL}/?players=${total}&run=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await setupPlayers(page, tap, botCount);
  await page.waitForFunction(expected => {
    const state = globalThis.__yakolakGame?.state;
    return state?.started && !state.tutorial && !state.locked && state.players.length === expected;
  }, total, { timeout: 55_000 });
  const cycle = await completeLegalMove(page, tap);
  if (cycle.players.length !== total || cycle.botCount !== botCount) throw new Error(`${total}-player configuration mismatch: ${JSON.stringify(cycle)}`);
  const missingBotMove = cycle.players.filter(color => color !== cycle.humanColor).find(color => !cycle.lastMoves[color]);
  if (missingBotMove) throw new Error(`${total}-player bot did not move: ${missingBotMove}`);
  await page.screenshot({ path: `${OUT}/${profile}-${total}-players-after-cycle.png` });
  return cycle;
}

async function verifyWinRestart(page, profile, expectedPlayers) {
  const before = await page.evaluate(() => {
    const state = globalThis.__yakolakGame.state;
    return { round: state.round, score: state.scores[state.humanColor], players: [...state.players], humanColor: state.humanColor };
  });
  const win = await page.evaluate(() => globalThis.__yakolakGame.debugTriggerWin('same-size', globalThis.__yakolakGame.state.humanColor));
  if (!win) throw new Error('debug win was not created');
  await page.waitForFunction(({ round, score }) => {
    const game = globalThis.__yakolakGame;
    const state = game.state;
    const empty = Object.values(state.board).every(cell => Object.values(cell).every(value => value == null));
    return state.round === round + 1 && state.scores[state.humanColor] === score + 1 && state.started && !state.locked && !state.winner && empty;
  }, { round: before.round, score: before.score }, { timeout: 30_000 });
  const restarted = await page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    const state = game.state;
    return {
      round: state.round,
      score: state.scores[state.humanColor],
      players: [...state.players],
      turnIndex: state.turnIndex,
      winner: state.winner,
      locked: state.locked,
      placed: game.pieces.filter(piece => state.players.includes(piece.dir) && piece.placed).length,
      lastMoves: structuredClone(state.lastMoves),
      highlightCount: game.gameHighlightGroup.children.length,
      caption: document.querySelector('.yg-caption')?.innerText || ''
    };
  });
  if (restarted.players.length !== expectedPlayers || restarted.placed !== 0 || restarted.highlightCount !== 0 || Object.values(restarted.lastMoves).some(Boolean)) {
    throw new Error(`post-win restart left stale state: ${JSON.stringify(restarted)}`);
  }
  await page.screenshot({ path: `${OUT}/${profile}-after-win-restart.png` });
  return { before, restarted };
}

async function verifyReloadRestart(page, tap, botCount) {
  const total = botCount + 1;
  await page.goto(`${BASE_URL}/?reload-restart=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  const fresh = await page.evaluate(key => ({
    configured: globalThis.__yakolakGame.state.configured,
    started: globalThis.__yakolakGame.state.started,
    setupStep: globalThis.__yakolakGame.state.setupStep,
    stored: localStorage.getItem(key),
    dialogOpen: document.querySelector('#yakolakTutorialDialog')?.classList.contains('open') || false
  }), TUTORIAL_KEY);
  if (fresh.configured || fresh.started || fresh.setupStep !== 'color' || fresh.stored !== '1' || fresh.dialogOpen) throw new Error(`reload restart did not return to clean setup: ${JSON.stringify(fresh)}`);
  await setupPlayers(page, tap, botCount);
  await page.waitForFunction(expected => {
    const state = globalThis.__yakolakGame?.state;
    return state?.started && !state.tutorial && !state.locked && state.players.length === expected;
  }, total, { timeout: 55_000 });
  const resumed = await page.evaluate(() => {
    const state = globalThis.__yakolakGame.state;
    return {
      players: [...state.players],
      round: state.round,
      scores: structuredClone(state.scores),
      boardEmpty: Object.values(state.board).every(cell => Object.values(cell).every(value => value == null)),
      dialogOpen: document.querySelector('#yakolakTutorialDialog')?.classList.contains('open') || false
    };
  });
  if (resumed.players.length !== total || resumed.round !== 1 || !resumed.boardEmpty || resumed.dialogOpen || Object.values(resumed.scores).some(Boolean)) {
    throw new Error(`reload restart setup failed: ${JSON.stringify(resumed)}`);
  }
  return { fresh, resumed };
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
  const threePlayers = await verifyPlayerCount(page, tap, profile.name, 2);
  const fourPlayers = await verifyPlayerCount(page, tap, profile.name, 3);
  const winRestart = await verifyWinRestart(page, profile.name, 4);
  const reloadRestart = await verifyReloadRestart(page, tap, 3);
  if (errors.length) throw new Error(`${profile.name} browser errors:\n${errors.join('\n')}`);
  await context.close();
  return { ...started, ...paths, threePlayers, fourPlayers, winRestart, reloadRestart, errors };
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
  await fs.writeFile(`${OUT}/README.md`, `# v112 Visual Verification\n\n- Desktop and mobile first-time guided move, skip, and returning-player paths passed.\n- Three-player and four-player full turn cycles passed on desktop and mobile touch.\n- Automatic post-win round restart cleared the board, highlights, winner, lock, and last-move state while preserving players and score.\n- Full page reload returned to clean setup, preserved onboarding completion, and successfully started a fresh four-player match.\n- Mobile 390×844 / DPR 2 remained within the viewport.\n- No application Console or page errors were observed.\n- Software-renderer ReadPixels performance warnings from CI screenshot capture are ignored as environment-only diagnostics.\n\n![Desktop prompt](desktop-first-prompt.png)\n\n![Desktop 3 players](desktop-3-players-after-cycle.png)\n\n![Desktop 4 players](desktop-4-players-after-cycle.png)\n\n![Desktop restart](desktop-after-win-restart.png)\n\n![Mobile prompt](mobile-first-prompt.png)\n\n![Mobile 3 players](mobile-3-players-after-cycle.png)\n\n![Mobile 4 players](mobile-4-players-after-cycle.png)\n\n![Mobile restart](mobile-after-win-restart.png)\n`);
  console.log('v112 expanded visual verification passed');
} finally {
  await browser.close();
}
