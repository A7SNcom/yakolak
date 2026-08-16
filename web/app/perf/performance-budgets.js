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

// Enforced now. Tight deterministic byte/memory ceilings plus timing headroom for hosted-runner jitter.
export const PERFORMANCE_REGRESSION_CEILINGS = Object.freeze({
  requiredAssetBodyBytes: 13_500_000,
  optionalAssetBodyBytes: 14_600_000,
  allAssetBodyBytes: 28_000_000,
  startupEncodedBytes: 16_000_000,
  decodedRequiredGeometryBytes: 19_000_000,
  decodedOptionalTextureRgba8Bytes: 50_331_648,
  criticalAssetsReadyMs: 90_000,
  firstInteractiveMs: 90_000,
  firstVisibleFrameMs: 90_500,
  drawCalls: 64,
  triangles: 1_000_000,
  gpuGeometries: 16,
  gpuTextures: 8,
  gpuPrograms: 12,
});

// Must be met before production cutover; not an excuse to relax the regression ceilings above.
export const PERFORMANCE_CUTOVER_TARGETS = Object.freeze({
  requiredAssetBodyBytes: 8_000_000,
  startupEncodedBytes: 9_000_000,
  decodedRequiredGeometryBytes: 16_000_000,
  decodedOptionalTextureRgba8Bytes: 16_777_216,
  criticalAssetsReadyMs: 50_000,
  firstInteractiveMs: 50_000,
  firstVisibleFrameMs: 50_500,
  drawCalls: 64,
  triangles: 900_000,
});
