import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const MOBILE_VIEW = innerWidth <= 900;
const CREASE_ANGLE_DEGREES = 55;
const CREASE_ANGLE_RADIANS = Math.PI * CREASE_ANGLE_DEGREES / 180;
const POLL_INTERVAL_MS = 40;
const LOAD_TIMEOUT_MS = 60_000;

const report = {
  build: 121,
  mobile: MOBILE_VIEW,
  applied: false,
  creaseAngleDegrees: CREASE_ANGLE_DEGREES,
  geometries: [],
  unchangedRenderCost: false,
  error: null
};

globalThis.__yakolakV121PieceNormals = report;

function geometryCounts(geometry) {
  const positions = geometry?.getAttribute?.('position')?.count || 0;
  const indices = geometry?.index?.count || 0;
  return {
    positions,
    triangles: Math.floor((indices || positions) / 3)
  };
}

async function waitForPieces() {
  const startedAt = performance.now();
  while (performance.now() - startedAt < LOAD_TIMEOUT_MS) {
    const game = globalThis.__yakolakGame;
    const pieces = game?.pieces || [];
    const geometries = [...new Set(pieces.map(piece => piece?.mesh?.geometry).filter(Boolean))];
    if (pieces.length >= 12 && geometries.length === 3) return { game, geometries };
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('v121_piece_geometry_timeout');
}

async function applyMobilePieceNormals() {
  if (!MOBILE_VIEW) {
    report.unchangedRenderCost = true;
    return;
  }

  const { game, geometries } = await waitForPieces();
  game.render?.();
  const rendererBefore = game.renderer?.info?.render ? { ...game.renderer.info.render } : null;

  for (const geometry of geometries) {
    const before = geometryCounts(geometry);
    const source = geometry.clone();
    const smoothed = toCreasedNormals(source, CREASE_ANGLE_RADIANS);
    const after = geometryCounts(smoothed);

    if (before.positions !== after.positions || before.triangles !== after.triangles) {
      source.dispose();
      if (smoothed !== source) smoothed.dispose();
      throw new Error(`v121_geometry_cost_changed:${before.positions}/${before.triangles}->${after.positions}/${after.triangles}`);
    }

    const normal = smoothed.getAttribute('normal');
    if (!normal || normal.count !== before.positions) {
      source.dispose();
      if (smoothed !== source) smoothed.dispose();
      throw new Error('v121_invalid_normal_buffer');
    }

    geometry.setAttribute('normal', normal.clone());
    geometry.getAttribute('normal').needsUpdate = true;
    geometry.computeBoundingSphere();

    report.geometries.push({
      positionsBefore: before.positions,
      positionsAfter: after.positions,
      trianglesBefore: before.triangles,
      trianglesAfter: after.triangles,
      normalCount: normal.count
    });

    source.dispose();
    if (smoothed !== source) smoothed.dispose();
  }

  game.render?.();
  const rendererAfter = game.renderer?.info?.render ? { ...game.renderer.info.render } : null;
  report.applied = true;
  report.unchangedRenderCost = report.geometries.every(item =>
    item.positionsBefore === item.positionsAfter &&
    item.trianglesBefore === item.trianglesAfter
  );
  report.rendererBefore = rendererBefore;
  report.rendererAfter = rendererAfter;
}

try {
  await applyMobilePieceNormals();
} catch (error) {
  report.error = error?.stack || String(error);
  console.error('[Yakolak] v121 piece normals failed', error);
  throw error;
}
