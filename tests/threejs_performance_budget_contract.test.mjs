import test from 'node:test';
import assert from 'node:assert/strict';
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
const sourceRoot = path.join(repoRoot, 'YAKOLAK_PORTABLE_KIT/assets');

function groupBytes(group) {
  return ASSET_LIST.filter((asset) => asset.group === group).reduce((sum, asset) => sum + runtimePayloadBytes(asset), 0);
}

function glbDecodedGeometryBytes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67, 'GLB magic');
  const jsonLength = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a, 'GLB JSON chunk');
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
  const used = new Set();
  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      for (const accessorIndex of [primitive.attributes?.POSITION, primitive.attributes?.NORMAL, primitive.indices]) {
        const accessor = gltf.accessors?.[accessorIndex];
        assert.ok(accessor, `missing GLB accessor ${accessorIndex}`);
        used.add(accessor.bufferView);
      }
    }
  }
  return [...used].reduce((sum, index) => sum + gltf.bufferViews[index].byteLength, 0);
}

async function decodedGeometryBytes() {
  let total = 0;
  for (const asset of ASSET_LIST.filter((entry) => entry.runtimeRequired && ['stl', 'glb-components'].includes(entry.runtime.type))) {
    if (asset.runtime.type === 'stl') {
      const bytes = await readFile(path.join(sourceRoot, asset.source.path));
      assert.ok(bytes.length >= 84, `${asset.source.path} must be binary STL`);
      const triangles = bytes.readUInt32LE(80);
      assert.equal(84 + triangles * 50, bytes.length, `${asset.source.path} binary STL length drift`);
      total += triangles * 3 * 3 * 4 * 2; // STLLoader: non-indexed position + normal Float32 arrays.
    } else {
      const runtimePath = asset.runtime.url.split('?')[0].replace(/^\//, '');
      const bytes = await readFile(path.join(repoRoot, 'web', runtimePath));
      total += glbDecodedGeometryBytes(bytes);
    }
  }
  return total;
}

async function decodedTextureBytes() {
  let total = 0;
  for (const asset of ASSET_LIST.filter((entry) => entry.runtime.type === 'png')) {
    const bytes = await readFile(path.join(sourceRoot, asset.source.path));
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG', `${asset.source.path} must be PNG`);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    total += width * height * 4;
  }
  return total;
}

test('representative mobile profile is fixed and DPR rendering remains capped', () => {
  assert.deepEqual(
    [REPRESENTATIVE_MOBILE_PROFILE.width, REPRESENTATIVE_MOBILE_PROFILE.height],
    [390, 844],
  );
  assert.equal(REPRESENTATIVE_MOBILE_PROFILE.deviceScaleFactor, 2);
  assert.equal(REPRESENTATIVE_MOBILE_PROFILE.rendererDprCap, 1.5);
  assert.equal(REPRESENTATIVE_MOBILE_PROFILE.cpuThrottleRate, 4);
  assert.equal(REPRESENTATIVE_MOBILE_PROFILE.downloadKbps, 1600);
  assert.equal(REPRESENTATIVE_MOBILE_PROFILE.latencyMs, 150);
});

test('current runtime transfer bytes stay under hard regression ceilings', () => {
  const boot = groupBytes('boot-critical');
  const scene = groupBytes('scene-critical');
  const optional = groupBytes('optional');
  assert.ok(boot + scene <= PERFORMANCE_REGRESSION_CEILINGS.requiredAssetBodyBytes);
  assert.ok(optional <= PERFORMANCE_REGRESSION_CEILINGS.optionalAssetBodyBytes);
  assert.ok(boot + scene + optional <= PERFORMANCE_REGRESSION_CEILINGS.allAssetBodyBytes);
});

test('current decoded geometry and optional texture footprint stay under hard ceilings', async () => {
  const geometry = await decodedGeometryBytes();
  const textures = await decodedTextureBytes();
  assert.ok(geometry <= PERFORMANCE_REGRESSION_CEILINGS.decodedRequiredGeometryBytes, `decoded geometry ${geometry}`);
  assert.ok(textures <= PERFORMANCE_REGRESSION_CEILINGS.decodedOptionalTextureRgba8Bytes, `decoded textures ${textures}`);
});

test('cutover targets are strictly stronger than current regression ceilings where optimization is required', () => {
  for (const key of [
    'requiredAssetBodyBytes',
    'startupEncodedBytes',
    'decodedRequiredGeometryBytes',
    'decodedOptionalTextureRgba8Bytes',
    'criticalAssetsReadyMs',
    'firstInteractiveMs',
    'firstVisibleFrameMs',
    'triangles',
  ]) {
    assert.ok(PERFORMANCE_CUTOVER_TARGETS[key] < PERFORMANCE_REGRESSION_CEILINGS[key], `${key} cutover target must be tighter`);
  }
  assert.equal(PERFORMANCE_CUTOVER_TARGETS.drawCalls, PERFORMANCE_REGRESSION_CEILINGS.drawCalls);
});

test('browser probe owns throttled timing/GPU enforcement instead of production runtime', async () => {
  const probe = await readFile(path.join(repoRoot, 'scripts/measure-threejs-performance.mjs'), 'utf8');
  const boot = await readFile(path.join(repoRoot, 'web/app/boot/boot.js'), 'utf8');
  assert.match(probe, /Network\.emulateNetworkConditions/);
  assert.match(probe, /Emulation\.setCPUThrottlingRate/);
  assert.match(probe, /PERFORMANCE_REGRESSION_CEILINGS/);
  assert.match(probe, /rendererInfo\.render\.calls/);
  assert.match(probe, /decodedRequiredGeometryBytes/);
  assert.doesNotMatch(boot, /PERFORMANCE_REGRESSION_CEILINGS|PERFORMANCE_CUTOVER_TARGETS/);
});
