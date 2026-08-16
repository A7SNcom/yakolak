import test from 'node:test';
import assert from 'node:assert/strict';

import rules from '../rules/yakolak-rules.json' with { type: 'json' };
import kitContract from '../YAKOLAK_PORTABLE_KIT/assets/reference/approved-contract.json' with { type: 'json' };
import worldLayout from '../YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json' with { type: 'json' };

const PLAYABLE_COLORS = ['marble', 'blue', 'gold', 'green'];
const SPATIAL_RING = ['right', 'back', 'left', 'front'];
const SPATIAL_IDENTITIES = {
  right: 'marble',
  back: 'blue',
  left: 'gold',
  front: 'green',
};

test('THREEJS-005 uses one canonical playable color identity', () => {
  assert.deepEqual(rules.colors, PLAYABLE_COLORS);
  assert.deepEqual(kitContract.rules.colors, PLAYABLE_COLORS);
  assert.deepEqual(kitContract.colorIdentity.canonicalPlayableIds, PLAYABLE_COLORS);
  assert.deepEqual(kitContract.rules.turnRing, PLAYABLE_COLORS);

  assert.equal(rules.colors.includes('white'), false);
  assert.equal(kitContract.rules.colors.includes('white'), false);
  assert.equal(kitContract.colorIdentity.canonicalPlayableIds.includes('white'), false);
  assert.equal(kitContract.rules.turnRing.includes('white'), false);
});

test('white marble is presentation for marble, not another playable color', () => {
  assert.deepEqual(kitContract.colorIdentity.displayMaterial.marble, {
    displayName: 'white marble',
    materialKey: 'marble',
  });

  assert.equal(Object.hasOwn(kitContract.colorIdentity.displayMaterial, 'white'), false);
  assert.equal(Object.hasOwn(kitContract.materials.palette, 'marble'), true);
  assert.equal(Object.hasOwn(kitContract.materials.palette, 'white'), false);
});

test('right/back/left/front mapping and fixed turn ring stay unchanged', () => {
  assert.deepEqual(worldLayout.identities, SPATIAL_IDENTITIES);
  assert.deepEqual(worldLayout.turnRing, SPATIAL_RING);
  assert.deepEqual(worldLayout.turnRing.map(side => worldLayout.identities[side]), PLAYABLE_COLORS);
});

test('intro identity remains right/left/front/back with marble on the right', () => {
  assert.deepEqual(worldLayout.introOrder, ['right', 'left', 'front', 'back']);
  assert.deepEqual(kitContract.rules.introOrder, ['marble', 'gold', 'green', 'blue']);
  assert.equal(worldLayout.identities.right, 'marble');
});
