import assert from 'node:assert/strict';
import { MeshBasicMaterial, Raycaster, SphereGeometry, Vector3 } from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createPieceInstances } from '../web/app/scene/pieces.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worldLayout = JSON.parse(readFileSync(path.join(root, 'YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json'), 'utf8'));
const approvedContract = JSON.parse(readFileSync(path.join(root, 'YAKOLAK_PORTABLE_KIT/assets/reference/approved-contract.json'), 'utf8'));

function runtimeAsset(radius) {
  const geometry = new SphereGeometry(radius, 24, 16);
  geometry.userData.sourceBounds = {
    min: [-radius, -radius, 0],
    max: [radius, radius, radius * 2],
  };
  return {
    format: 'yakolak-glb-components-v1',
    components: [{ geometry }],
    getComponent() { return { geometry }; },
  };
}

function resourceRegistry() {
  return {
    createScope() {
      const cleanups = [];
      return {
        register() {},
        registerCleanup(cleanup) { cleanups.push(cleanup); },
        release() {
          while (cleanups.length) cleanups.pop()();
          return true;
        },
      };
    },
  };
}

const materialsByColor = Object.fromEntries(
  approvedContract.rules.colors.map(color => [color, new MeshBasicMaterial()]),
);
const pieces = createPieceInstances({
  runtimeAssetsBySize: {
    small: runtimeAsset(2),
    medium: runtimeAsset(4),
    large: runtimeAsset(6),
  },
  worldLayout,
  approvedContract,
  materialsByColor,
  resourceRegistry: resourceRegistry(),
});
pieces.root.updateMatrixWorld(true);

const stackCenter = new Vector3(...worldLayout.homeStacks.right[0]);
const raycaster = new Raycaster();
raycaster.ray.origin.copy(stackCenter).add(new Vector3(0, 100, 0));
raycaster.ray.direction.set(0, -1, 0);

const centerHits = raycaster.intersectObject(pieces.root, true)
  .filter(hit => hit.object?.userData?.colorId === 'marble' && hit.instanceId === 0);
assert(centerHits.length >= 3, 'fixture must intersect all three nested marble sizes');
assert.equal(centerHits[0].object.userData.size, 'small', 'visible inner marble/small must win a center click/tap');

raycaster.ray.origin.copy(stackCenter).add(new Vector3(5, 100, 0));
raycaster.ray.direction.set(0, -1, 0);
const rimHits = raycaster.intersectObject(pieces.root, true)
  .filter(hit => hit.object?.userData?.colorId === 'marble' && hit.instanceId === 0);
assert(rimHits.length >= 1, 'fixture must intersect the large outer rim');
assert.equal(rimHits[0].object.userData.size, 'large', 'large-only rim hit must remain large');

pieces.release();
for (const material of Object.values(materialsByColor)) material.dispose();
console.log('GAMEPREP-001 nested first-piece picking: PASS');
