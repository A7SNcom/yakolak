import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  BOARD_ZONE_TOUCH_RADIUS,
  GAMEPLAY_INTERACTION_LAYER,
  INTERACTION_PROXY_HEIGHT,
  createInteractionStateStore,
  deriveGameplayInteractionTargets,
} from '../web/app/gameplay/interaction-targets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worldLayout = JSON.parse(readFileSync(
  path.join(root, 'YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json'),
  'utf8',
));

const layout = deriveGameplayInteractionTargets(worldLayout);
assert.equal(GAMEPLAY_INTERACTION_LAYER, 31);
assert.equal(BOARD_ZONE_TOUCH_RADIUS, 42);
assert.equal(INTERACTION_PROXY_HEIGHT, 6);
assert.equal(layout.layer, 31);
assert.equal(layout.boardZoneTouchRadius, 42, 'board interaction proxy uses the portable-kit forgiving touch radius');
assert.equal(layout.stackTouchRadius, 24, 'stack touch radius derives from half the 48-unit nearest stack spacing');
assert.equal(layout.zones.length, 9);
assert.equal(layout.stacks.length, 12);
assert.equal(layout.targets.length, 21);
assert(Object.isFrozen(layout));
assert(Object.isFrozen(layout.targets));

assert.deepEqual(layout.zones.map(target => [target.id, target.cellId, target.center]), [
  ['board:0', 0, [-48, 2, -48]],
  ['board:1', 1, [0, 2, -48]],
  ['board:2', 2, [48, 2, -48]],
  ['board:3', 3, [-48, 2, 0]],
  ['board:4', 4, [0, 2, 0]],
  ['board:5', 5, [48, 2, 0]],
  ['board:6', 6, [-48, 2, 48]],
  ['board:7', 7, [0, 2, 48]],
  ['board:8', 8, [48, 2, 48]],
]);

assert.deepEqual(layout.stacks.map(target => target.id), [
  'stack:right:0', 'stack:right:1', 'stack:right:2',
  'stack:back:0', 'stack:back:1', 'stack:back:2',
  'stack:left:0', 'stack:left:1', 'stack:left:2',
  'stack:front:0', 'stack:front:1', 'stack:front:2',
]);
assert.deepEqual(layout.stacks.find(target => target.id === 'stack:right:0').center, [135, 2, -48]);
assert.deepEqual(layout.stacks.find(target => target.id === 'stack:back:2').center, [48, 2, -135]);
assert(layout.targets.every(target => target.height === 6));

// Interaction state is independent data; no descriptor/material mutation is needed
// to represent hover, press or focus.
const store = createInteractionStateStore(layout.targets);
assert.deepEqual(store.get('board:4'), {
  targetId: 'board:4', hovered: false, pressed: false, focused: false,
});
const originalDescriptor = JSON.stringify(layout.zones[4]);
assert.deepEqual(store.set('board:4', { hovered: true, focused: true }), {
  targetId: 'board:4', hovered: true, pressed: false, focused: true,
});
assert.equal(JSON.stringify(layout.zones[4]), originalDescriptor, 'interaction state cannot mutate target geometry/descriptor');
assert.deepEqual(store.set('board:4', { pressed: true }), {
  targetId: 'board:4', hovered: true, pressed: true, focused: true,
});
assert.throws(() => store.set('board:4', { visible: true }), /invalid_interaction_state_key/);
assert.throws(() => store.set('board:4', { hovered: 1 }), /invalid_interaction_state_value/);
assert.equal(store.get('missing'), null);

store.register('control:confirm');
assert.deepEqual(store.set('control:confirm', { focused: true }), {
  targetId: 'control:confirm', hovered: false, pressed: false, focused: true,
});
store.unregister('control:confirm');
assert.equal(store.get('control:confirm'), null);

// The source module deliberately avoids any visible-material vocabulary. Visual
// feedback belongs to later presentation code and must consume this state explicitly.
const interactionSource = readFileSync(path.join(root, 'web/app/gameplay/interaction-targets.js'), 'utf8');
assert.doesNotMatch(interactionSource, /MeshStandardMaterial|MeshBasicMaterial|material\.color|emissive|opacity\s*=/);

console.log('THREEJS-031 interaction targets contract: PASS');
