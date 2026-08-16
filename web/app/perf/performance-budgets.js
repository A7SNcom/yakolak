// THREEJS-017 — measurable performance guardrails. These are presentation/delivery limits, never gameplay authority.

export const REPRESENTATIVE_MOBILE_PROFILE = Object.freeze({
  name: 'representative-mobile-390x844',
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  rendererDprCap: 1.5,
  cpuThrottleRate: 4,
  latencyMs: 150,
  downloadKbps: 1600,
  uploadKbps: 750,
});

// Enforced now. THREEJS-019 tightened these after one committed player-base GLB replaced the heavier runtime STL payload.
export const PERFORMANCE_REGRESSION_CEILINGS = Object.freeze({
  requiredAssetBodyBytes: 5_000_000,
  optionalAssetBodyBytes: 14_600_000,
  allAssetBodyBytes: 20_000_000,
  startupEncodedBytes: 7_500_000,
  decodedRequiredGeometryBytes: 5_000_000,
  decodedOptionalTextureRgba8Bytes: 50_331_648,
  criticalAssetsReadyMs: 45_000,
  firstInteractiveMs: 45_000,
  firstVisibleFrameMs: 45_500,
  drawCalls: 64,
  triangles: 1_000_000,
  gpuGeometries: 16,
  gpuTextures: 8,
  gpuPrograms: 12,
});

// Must be met before production cutover; not an excuse to relax the regression ceilings above.
export const PERFORMANCE_CUTOVER_TARGETS = Object.freeze({
  requiredAssetBodyBytes: 4_800_000,
  startupEncodedBytes: 7_000_000,
  decodedRequiredGeometryBytes: 4_800_000,
  decodedOptionalTextureRgba8Bytes: 16_777_216,
  criticalAssetsReadyMs: 40_000,
  firstInteractiveMs: 40_000,
  firstVisibleFrameMs: 40_500,
  drawCalls: 64,
  triangles: 900_000,
});
