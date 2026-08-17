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
    const [sceneModule, three, boardLayoutResponse] = await Promise.all([
      import('/app/scene/table-and-score.js'),
      import('three'),
      fetch('/assets/models/board-and-lid-layout.json', { cache: 'no-store' }),
    ]);
    if (!boardLayoutResponse.ok) throw new Error(`board layout HTTP ${boardLayoutResponse.status}`);
    const boardLayout = await boardLayoutResponse.json();

    const tableMaterial = sceneModule.createTableMaterial({ approvedContract });
    const table = sceneModule.createTableSurface({ footprintSvg, worldLayout, material: tableMaterial });
    table.mesh.updateMatrixWorld(true);
    const tableBounds = new three.Box3().setFromObject(table.mesh);

    const scoreMaterials = sceneModule.createScoreMaterials(approvedContract);
    const score = sceneModule.createScoreMarkerInstances({ runtimeAsset: runtimeScore, worldLayout, materialsByColor: scoreMaterials });
    score.setScores({ marble: 7, blue: 3, gold: 1, green: 0 });
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
      scoreCounts: scoreSnapshot.seats.map((entry) => [entry.colorId, entry.count]),
      scoreGeometryShared: geometryRefs.every((geometry) => geometry === geometryRefs[0]),
      scoreMaterialsPerSeatNotPerPoint: new Set(materialRefs).size === 4,
      scoreInstancedMeshes: score.records.length,
      sourceContactPivot: scoreSnapshot.sourceContactPivot,
      contact,
    };

    score.dispose();
    table.dispose();
    tableMaterial.dispose();
    for (const material of Object.values(scoreMaterials)) material.dispose();
    return snapshot;
  });

  const near = (actual, expected, epsilon = 0.001) => Math.abs(actual - expected) <= epsilon;
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
      && result.scorePlaneY === 2,
    scoreCountsUseInstancedCapacity: JSON.stringify(result.scoreCounts) === JSON.stringify([
      ['marble', 7], ['blue', 3], ['gold', 1], ['green', 0],
    ]),
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
