import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const expectedSha = String(process.env.GAMEPREP001_EXPECTED_SHA || '').trim().toLowerCase();
const baseUrl = new URL(process.env.GAMEPREP001_BASE_URL || 'https://a7sncom.github.io/yakolak/threejs/');
const manifestUrl = new URL('../deployment-manifest.json', baseUrl);
if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('GAMEPREP001_EXPECTED_SHA must be a 40-hex web milestone SHA');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJsonNoCache(url) {
  const target = new URL(url);
  target.searchParams.set('gameprep001', `${Date.now()}-${Math.random()}`);
  const response = await fetch(target, { headers: { 'Cache-Control': 'no-cache, max-age=0', Pragma: 'no-cache' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${target}`);
  return response.json();
}

function containsExpected(candidate) {
  if (!/^[0-9a-f]{40}$/.test(candidate)) return false;
  try {
    execFileSync('git', ['cat-file', '-e', `${candidate}^{commit}`], { stdio: 'ignore' });
  } catch {
    try { execFileSync('git', ['fetch', '--quiet', 'origin', candidate], { stdio: 'ignore' }); }
    catch { return false; }
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', expectedSha, candidate], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

async function waitForPublishedCandidate() {
  let last = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      last = await fetchJsonNoCache(manifestUrl);
      const candidate = String(last?.threejsCandidateSha || '').trim().toLowerCase();
      if (containsExpected(candidate)) return { candidate, generation: last.deploymentGeneration || null };
    } catch (error) { last = { error: error?.message || String(error) }; }
    await delay(5_000);
  }
  throw Object.assign(new Error(`public generation does not contain GAMEPREP-001 milestone ${expectedSha}`), { last });
}

async function setupTwoHumans(page) {
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'setup-ready', null, { timeout: 120_000 });
  await page.locator('#local-seat-count').selectOption('2');
  const types = page.locator('#local-seat-options .seat-type');
  await types.nth(0).selectOption('human');
  await types.nth(1).selectOption('human');
  await page.locator('#local-start').click();
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'ready', null, { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__YAKOLAK_THREEJS_SHELL__?.getCanonicalState?.()), null, { timeout: 30_000 });
}

async function projectOpeningMove(page) {
  return page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const snapshot = shell.getPresentationSnapshot();
    const state = await shell.getCanonicalState();
    const worldLayout = shell.getAsset('data.world-layout');
    const activeSeat = state.seats.find(seat => seat.seatId === state.activeSeatId);
    assertActive(activeSeat?.color === 'marble', 'opening seat must be marble');
    const remaining = state.inventory?.[activeSeat.seatId]?.small ?? 0;
    const piece = snapshot.pieces.placements
      .filter(candidate => candidate.colorId === 'marble' && candidate.size === 'small' && candidate.destination?.kind === 'home' && candidate.copyIndex < remaining)
      .sort((a, b) => a.copyIndex - b.copyIndex)[0];
    const zone = worldLayout.zones.find(candidate => candidate.id === 0);
    assertActive(piece && zone, 'opening piece/cell missing');

    const THREE = await import(new URL('vendor/three/r185/three.module.js', location.href).href);
    const frameModule = await import(new URL('app/camera/frame-governor.js', location.href).href);
    const rect = shell.canvas.getBoundingClientRect();
    const spec = worldLayout.cameras[snapshot.cameraId];
    const policy = snapshot.frame?.policy || {};
    const aspect = rect.width / rect.height;
    const fov = frameModule.refitPerspectiveFov({
      baseFov: policy.baseFov ?? spec.fov,
      aspect,
      referenceAspect: policy.referenceAspect ?? 1,
      maxFov: policy.maxFov ?? 72,
    });
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 8000);
    camera.position.fromArray(spec.position);
    camera.lookAt(new THREE.Vector3(...spec.target));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const project = position => {
      const v = new THREE.Vector3(...position).project(camera);
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    };
    return { revision: state.revision, piece: project(piece.destination.center), board: project(zone.position), canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };

    function assertActive(ok, message) { if (!ok) throw new Error(message); }
  });
}

async function exercise(browser, { name, viewport, mobile }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 2 : 1,
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    const url = new URL(baseUrl);
    url.searchParams.set(`gameprep001-${name}`, `${Date.now()}-${Math.random()}`);
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await setupTwoHumans(page);
    const target = await projectOpeningMove(page);

    const hit = await page.evaluate(({ x, y }) => {
      const shell = window.__YAKOLAK_THREEJS_SHELL__;
      const element = document.elementFromPoint(x, y);
      return { isCanvas: element === shell.canvas, tag: element?.tagName || null, id: element?.id || null };
    }, target.piece);
    assert.equal(hit.isCanvas, true, `${name}: HUD/overlay still intercepts marble/small input (${JSON.stringify(hit)})`);

    if (mobile) await page.touchscreen.tap(target.piece.x, target.piece.y);
    else await page.mouse.click(target.piece.x, target.piece.y);
    await page.waitForFunction(() => {
      const tap = window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot()?.tap;
      return tap?.phase === 'selected' && tap?.selection?.selectedSize === 'small' && tap.selection.legalCells?.includes(0);
    }, null, { timeout: 5_000 });

    if (mobile) await page.touchscreen.tap(target.board.x, target.board.y);
    else await page.mouse.click(target.board.x, target.board.y);
    await page.waitForFunction(async revision => {
      const state = await window.__YAKOLAK_THREEJS_SHELL__.getCanonicalState();
      return state.revision > revision && state.lastMove?.color === 'marble' && state.lastMove?.size === 'small' && state.lastMove?.cell === 0;
    }, target.revision, { timeout: 12_000 });

    const state = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getCanonicalState());
    assert.equal(pageErrors.length, 0, `${name}: page errors: ${pageErrors.join(' | ')}`);
    return { name, viewport, input: mobile ? 'touch' : 'click', revision: state.revision, lastMove: state.lastMove };
  } finally {
    await context.close();
  }
}

const published = await waitForPublishedCandidate();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const desktop = await exercise(browser, { name: 'desktop', viewport: { width: 1440, height: 900 }, mobile: false });
  const mobile = await exercise(browser, { name: 'mobile', viewport: { width: 390, height: 844 }, mobile: true });
  console.log(JSON.stringify({ GAMEPREP_001: 'PASS', expectedSha, published, desktop, mobile }));
} finally {
  await browser.close();
}
