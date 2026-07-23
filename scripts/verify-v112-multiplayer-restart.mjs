import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE_URL = process.env.YAKOLAK_TEST_URL || 'http://127.0.0.1:8765';
const PROFILE = process.env.YAKOLAK_PROFILE || 'desktop';
const SCENARIO = process.env.YAKOLAK_SCENARIO || '3players';
const OUT = 'docs/screenshots/v112';
const TUTORIAL_KEY = 'yakolak-tutorial-v112-complete';
await fs.mkdir(OUT, { recursive: true });

const mobile = PROFILE === 'mobile';
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext(mobile ? {
  viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 },
  deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/144 Mobile Safari/537.36'
} : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', message => {
  const text = message.text();
  if (message.type() === 'warning' && /GL Driver Message.*GPU stall due to ReadPixels/.test(text)) return;
  if (['error', 'warning'].includes(message.type())) browserErrors.push(`console.${message.type()}: ${text}`);
});
const tap = mobile ? point => page.touchscreen.tap(point.x, point.y) : point => page.mouse.click(point.x, point.y);

async function waitReady() {
  await page.waitForFunction(() => document.body.classList.contains('yakolak-ready'), null, { timeout: 45_000 });
}

async function screenPoint(action) {
  return page.evaluate(action => {
    const game = globalThis.__yakolakGame;
    const object = game.setupGroup.children.find(child => {
      const value = child.userData?.setupAction;
      return value?.type === action.type && value?.value === action.value;
    });
    if (!object) throw new Error(`setup action not found: ${JSON.stringify(action)}`);
    const point = new game.THREE.Vector3();
    const rect = game.renderer.domElement.getBoundingClientRect();
    object.getWorldPosition(point); point.project(game.camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  }, action);
}

async function clickSetup(action, predicate, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await tap(await screenPoint(action));
    try {
      await page.waitForFunction(predicate, null, { timeout: 6_000 });
      return;
    } catch {
      if (attempt === 3) throw new Error(`${label} failed after four attempts`);
      await page.waitForTimeout(350);
    }
  }
}

async function setupMatch(botCount) {
  const total = botCount + 1;
  await waitReady();
  await clickSetup({ type: 'color', value: 'right' }, () => globalThis.__yakolakGame?.state?.setupStep === 'bots', 'color selection');
  await clickSetup({ type: 'bots', value: botCount }, () => globalThis.__yakolakGame?.state?.configured === true, `${total}-player selection`);
  await page.waitForFunction(expected => {
    const state = globalThis.__yakolakGame?.state;
    return state?.started && !state.tutorial && !state.locked && state.players.length === expected && state.players[state.turnIndex] === state.humanColor;
  }, total, { timeout: 60_000 });
}

async function openTray() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const point = await page.evaluate(() => {
      const game = globalThis.__yakolakGame;
      const piece = game.pieces.find(item => item.dir === game.state.humanColor && !item.placed && item.side === 0);
      if (!piece) throw new Error('human stack piece not found');
      const vector = new game.THREE.Vector3();
      const rect = game.renderer.domElement.getBoundingClientRect();
      piece.mesh.getWorldPosition(vector); vector.project(game.camera);
      return { x: rect.left + (vector.x + 1) * rect.width / 2, y: rect.top + (1 - vector.y) * rect.height / 2 };
    });
    await tap(point);
    try {
      await page.waitForFunction(() => globalThis.__yakolakGame?.pieces?.some(piece => piece.mesh.userData.traySelected), null, { timeout: 6_000 });
      return;
    } catch {
      if (attempt === 3) throw new Error('human tray did not open');
      await page.waitForTimeout(350);
    }
  }
}

async function placeLegalPiece() {
  const target = await page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    const piece = game.pieces.find(item => item.mesh.userData.traySelected);
    if (!piece) throw new Error('selected human piece not found');
    const zone = game.boardZones.find(item => !game.state.board[item.id]?.[piece.type]);
    if (!zone) throw new Error(`no legal zone for ${piece.type}`);
    const vector = game.gameGroup.localToWorld(new game.THREE.Vector3(zone.px, zone.py, zone.pz));
    const rect = game.renderer.domElement.getBoundingClientRect();
    vector.project(game.camera);
    return { id: zone.id, size: piece.type, color: piece.dir, x: rect.left + (vector.x + 1) * rect.width / 2, y: rect.top + (1 - vector.y) * rect.height / 2 };
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    await tap(target);
    try {
      await page.waitForFunction(move => globalThis.__yakolakGame?.state?.board?.[move.id]?.[move.size] === move.color, target, { timeout: 6_000 });
      return target;
    } catch {
      if (attempt === 3) throw new Error(`legal move was not registered: ${JSON.stringify(target)}`);
      await page.waitForTimeout(350);
    }
  }
}

