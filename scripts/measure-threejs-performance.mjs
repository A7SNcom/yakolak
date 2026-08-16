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

const PROFILE = Object.freeze({
  name: REPRESENTATIVE_MOBILE_PROFILE.name,
  viewport: Object.freeze({ width: REPRESENTATIVE_MOBILE_PROFILE.width, height: REPRESENTATIVE_MOBILE_PROFILE.height }),
  deviceScaleFactor: REPRESENTATIVE_MOBILE_PROFILE.deviceScaleFactor,
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
    return Boolean(marks?.firstVisibleFrame && marks?.firstInteractive && window.__YAKOLAK_RENDERER_INFO__);
  }, null, { timeout: 30_000 });

  const browserMetrics = await page.evaluate(async () => {
    const { ASSET_LIST: manifest } = await import('/app/assets/asset-manifest.js');
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
    const rendererInfo = window.__YAKOLAK_RENDERER_INFO__;

    return {
      marks,
      startupNetwork: allAtInteractive,
      requiredAssetNetwork: network(requiredAssetEntries),
      decodedRequiredGeometryBytes,
      decodedGeometry,
      gpuFrame: {
        drawCalls: rendererInfo.render.calls,
        triangles: rendererInfo.render.triangles,
        points: rendererInfo.render.points,
        lines: rendererInfo.render.lines,
        geometries: rendererInfo.memory.geometries,
        textures: rendererInfo.memory.textures,
        programs: rendererInfo.programs?.length || 0,
      },
      dpr: window.devicePixelRatio,
      drawingBuffer: {
        width: shell.canvas.width,
        height: shell.canvas.height,
      },
    };
  });

  const png = await decodedPngBytes();
  const baseMetrics = {
    schema: 'THREEJS-017-PERF-V1',
    profile: PROFILE,
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
    pageErrors,
  };
  const regression = budgetStatus(baseMetrics, PERFORMANCE_REGRESSION_CEILINGS);
  const cutover = budgetStatus(baseMetrics, PERFORMANCE_CUTOVER_TARGETS);
  const metrics = Object.freeze({ ...baseMetrics, regression, cutover });

  console.log(`THREEJS-017_METRICS ${JSON.stringify(metrics)}`);
  if (pageErrors.length || !regression.ok) {
    if (!regression.ok) console.error(`THREEJS-017 budget regression: ${JSON.stringify(regression.failures)}`);
    process.exitCode = 1;
  }
  await context.close();
} finally {
  await browser.close();
}
