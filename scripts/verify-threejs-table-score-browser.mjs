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
  const requests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => ['ready', 'failed', 'unsupported-webgl'].includes(document.documentElement.dataset.bootState));

  const result = await page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    if (!shell) throw new Error('Three.js shell is missing');
    const runtimeScore = shell.getAsset('model.score-marker');
    const footprintSvg = shell.getAsset('scene.table-footprint');
    const worldLayout = shell.getAsset('data.world-layout');
    const approvedContract = shell.getAsset('data.approved-contract');
    const [sceneModule, scorePresentation, sessionModule, registryModule, three, boardLayoutResponse] = await Promise.all([
      import('/app/scene/table-and-score.js'),
      import('/app/scene/score-marker-presentation.js'),
      import('/app/session/canonical-session-state.js'),
      import('/app/core/resource-registry.js'),
      import('three'),
      fetch('/assets/models/board-and-lid-layout.json', { cache: 'no-store' }),
    ]);
    if (!boardLayoutResponse.ok) throw new Error(`board layout HTTP ${boardLayoutResponse.status}`);
    const boardLayout = await boardLayoutResponse.json();
    const resourceRegistry = registryModule.createResourceRegistry({ platform: window });

    const tableMaterial = sceneModule.createTableMaterial({ approvedContract, resourceRegistry });
    const table = sceneModule.createTableSurface({ footprintSvg, worldLayout, material: tableMaterial, resourceRegistry });
    table.mesh.updateMatrixWorld(true);
    const tableBounds = new three.Box3().setFromObject(table.mesh);

    const scoreMaterials = sceneModule.createScoreMaterials(approvedContract, { resourceRegistry });
    const createPhysicalScoreInstances = () => sceneModule.createScoreMarkerInstances({
      runtimeAsset: runtimeScore,
      worldLayout,
      materialsByColor: scoreMaterials,
      resourceRegistry,
    });
    const score = createPhysicalScoreInstances();

    const seats = [
      { seatId: 'right', type: 'host-human', color: 'marble', ready: true },
      { seatId: 'back', type: 'computer', color: 'blue', ready: true },
      { seatId: 'left', type: 'computer', color: 'gold', ready: true },
      { seatId: 'front', type: 'computer', color: 'green', ready: true },
    ];
    const authoritative = sessionModule.createCanonicalSessionState({
      preferredColor: 'marble',
      targetPlayers: 4,
      winsToMatch: 5,
      seats,
      scores: { right: 4, back: 3, left: 1, front: 0 },
      round: 7,
      completedRounds: 6,
      revision: 80,
      lifecycle: { phase: 'round-ready' },
    });
    const authoritativeSync = scorePresentation.syncPersistentScoreMarkerInstances(score, authoritative);
    const authoritativeCounts = score.snapshot().seats.map((entry) => [entry.seatId, entry.colorId, entry.count]);

    const hydrated = sessionModule.parseCanonicalSessionState(sessionModule.serializeCanonicalSessionState(authoritative));
    const rebuiltScore = createPhysicalScoreInstances();
    const hydrationSync = scorePresentation.rebuildPersistentScoreMarkerInstances(rebuiltScore, hydrated);
    const hydratedCounts = rebuiltScore.snapshot().seats.map((entry) => [entry.seatId, entry.colorId, entry.count]);
    const rebuildGeometryReused = rebuiltScore.records.every((record, index) => record.mesh.geometry === score.records[index].mesh.geometry);
    const rebuildMaterialsReused = rebuiltScore.records.every((record, index) => record.mesh.material === score.records[index].mesh.material);

    const nextRound = sessionModule.createCanonicalSessionState({
      preferredColor: 'marble',
      targetPlayers: 4,
      winsToMatch: 5,
      seats,
      scores: { right: 4, back: 3, left: 1, front: 0 },
      round: 8,
      completedRounds: 7,
      revision: 81,
      lifecycle: { phase: 'round-ready' },
    });
    scorePresentation.syncPersistentScoreMarkerInstances(score, nextRound);
    const roundResetCounts = score.snapshot().seats.map((entry) => [entry.seatId, entry.colorId, entry.count]);

    const freshMatch = sessionModule.createCanonicalSessionState({
      preferredColor: 'marble',
      targetPlayers: 4,
      winsToMatch: 5,
      seats,
      scores: { right: 0, back: 0, left: 0, front: 0 },
      round: 1,
      completedRounds: 0,
      revision: 82,
      lifecycle: { phase: 'round-ready' },
    });
    scorePresentation.syncPersistentScoreMarkerInstances(score, freshMatch);
    const freshMatchCounts = score.snapshot().seats.map((entry) => [entry.seatId, entry.colorId, entry.count]);

    // Restore the authoritative fixture for the physical snapshot below.
    scorePresentation.syncPersistentScoreMarkerInstances(score, authoritative);
    const scoreSnapshot = score.snapshot();
    const contact = sceneModule.createTableAndScoreContactReport({ worldLayout, boardLayout });
    const geometryRefs = score.records.map((record) => record.mesh.geometry);
    const materialRefs = score.records.map((record) => record.mesh.material);

    const snapshot = {
      bootState: document.documentElement.dataset.bootState,
      scoreRuntimeFormat: runtimeScore?.format,
      scoreComponentCount: runtimeScore?.components?.length,
      tablePointCount: table.footprint.sourcePointCount,
      tableSpan: table.footprint.transformedSpan,
      tableBounds: { min: tableBounds.min.toArray(), max: tableBounds.max.toArray() },
      tableTopY: table.tableTopY,
      optionalMapsAffectGeometry: table.mesh.userData.optionalMapsAffectGeometry,
      scoreRadius: score.layout.radius,
      scoreGap: score.layout.gap,
      scoreOrder: score.layout.order,
      scorePlaneY: score.layout.scorePlaneY,
      scoreSeatCenters: score.layout.seats.map((entry) => [entry.seatId, entry.colorId, entry.sideCenter]),
      authoritativeCounts,
      hydratedCounts,
      roundResetCounts,
      freshMatchCounts,
      rebuildGeometryReused,
      rebuildMaterialsReused,
      authoritativeSync: {
        countsBySeat: authoritativeSync.countsBySeat,
        renderedCountsBySeat: authoritativeSync.renderedCountsBySeat,
      },
      hydrationSync: {
        countsBySeat: hydrationSync.countsBySeat,
        renderedCountsBySeat: hydrationSync.renderedCountsBySeat,
      },
      scoreGeometryShared: geometryRefs.every((geometry) => geometry === geometryRefs[0]),
      scoreMaterialsPerSeatNotPerPoint: new Set(materialRefs).size === 4,
      scoreInstancedMeshes: score.records.length,
      sourceContactPivot: scoreSnapshot.sourceContactPivot,
      contact,
    };

    rebuiltScore.dispose();
    score.dispose();
    table.dispose();
    resourceRegistry.dispose('table-score-browser-verifier-complete');
    return snapshot;
  });

  const near = (actual, expected, epsilon = 0.001) => Math.abs(actual - expected) <= epsilon;
  const expectedScores = [
    ['right', 'marble', 4],
    ['back', 'blue', 3],
    ['left', 'gold', 1],
    ['front', 'green', 0],
  ];
  const zeroScores = [
    ['right', 'marble', 0],
    ['back', 'blue', 0],
    ['left', 'gold', 0],
    ['front', 'green', 0],
  ];
  const expectedCenters = [
    ['right', 'marble', [85, 2, 0]],
    ['back', 'blue', [0, 2, -85]],
    ['left', 'gold', [-85, 2, 0]],
    ['front', 'green', [0, 2, 85]],
  ];
  const centersExact = result.scoreSeatCenters.length === expectedCenters.length
    && result.scoreSeatCenters.every((entry, index) => entry[0] === expectedCenters[index][0]
      && entry[1] === expectedCenters[index][1]
      && entry[2].every((value, coordinate) => near(value, expectedCenters[index][2][coordinate])));
  const checks = {
    bootReady: result.bootState === 'ready',
    noPageErrors: pageErrors.length === 0,
    scoreUsesCommittedGlb: requests.includes('/assets/models/score-marker.glb') && !requests.includes('/runtime-assets/models/score-marker.stl'),
    scoreDecodedOnce: result.scoreRuntimeFormat === 'yakolak-glb-components-v1' && result.scoreComponentCount === 1,
    tableUsesExactFootprint: result.tablePointCount === 30
      && near(result.tableSpan[0], 801.862564149, 0.0001)
      && near(result.tableSpan[1], 797.470897131, 0.0001),
    tableContactHeightExact: result.tableTopY === -16
      && near(result.tableBounds.min[1], -16)
      && near(result.tableBounds.max[1], -16),
    optionalMapsNotGeometryAuthority: result.optionalMapsAffectGeometry === false,
    scoreDataExact: result.scoreRadius === 85
      && result.scoreGap === 11
      && JSON.stringify(result.scoreOrder) === JSON.stringify([0, -1, 1, -2, 2, -3, 3])
      && result.scorePlaneY === 2
      && centersExact,
    scoreCountsFromAuthority: JSON.stringify(result.authoritativeCounts) === JSON.stringify(expectedScores)
      && JSON.stringify(result.authoritativeSync.countsBySeat) === JSON.stringify({ right: 4, back: 3, left: 1, front: 0 })
      && JSON.stringify(result.authoritativeSync.renderedCountsBySeat) === JSON.stringify({ right: 4, back: 3, left: 1, front: 0 }),
    hydrationDeterministic: JSON.stringify(result.hydratedCounts) === JSON.stringify(expectedScores)
      && JSON.stringify(result.hydrationSync.countsBySeat) === JSON.stringify(result.authoritativeSync.countsBySeat)
      && JSON.stringify(result.hydrationSync.renderedCountsBySeat) === JSON.stringify(result.authoritativeSync.renderedCountsBySeat)
      && result.rebuildGeometryReused === true
      && result.rebuildMaterialsReused === true,
    roundResetRetainsMarkers: JSON.stringify(result.roundResetCounts) === JSON.stringify(expectedScores),
    freshMatchAuthorityClearsMarkers: JSON.stringify(result.freshMatchCounts) === JSON.stringify(zeroScores),
    scoreGeometryShared: result.scoreGeometryShared === true && result.scoreInstancedMeshes === 4,
    scoreMaterialsNotPerPoint: result.scoreMaterialsPerSeatNotPerPoint === true,
    scorePivotExact: Array.isArray(result.sourceContactPivot)
      && near(result.sourceContactPivot[0], 20)
      && near(result.sourceContactPivot[1], -52)
      && near(result.sourceContactPivot[2], 0),
    contactContradictionExplicit: result.contact.tableTopY === -16
      && result.contact.declaredGameClearance === 0.8
      && result.contact.boardBottomY === 0
      && result.contact.measuredBoardGap === 16
      && result.contact.declaredClearanceMatchesBoardBounds === false
      && result.contact.hiddenGameOffsetApplied === false,
  };
  const ok = Object.values(checks).every(Boolean);
  failed ||= !ok;
  console.log(JSON.stringify({ ok, checks, result, pageErrors, requests }));
  await context.close();
} finally {
  await browser.close();
}

if (failed) process.exit(1);
