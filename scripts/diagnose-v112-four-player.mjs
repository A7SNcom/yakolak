import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE_URL = process.env.YAKOLAK_TEST_URL || 'http://127.0.0.1:8765';
const OUT = 'docs/screenshots/v112';
const TUTORIAL_KEY = 'yakolak-tutorial-v112-complete';
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', message => {
  const text = message.text();
  if (message.type() === 'warning' && /GL Driver Message.*GPU stall due to ReadPixels/.test(text)) return;
  if (['error', 'warning'].includes(message.type())) browserErrors.push(`console.${message.type()}: ${text}`);
});

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
    object.getWorldPosition(point);
    point.project(game.camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  }, action);
}

async function clickSetup(action, predicate, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const point = await screenPoint(action);
    await page.mouse.click(point.x, point.y);
    try {
      await page.waitForFunction(predicate, null, { timeout: 6_000 });
      return;
    } catch (error) {
      if (attempt === 3) throw new Error(`${label} failed after ${attempt + 1} pointer attempts`);
      await page.waitForTimeout(350);
    }
  }
}

async function snapshot() {
  return page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    const state = game.state;
    return {
      at: Date.now(),
      players: [...state.players],
      humanColor: state.humanColor,
      botCount: state.botCount,
      turnIndex: state.turnIndex,
      current: state.players[state.turnIndex % Math.max(1, state.players.length)] || null,
      started: state.started,
      configured: state.configured,
      tutorial: state.tutorial,
      locked: state.locked,
      winner: state.winner,
      round: state.round,
      remainingSeconds: state.turnDeadline ? Math.ceil((state.turnDeadline - Date.now()) / 1000) : null,
      lastMoves: structuredClone(state.lastMoves),
      occupied: Object.values(state.board || {}).reduce((sum, cell) => sum + Object.values(cell).filter(Boolean).length, 0),
      caption: document.querySelector('.yg-caption')?.innerText || '',
      selectedTray: game.pieces.filter(piece => piece.mesh.userData.traySelected).map(piece => ({ dir: piece.dir, side: piece.side, type: piece.type })),
      placed: game.pieces.filter(piece => piece.placed).map(piece => ({ dir: piece.dir, type: piece.type, zone: piece.zoneIndex }))
    };
  });
}

try {
  await page.goto(`${BASE_URL}/version.json?diagnostic=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(key => localStorage.setItem(key, '1'), TUTORIAL_KEY);
  await page.goto(`${BASE_URL}/?diagnose-four=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('yakolak-ready'), null, { timeout: 45_000 });
  await clickSetup(
    { type: 'color', value: 'right' },
    () => globalThis.__yakolakGame?.state?.setupStep === 'bots',
    'color selection'
  );
  await clickSetup(
    { type: 'bots', value: 3 },
    () => globalThis.__yakolakGame?.state?.configured === true,
    'four-player selection'
  );
  await page.waitForFunction(() => {
    const state = globalThis.__yakolakGame?.state;
    return state?.started && !state.tutorial && !state.locked && state.players.length === 4 && state.players[state.turnIndex] === state.humanColor;
  }, null, { timeout: 60_000 });

  let trayOpened = false;
  for (let attempt = 0; attempt < 4 && !trayOpened; attempt++) {
    const piecePoint = await page.evaluate(() => {
      const game = globalThis.__yakolakGame;
      const piece = game.pieces.find(item => item.dir === game.state.humanColor && !item.placed && item.side === 0);
      const point = new game.THREE.Vector3();
      const rect = game.renderer.domElement.getBoundingClientRect();
      piece.mesh.getWorldPosition(point); point.project(game.camera);
      return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
    });
    await page.mouse.click(piecePoint.x, piecePoint.y);
    try {
      await page.waitForFunction(() => globalThis.__yakolakGame?.pieces?.some(piece => piece.mesh.userData.traySelected), null, { timeout: 6_000 });
      trayOpened = true;
    } catch (error) {
      if (attempt === 3) throw new Error('human tray did not open after four pointer attempts');
      await page.waitForTimeout(350);
    }
  }

  const zonePoint = await page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    const piece = game.pieces.find(item => item.mesh.userData.traySelected);
    const zone = game.boardZones.find(item => !game.state.board[item.id]?.[piece.type]);
    const point = game.gameGroup.localToWorld(new game.THREE.Vector3(zone.px, zone.py, zone.pz));
    const rect = game.renderer.domElement.getBoundingClientRect();
    point.project(game.camera);
    return { id: zone.id, size: piece.type, color: piece.dir, x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  });
  let placed = false;
  for (let attempt = 0; attempt < 4 && !placed; attempt++) {
    await page.mouse.click(zonePoint.x, zonePoint.y);
    try {
      await page.waitForFunction(target => globalThis.__yakolakGame?.state?.board?.[target.id]?.[target.size] === target.color, zonePoint, { timeout: 6_000 });
      placed = true;
    } catch (error) {
      if (attempt === 3) throw new Error(`human move was not registered at zone ${zonePoint.id}`);
      await page.waitForTimeout(350);
    }
  }

  const timeline = [];
  let passed = false;
  for (let second = 0; second < 150; second++) {
    const state = await snapshot();
    timeline.push(state);
    const bots = state.players.filter(color => color !== state.humanColor);
    if (bots.every(color => !!state.lastMoves[color]) && state.current === state.humanColor && !state.locked) {
      passed = true;
      break;
    }
    await page.waitForTimeout(1000);
  }
  const result = { passed, browserErrors, timeline };
  await fs.writeFile('/tmp/yakolak-v112-four-player-state.json', JSON.stringify(result, null, 2));
  await page.screenshot({ path: `${OUT}/desktop-4-players-diagnostic.png` });
  if (!passed) throw new Error(`four-player cycle did not return to human; final=${JSON.stringify(timeline.at(-1))}`);
  if (browserErrors.length) throw new Error(browserErrors.join('\n'));
  console.log(JSON.stringify(timeline.at(-1), null, 2));
} finally {
  await context.close();
  await browser.close();
}
