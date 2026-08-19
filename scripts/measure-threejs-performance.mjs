import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_LIST, runtimePayloadBytes } from '../web/app/assets/asset-manifest.js';
import {
  PERFORMANCE_CUTOVER_TARGETS,
  PERFORMANCE_REGRESSION_CEILINGS,
  REPRESENTATIVE_MOBILE_PROFILE,
} from '../web/app/perf/performance-budgets.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.SHELL_URL || 'http://127.0.0.1:4173/';
const expectedThreejsSha = String(process.env.EXPECTED_THREEJS_SHA || '').trim() || null;

const PROFILE = Object.freeze({
  name: REPRESENTATIVE_MOBILE_PROFILE.name,
  viewport: Object.freeze({ width: REPRESENTATIVE_MOBILE_PROFILE.width, height: REPRESENTATIVE_MOBILE_PROFILE.height }),
  deviceScaleFactor: REPRESENTATIVE_MOBILE_PROFILE.deviceScaleFactor,
  rendererDprCap: REPRESENTATIVE_MOBILE_PROFILE.rendererDprCap,
  cpuThrottleRate: REPRESENTATIVE_MOBILE_PROFILE.cpuThrottleRate,
  latencyMs: REPRESENTATIVE_MOBILE_PROFILE.latencyMs,
  downloadKbps: REPRESENTATIVE_MOBILE_PROFILE.downloadKbps,
  uploadKbps: REPRESENTATIVE_MOBILE_PROFILE.uploadKbps,
});

function sumRuntimeBytes(group = null) {
  return ASSET_LIST
    .filter((asset) => !group || asset.group === group)
    .reduce((sum, asset) => sum + runtimePayloadBytes(asset), 0);
}

async function decodedPngBytes() {
  let total = 0;
  const entries = [];
  for (const asset of ASSET_LIST.filter((entry) => entry.runtime.type === 'png')) {
    const bytes = await readFile(path.join(repoRoot, 'YAKOLAK_PORTABLE_KIT/assets', asset.source.path));
    if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') {
      throw new Error(`Invalid PNG header: ${asset.source.path}`);
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const rgba8Bytes = width * height * 4;
    total += rgba8Bytes;
    entries.push(Object.freeze({ id: asset.logicalId, width, height, rgba8Bytes }));
  }
  return Object.freeze({ total, entries: Object.freeze(entries) });
}

function budgetStatus(metrics, limits) {
  const checks = [
    ['requiredAssetBodyBytes', metrics.manifestBodyBytes.requiredTotal, limits.requiredAssetBodyBytes],
    ['startupEncodedBytes', metrics.startupNetwork.encodedBytes, limits.startupEncodedBytes],
    ['decodedRequiredGeometryBytes', metrics.decodedRequiredGeometryBytes, limits.decodedRequiredGeometryBytes],
    ['decodedOptionalTextureRgba8Bytes', metrics.decodedOptionalTextureRgba8Bytes, limits.decodedOptionalTextureRgba8Bytes],
    ['criticalAssetsReadyMs', metrics.marks.criticalAssetsReady, limits.criticalAssetsReadyMs],
    ['firstInteractiveMs', metrics.marks.firstInteractive, limits.firstInteractiveMs],
    ['firstVisibleFrameMs', metrics.marks.firstVisibleFrame, limits.firstVisibleFrameMs],
    ['drawCalls', metrics.gpuFrame.drawCalls, limits.drawCalls],
    ['triangles', metrics.gpuFrame.triangles, limits.triangles],
  ].filter(([, , limit]) => Number.isFinite(limit));

  if (Number.isFinite(limits.optionalAssetBodyBytes)) checks.push(['optionalAssetBodyBytes', metrics.manifestBodyBytes.optionalTotal, limits.optionalAssetBodyBytes]);
  if (Number.isFinite(limits.allAssetBodyBytes)) checks.push(['allAssetBodyBytes', metrics.manifestBodyBytes.allAssets, limits.allAssetBodyBytes]);
  if (Number.isFinite(limits.gpuGeometries)) checks.push(['gpuGeometries', metrics.gpuFrame.geometries, limits.gpuGeometries]);
  if (Number.isFinite(limits.gpuTextures)) checks.push(['gpuTextures', metrics.gpuFrame.textures, limits.gpuTextures]);
  if (Number.isFinite(limits.gpuPrograms)) checks.push(['gpuPrograms', metrics.gpuFrame.programs, limits.gpuPrograms]);

  const results = checks.map(([name, actual, limit]) => Object.freeze({ name, actual, limit, ok: Number.isFinite(actual) && actual <= limit }));
  return Object.freeze({
    ok: results.every((entry) => entry.ok),
    checks: Object.freeze(results),
    failures: Object.freeze(results.filter((entry) => !entry.ok)),
  });
}