async function completeTurnCycle(total) {
  await openTray();
  const humanMove = await placeLegalPiece();
  await page.waitForFunction(() => {
    const game = globalThis.__yakolakGame;
    const state = game?.state;
    if (!state?.players?.length) return false;
    const bots = state.players.filter(color => color !== state.humanColor);
    return bots.every(color => !!state.lastMoves?.[color]) && state.players[state.turnIndex] === state.humanColor && !state.locked;
  }, null, { timeout: 180_000 });
  const cycle = await page.evaluate(humanMove => {
    const game = globalThis.__yakolakGame;
    const state = game.state;
    return {
      humanMove, players: [...state.players], botCount: state.botCount, turnIndex: state.turnIndex,
      current: state.players[state.turnIndex], round: state.round, locked: state.locked, winner: state.winner,
      lastMoves: structuredClone(state.lastMoves),
      occupied: Object.values(state.board).reduce((sum, cell) => sum + Object.values(cell).filter(Boolean).length, 0),
      caption: document.querySelector('.yg-caption')?.innerText || '',
      overflow: { bodyW: document.body.scrollWidth, innerW: globalThis.innerWidth, bodyH: document.body.scrollHeight, innerH: globalThis.innerHeight }
    };
  }, humanMove);
  if (cycle.players.length !== total || cycle.botCount !== total - 1 || cycle.current !== 'right' || cycle.occupied !== total) {
    throw new Error(`${total}-player cycle mismatch: ${JSON.stringify(cycle)}`);
  }
  const missing = cycle.players.filter(color => color !== 'right').find(color => !cycle.lastMoves[color]);
  if (missing) throw new Error(`${total}-player cycle missed ${missing}`);
  if (cycle.overflow.bodyW !== cycle.overflow.innerW || cycle.overflow.bodyH !== cycle.overflow.innerH) throw new Error(`${total}-player viewport overflow`);
  await page.screenshot({ path: `${OUT}/${PROFILE}-${total}-players-after-cycle.png` });
  return cycle;
}

async function runPlayerScenario(total) {
  await page.goto(`${BASE_URL}/?${PROFILE}-${total}-players=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await setupMatch(total - 1);
  return completeTurnCycle(total);
}

async function runRestartScenario() {
  await page.goto(`${BASE_URL}/?${PROFILE}-restart=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await setupMatch(3);
  const before = await page.evaluate(() => {
    const state = globalThis.__yakolakGame.state;
    return { round: state.round, score: state.scores[state.humanColor] || 0, humanColor: state.humanColor };
  });
  const win = await page.evaluate(() => globalThis.__yakolakGame.debugTriggerWin('same-size', globalThis.__yakolakGame.state.humanColor));
  if (!win) throw new Error('debug win was not generated');
  await page.waitForFunction(before => {
    const game = globalThis.__yakolakGame;
    const state = game.state;
    const empty = Object.values(state.board).every(cell => Object.values(cell).every(value => value == null));
    return state.round === before.round + 1 && state.scores[state.humanColor] === before.score + 1 && state.started && !state.locked && !state.winner && empty;
  }, before, { timeout: 180_000 });
  const after = await page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    const state = game.state;
    return {
      round: state.round, score: state.scores[state.humanColor], players: [...state.players], turnIndex: state.turnIndex,
      winner: state.winner, locked: state.locked,
      placed: game.pieces.filter(piece => state.players.includes(piece.dir) && piece.placed).length,
      lastMoves: structuredClone(state.lastMoves), highlights: game.gameHighlightGroup.children.length,
      caption: document.querySelector('.yg-caption')?.innerText || ''
    };
  });
  if (after.players.length !== 4 || after.placed !== 0 || after.highlights !== 0 || Object.values(after.lastMoves).some(Boolean)) {
    throw new Error(`post-win restart left stale state: ${JSON.stringify(after)}`);
  }
  await page.screenshot({ path: `${OUT}/${PROFILE}-after-win-restart.png` });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitReady();
  const fresh = await page.evaluate(key => ({
    configured: globalThis.__yakolakGame.state.configured,
    started: globalThis.__yakolakGame.state.started,
    setupStep: globalThis.__yakolakGame.state.setupStep,
    tutorialComplete: localStorage.getItem(key),
    dialogOpen: document.querySelector('#yakolakTutorialDialog')?.classList.contains('open') || false
  }), TUTORIAL_KEY);
  if (fresh.configured || fresh.started || fresh.setupStep !== 'color' || fresh.tutorialComplete !== '1' || fresh.dialogOpen) {
    throw new Error(`reload did not return to clean setup: ${JSON.stringify(fresh)}`);
  }
  await setupMatch(3);
  const restarted = await page.evaluate(() => {
    const state = globalThis.__yakolakGame.state;
    return {
      players: [...state.players], round: state.round, scores: structuredClone(state.scores),
      boardEmpty: Object.values(state.board).every(cell => Object.values(cell).every(value => value == null)),
      dialogOpen: document.querySelector('#yakolakTutorialDialog')?.classList.contains('open') || false
    };
  });
  if (restarted.players.length !== 4 || restarted.round !== 1 || !restarted.boardEmpty || restarted.dialogOpen || Object.values(restarted.scores).some(Boolean)) {
    throw new Error(`fresh four-player restart failed: ${JSON.stringify(restarted)}`);
  }
  return { before, after, fresh, restarted };
}

try {
  await page.goto(`${BASE_URL}/version.json?profile=${PROFILE}&scenario=${SCENARIO}&run=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(key => localStorage.setItem(key, '1'), TUTORIAL_KEY);
  let result;
  if (SCENARIO === '3players') result = await runPlayerScenario(3);
  else if (SCENARIO === '4players') result = await runPlayerScenario(4);
  else if (SCENARIO === 'restart') result = await runRestartScenario();
  else throw new Error(`unknown scenario: ${SCENARIO}`);
  if (browserErrors.length) throw new Error(browserErrors.join('\n'));
  const output = { ok: true, build: 112, profile: PROFILE, scenario: SCENARIO, result, browserErrors };
  await fs.writeFile(`/tmp/v112-${PROFILE}-${SCENARIO}-results.json`, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
} finally {
  await context.close();
  await browser.close();
}
