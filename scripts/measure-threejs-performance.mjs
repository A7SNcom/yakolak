import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_LIST } from '../web/app/assets/asset-manifest.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.SHELL_URL || 'http://127.0.0.1:4173/';

const PROFILE = Object.freeze({
  name: 'representative-mobile-390x844',
  viewport: Object.freeze({ width: 390, height: 844 }),
  deviceScaleFactor: 2,
  cpuThrottleRate: 4,
  latencyMs: 150,
  downloadKbps: 1600,
  uploadKbps: 750,
});

function sumSourceBytes(group = null) {
  return ASSET_LIST
    .filter((asset) => !group || asset.group === group)
    .reduce((sum, asset) => sum + asset.source.bytes, 0);
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

    const seenBuffers = new Set();
    const geometryBytes = (geometry) => {
      if (!geometry?.isBufferGeometry) return 0;
      let bytes = 0;
      const countArray = (array) => {
        if (!array?.buffer) return;
        if (seenBuffers.has(array.buffer)) return;
        seenBuffers.add(array.buffer);
        bytes += array.byteLength ?? array.buffer.byteLength ?? 0;
      };
      for (const attribute of Object.values(geometry.attributes || {})) {
        countArray(attribute?.isInterleavedBufferAttribute ? attribute.data?.array : attribute?.array);
      }
      if (geometry.index) countArray(geometry.index.array);
      return bytes;
    };

    let decodedRequiredGeometryBytes = 0;
    const decodedGeometry = [];
    for (const asset of manifest.filter((entry) => entry.runtime.type === 'stl' && entry.runtimeRequired)) {
      const value = shell.getAsset(asset.logicalId);
      const bytes = geometryBytes(value);
      decodedRequiredGeometryBytes += bytes;
      decodedGeometry.push({ id: asset.logicalId, bytes });
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

    const assetEntries = resources.filter((entry) => entry.name.includes('/runtime-assets/'));
    const requiredAssetEntries = assetEntries.filter((entry) => entry.responseEnd <= startupCutoff + 0.001);
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
  const metrics = Object.freeze({
    schema: 'THREEJS-017-PERF-V1',
    profile: PROFILE,
    manifestBodyBytes: Object.freeze({
      bootCritical: sumSourceBytes('boot-critical'),
      sceneCritical: sumSourceBytes('scene-critical'),
      requiredTotal: sumSourceBytes('boot-critical') + sumSourceBytes('scene-critical'),
      optionalTotal: sumSourceBytes('optional'),
      allAssets: sumSourceBytes(),
    }),
    decodedOptionalTextureRgba8Bytes: png.total,
    decodedOptionalTextures: png.entries,
    ...browserMetrics,
    pageErrors,
  });

  console.log(`THREEJS-017_METRICS ${JSON.stringify(metrics)}`);
  if (pageErrors.length) process.exitCode = 1;
  await context.close();
} finally {
  await browser.close();
}