async function rendererInfoSnapshot(cdp) {
  await cdp.send('Runtime.enable');
  const prototype = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const moduleUrl = new URL('vendor/three/r185/three.module.js', location.href).href;
      const THREE = await import(moduleUrl);
      return THREE.WebGLRenderer.prototype;
    })()`,
    awaitPromise: true,
    returnByValue: false,
  });
  const prototypeObjectId = prototype?.result?.objectId;
  if (!prototypeObjectId) throw new Error('Unable to resolve the live Three.js WebGLRenderer prototype');

  const queried = await cdp.send('Runtime.queryObjects', { prototypeObjectId });
  const objectsObjectId = queried?.objects?.objectId;
  if (!objectsObjectId) throw new Error('Unable to query live Three.js WebGLRenderer instances');

  try {
    const snapshot = await cdp.send('Runtime.callFunctionOn', {
      objectId: objectsObjectId,
      functionDeclaration: `function () {
        const candidates = Array.from(this).filter((renderer) =>
          renderer?.isWebGLRenderer
          && renderer?.domElement?.dataset?.rendererOwner === 'primary-webgl2'
          && renderer.domElement.isConnected
          && renderer.info
        );
        const renderer = candidates.at(-1);
        if (!renderer) return null;
        const info = renderer.info;
        return {
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          points: info.render.points,
          lines: info.render.lines,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs?.length || 0,
        };
      }`,
      returnByValue: true,
    });
    const value = snapshot?.result?.value;
    if (!value) throw new Error('No connected primary WebGLRenderer instance was found');
    return Object.freeze(value);
  } finally {
    await cdp.send('Runtime.releaseObject', { objectId: objectsObjectId }).catch(() => {});
    await cdp.send('Runtime.releaseObject', { objectId: prototypeObjectId }).catch(() => {});
  }
}

function resourceCount(snapshot, kind) {
  return Number(snapshot?.byKind?.[kind] || 0);
}

function lifecycleDelta(before, after) {
  return Object.freeze({
    total: Number(after?.total || 0) - Number(before?.total || 0),
    gpuObjects: Number(after?.gpuObjects || 0) - Number(before?.gpuObjects || 0),
    geometries: resourceCount(after, 'geometry') - resourceCount(before, 'geometry'),
    materials: resourceCount(after, 'material') - resourceCount(before, 'material'),
    textures: resourceCount(after, 'texture') - resourceCount(before, 'texture'),
    renderTargets: resourceCount(after, 'render-target') - resourceCount(before, 'render-target'),
    shadowMaps: resourceCount(after, 'shadow-map') - resourceCount(before, 'shadow-map'),
    shaderVariants: Number(after?.shaderVariants || 0) - Number(before?.shaderVariants || 0),
    materialVariants: Number(after?.materialVariants || 0) - Number(before?.materialVariants || 0),
  });
}

function zeroLifecycleDelta(delta) {
  return Object.values(delta).every((value) => value === 0);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

let pageErrors = [];
try {
  const context = await browser.newContext({
    viewport: PROFILE.viewport,
    deviceScaleFactor: PROFILE.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: PROFILE.latencyMs,
    downloadThroughput: (PROFILE.downloadKbps * 1000) / 8,
    uploadThroughput: (PROFILE.uploadKbps * 1000) / 8,
    connectionType: 'cellular3g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: PROFILE.cpuThrottleRate });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => {
    const state = document.documentElement.dataset.bootState;
    return ['ready', 'asset-load-failed', 'failed', 'unsupported-webgl'].includes(state);
  }, null, { timeout: 120_000 });

  const bootState = await page.evaluate(() => document.documentElement.dataset.bootState);
  if (bootState !== 'ready') throw new Error(`Performance profile did not reach ready state: ${bootState}`);

  await page.waitForFunction(() => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const marks = shell?.getStartupMarks?.();
    return Boolean(marks?.firstVisibleFrame && marks?.firstInteractive);
  }, null, { timeout: 30_000 });

  const gpuFrame = await rendererInfoSnapshot(cdp);

  const browserMetrics = await page.evaluate(async () => {
    const manifestUrl = new URL('app/assets/asset-manifest.js', location.href).href;
    const { ASSET_LIST: manifest } = await import(manifestUrl);
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const marks = shell.getStartupMarks();

    const geometryBytes = (geometry) => {
      if (!geometry?.isBufferGeometry) return 0;
      let bytes = 0;
      for (const attribute of Object.values(geometry.attributes || {})) {
        const array = attribute?.isInterleavedBufferAttribute ? attribute.data?.array : attribute?.array;
        bytes += array?.byteLength || 0;
      }
      bytes += geometry.index?.array?.byteLength || 0;
      return bytes;
    };

    let decodedRequiredGeometryBytes = 0;
    const decodedGeometry = [];
    for (const asset of manifest.filter((entry) => entry.runtimeRequired && ['stl', 'glb-components'].includes(entry.runtime.type))) {
      const value = shell.getAsset(asset.logicalId);
      const bytes = asset.runtime.type === 'glb-components'
        ? (value?.components || []).reduce((sum, component) => sum + geometryBytes(component.geometry), 0)
        : geometryBytes(value);
      decodedRequiredGeometryBytes += bytes;
      decodedGeometry.push({ id: asset.logicalId, runtimeType: asset.runtime.type, bytes });
    }

    const resources = performance.getEntriesByType('resource');
    const navigation = performance.getEntriesByType('navigation')[0] || null;
    const startupCutoff = marks.firstInteractive;
    const network = (entries) => entries.reduce((sum, entry) => ({
      transferBytes: sum.transferBytes + (entry.transferSize || 0),
      encodedBytes: sum.encodedBytes + (entry.encodedBodySize || 0),
      decodedBytes: sum.decodedBytes + (entry.decodedBodySize || 0),
      requests: sum.requests + 1,
    }), { transferBytes: 0, encodedBytes: 0, decodedBytes: 0, requests: 0 });

    const startupEntries = resources.filter((entry) => entry.responseEnd <= startupCutoff + 0.001);
    const allAtInteractive = network(startupEntries);
    if (navigation) {
      allAtInteractive.transferBytes += navigation.transferSize || 0;
      allAtInteractive.encodedBytes += navigation.encodedBodySize || 0;
      allAtInteractive.decodedBytes += navigation.decodedBodySize || 0;
      allAtInteractive.requests += 1;
    }

    const requiredPaths = new Set(manifest.filter((asset) => asset.runtimeRequired).map((asset) => new URL(asset.runtime.url, location.href).pathname));
    const requiredAssetEntries = resources.filter((entry) => requiredPaths.has(new URL(entry.name).pathname) && entry.responseEnd <= startupCutoff + 0.001);

    let deploymentManifest = null;
    try {
      const deploymentManifestUrl = new URL('../deployment-manifest.json', location.href);
      deploymentManifestUrl.searchParams.set('threejs026_perf', `${Date.now()}-${Math.random()}`);
      const response = await fetch(deploymentManifestUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
      if (response.ok) deploymentManifest = await response.json();
    } catch {
      deploymentManifest = null;
    }

    return {
      marks,
      startupHitchMs: Math.max(0, Number(marks.firstVisibleFrame) - Number(marks.firstInteractive)),
      startupNetwork: allAtInteractive,
      requiredAssetNetwork: network(requiredAssetEntries),
      decodedRequiredGeometryBytes,
      decodedGeometry,
      deploymentManifest,
      resourceRegistryAtReady: shell.getResourceRegistrySnapshot?.() || null,
      dpr: window.devicePixelRatio,
      drawingBuffer: {
        width: shell.canvas.width,
        height: shell.canvas.height,
      },
    };
  });

  if (expectedThreejsSha) {
    const liveSha = browserMetrics.deploymentManifest?.threejsCandidateSha || null;
    if (liveSha !== expectedThreejsSha) {
      throw new Error(`Exact Pages generation mismatch: expected Three.js ${expectedThreejsSha}, live manifest has ${liveSha || 'none'}`);
    }
  }

  const disposedLifecycle = await page.evaluate(() => {
  const shell = window.__YAKOLAK_THREEJS_SHELL__;
  if (!shell) throw new Error('Ready shell disappeared before dispose/recreate measurement');
  const before = shell.getResourceRegistrySnapshot();
  const graphicsBefore = shell.getGraphicsContextSnapshot();
  shell.dispose();
  const afterDispose = shell.getResourceRegistrySnapshot();
  return { before, afterDispose, graphicsBefore };
});

await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForFunction(() => {
  const state = document.documentElement.dataset.bootState;
  return ['ready', 'asset-load-failed', 'failed', 'unsupported-webgl'].includes(state);
}, null, { timeout: 120_000 });
const recreateBootState = await page.evaluate(() => document.documentElement.dataset.bootState);
if (recreateBootState !== 'ready') throw new Error(`Dispose/recreate cold reload did not reach ready: ${recreateBootState}`);
await page.waitForFunction(() => {
  const shell = window.__YAKOLAK_THREEJS_SHELL__;
  const marks = shell?.getStartupMarks?.();
  return Boolean(marks?.firstVisibleFrame && marks?.firstInteractive);
}, null, { timeout: 30_000 });

const recreated = await page.evaluate(async () => {
  const shell = window.__YAKOLAK_THREEJS_SHELL__;
  const manifestUrl = new URL('../deployment-manifest.json', location.href);
  manifestUrl.searchParams.set('threejs026_recreate', `${Date.now()}-${Math.random()}`);
  const response = await fetch(manifestUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
  const manifest = response.ok ? await response.json() : null;
  return {
    after: shell.getResourceRegistrySnapshot(),
    graphicsAfter: shell.getGraphicsContextSnapshot(),
    liveSha: manifest?.threejsCandidateSha || null,
  };
});
if (expectedThreejsSha && recreated.liveSha !== expectedThreejsSha) {
  throw new Error(`Pages generation changed during dispose/recreate: expected ${expectedThreejsSha}, got ${recreated.liveSha || 'none'}`);
}

const gpuFrameAfterRecreate = await rendererInfoSnapshot(cdp);
const recreateDelta = lifecycleDelta(disposedLifecycle.before, recreated.after);
const disposeResidual = Object.freeze({
  total: Number(disposedLifecycle.afterDispose?.total || 0),
  gpuObjects: Number(disposedLifecycle.afterDispose?.gpuObjects || 0),
  geometries: resourceCount(disposedLifecycle.afterDispose, 'geometry'),
  materials: resourceCount(disposedLifecycle.afterDispose, 'material'),
  textures: resourceCount(disposedLifecycle.afterDispose, 'texture'),
  renderTargets: resourceCount(disposedLifecycle.afterDispose, 'render-target'),
  shadowMaps: resourceCount(disposedLifecycle.afterDispose, 'shadow-map'),
  shaderVariants: Number(disposedLifecycle.afterDispose?.shaderVariants || 0),
  materialVariants: Number(disposedLifecycle.afterDispose?.materialVariants || 0),
});
const lifecycleRecreate = Object.freeze({
  supported: true,
  before: disposedLifecycle.before,
  afterDispose: disposedLifecycle.afterDispose,
  after: recreated.after,
  graphicsBefore: disposedLifecycle.graphicsBefore,
  graphicsAfter: recreated.graphicsAfter,
  disposeResidual,
  reason: null,
});
const lifecycleOk = Object.values(disposeResidual).every((value) => value === 0)
  && zeroLifecycleDelta(recreateDelta)
  && JSON.stringify(lifecycleRecreate.before?.byKind || {}) === JSON.stringify(lifecycleRecreate.after?.byKind || {})
  && JSON.stringify(lifecycleRecreate.before?.byOwnership || {}) === JSON.stringify(lifecycleRecreate.after?.byOwnership || {})
  && (lifecycleRecreate.afterDispose?.disposalErrors?.length || 0) === (lifecycleRecreate.before?.disposalErrors?.length || 0)
  && (lifecycleRecreate.after?.disposalErrors?.length || 0) === 0
  && gpuFrameAfterRecreate.geometries === gpuFrame.geometries
  && gpuFrameAfterRecreate.textures === gpuFrame.textures
  && gpuFrameAfterRecreate.programs === gpuFrame.programs;

  const png = await decodedPngBytes();
  const baseMetrics = {
    schema: 'THREEJS-026-PERF-V1',
    profile: PROFILE,
    target: baseUrl,
    expectedThreejsSha,
    manifestBodyBytes: Object.freeze({
      bootCritical: sumRuntimeBytes('boot-critical'),
      sceneCritical: sumRuntimeBytes('scene-critical'),
      requiredTotal: sumRuntimeBytes('boot-critical') + sumRuntimeBytes('scene-critical'),
      optionalTotal: sumRuntimeBytes('optional'),
      allAssets: sumRuntimeBytes(),
    }),
    decodedOptionalTextureRgba8Bytes: png.total,
    decodedOptionalTextures: png.entries,
    ...browserMetrics,
    gpuFrame,
    lifecycleRecreate: Object.freeze({
      supported: lifecycleRecreate.supported,
      ok: lifecycleOk,
      delta: recreateDelta,
      before: lifecycleRecreate.before,
      afterDispose: lifecycleRecreate.afterDispose,
      disposeResidual: lifecycleRecreate.disposeResidual,
      after: lifecycleRecreate.after,
      graphicsBefore: lifecycleRecreate.graphicsBefore,
      graphicsAfter: lifecycleRecreate.graphicsAfter,
      gpuBefore: gpuFrame,
      gpuAfter: gpuFrameAfterRecreate,
      reason: lifecycleRecreate.reason || null,
    }),
    pageErrors,
  };
  const regression = budgetStatus(baseMetrics, PERFORMANCE_REGRESSION_CEILINGS);
  const cutover = budgetStatus(baseMetrics, PERFORMANCE_CUTOVER_TARGETS);
  const metrics = Object.freeze({ ...baseMetrics, regression, cutover });

  const serialized = JSON.stringify(metrics);
  console.log(`THREEJS-017_METRICS ${serialized}`);
  console.log(`THREEJS026_METRICS ${serialized}`);
  if (pageErrors.length || !regression.ok || !lifecycleOk) {
    if (!regression.ok) console.error(`THREEJS-026 budget regression: ${JSON.stringify(regression.failures)}`);
    if (!lifecycleOk) console.error(`THREEJS-026 lifecycle recreate mismatch: ${JSON.stringify(metrics.lifecycleRecreate)}`);
    process.exitCode = 1;
  }
  await context.close();
} finally {
  await browser.close();
}
