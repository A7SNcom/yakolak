import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(path.join(root, 'web/index.html'), 'utf8');
const boot = readFileSync(path.join(root, 'web/app/boot/local-game-boot.js'), 'utf8');
const scene = readFileSync(path.join(root, 'web/app/scene/local-game-scene.js'), 'utf8');

assert.match(index, /app\/boot\/local-game-boot\.js/);
assert.doesNotMatch(index, /app\/boot\/boot\.js/);
assert.match(boot, /createLocalGameScene/);
assert.doesNotMatch(boot, /createPreviewScene|preview-scene/);

for (const required of [
  'createNeutralRoom',
  'createTableSurface',
  'createBoardAndLidObjects',
  'createPlayerBaseInstances',
  'createPieceInstances',
  'createTapClickConfirmationController',
  'createDragInteractionController',
  'createPointerEventsAdapter',
  'createLocalAuthorityAdapter',
  'createComputerTurnProducer',
  'createExpiredLocalTimeoutIntent',
  'createMotionController',
  'createAcceptedPieceTravelController',
]) assert.match(scene, new RegExp(required));

assert.match(scene, /targetPlayers:\s*2/);
assert.match(scene, /type:\s*index === 0 \? 'human' : 'computer'/);
assert.match(scene, /pointerAdapter\.setGameplayGestureOwnership\(true\)/);
assert.match(scene, /pieces\.syncPieceToBoard/);
assert.match(scene, /createExpiredLocalTimeoutIntent\(state/);
assert.match(boot, /fastplayScene\s*=\s*'real-local-game'/);
assert.doesNotMatch(`${index}\n${boot}\n${scene}`, /TorusKnotGeometry|TorusGeometry|RingGeometry/);
assert.doesNotMatch(scene, /cloudflare|turso|invitation|websocket/i);

console.log('FASTPLAY-001 real local game scene contract: PASS');
