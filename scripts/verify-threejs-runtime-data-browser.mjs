import { chromium } from 'playwright';

const baseUrl = process.env.SHELL_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => ['ready', 'failed', 'unsupported-webgl'].includes(document.documentElement.dataset.bootState));

  const result = await page.evaluate(() => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    if (!shell) throw new Error('Three.js shell is missing');
    const data = shell.getRuntimeData?.();
    if (!data) throw new Error('Canonical runtime data is missing');

    const recursiveFrozen = (value) => {
      if (!value || typeof value !== 'object') return true;
      return Object.isFrozen(value) && Object.values(value).every(recursiveFrozen);
    };

    let mutationBlocked = false;
    try {
      data.cells[0].position[0] = 9999;
    } catch {
      mutationBlocked = true;
    }

    return {
      bootState: document.documentElement.dataset.bootState,
      dataState: document.documentElement.dataset.canonicalRuntimeData,
      schemaVersion: data.schemaVersion,
      source: data.source,
      counts: data.counts,
      firstCell: data.cells[0],
      lastCell: data.cells.at(-1),
      seats: data.seats.order,
      identities: data.seats.identities,
      score: data.score,
      cameraIds: Object.keys(data.cameras),
      motion: {
        turnDurationMs: data.rules.turnDurationMs,
        piecePlacementMs: data.motion.piecePlacementMs,
        finalSnapMs: data.motion.unboxing.finalSnapMs,
      },
      network: {
        normalPollMs: data.network.normalPollMs,
        maximumBackoffMs: data.network.maximumBackoffMs,
        requestTimeoutMs: data.network.requestTimeoutMs,
      },
      introIds: data.introStarts.map((entry) => entry.id),
      introLogicalIds: data.introStarts.map((entry) => entry.logicalSlotId),
      recursiveFrozen: recursiveFrozen(data),
      mutationBlocked,
      firstCellAfterMutationAttempt: data.cells[0].position[0],
    };
  });

  const checks = {
    bootReady: result.bootState === 'ready' && result.dataState === 'validated',
    noPageErrors: pageErrors.length === 0,
    runtimeDataVersioned: result.schemaVersion === 1,
    sourcesExplicit: JSON.stringify(result.source) === JSON.stringify({
      worldLayout: 'data.world-layout',
      introScatter: 'data.intro-scatter',
      approvedContract: 'data.approved-contract',
    }),
    countsExact: JSON.stringify(result.counts) === JSON.stringify({ cells: 9, seats: 4, homeStacks: 12, cameras: 16, introStarts: 36, pieces: 36 }),
    cellsExact: JSON.stringify(result.firstCell) === JSON.stringify({ id: 0, position: [-48, 2, -48] })
      && JSON.stringify(result.lastCell) === JSON.stringify({ id: 8, position: [48, 2, 48] }),
    seatsExact: JSON.stringify(result.seats) === JSON.stringify(['right', 'back', 'left', 'front'])
      && JSON.stringify(result.identities) === JSON.stringify({ right: 'marble', back: 'blue', left: 'gold', front: 'green' }),
    scoreExact: JSON.stringify(result.score) === JSON.stringify({ radius: 85, gap: 11, order: [0, -1, 1, -2, 2, -3, 3] }),
    camerasComplete: result.cameraIds.length === 16 && new Set(result.cameraIds).size === 16,
    motionFromContract: result.motion.turnDurationMs === 18000 && result.motion.piecePlacementMs === 520 && result.motion.finalSnapMs === 4010,
    networkFromContract: result.network.normalPollMs === 900 && result.network.maximumBackoffMs === 8000 && result.network.requestTimeoutMs === 6500,
    scatterComplete: result.introIds.length === 36
      && result.introIds.every((id, index) => id === index)
      && new Set(result.introLogicalIds).size === 36,
    deeplyImmutable: result.recursiveFrozen === true && result.mutationBlocked === true && result.firstCellAfterMutationAttempt === -48,
  };

  const ok = Object.values(checks).every(Boolean);
  failed ||= !ok;
  console.log(JSON.stringify({ ok, checks, result, pageErrors }));
  await context.close();
} finally {
  await browser.close();
}

if (failed) process.exit(1);
