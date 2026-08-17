import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveNeutralRoomLayout,
  parseDefinitiveRoomSpec,
  pointInsideRoom,
  validateScriptedCameraTravel,
} from '../web/app/scene/room-layout.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = (...segments) => readFile(path.join(repoRoot, ...segments), 'utf8');
const readJson = async (...segments) => JSON.parse(await readText(...segments));

const [roomSpecText, worldLayout, approvedContract, runtimeSource] = await Promise.all([
  readText('YAKOLAK_PORTABLE_KIT', 'assets', 'room', 'ROOM.md'),
  readJson('YAKOLAK_PORTABLE_KIT', 'assets', 'layout', 'world-layout.json'),
  readJson('YAKOLAK_PORTABLE_KIT', 'assets', 'reference', 'approved-contract.json'),
  readText('web', 'app', 'scene', 'neutral-room.js'),
]);

const parsed = parseDefinitiveRoomSpec(roomSpecText);
assert.deepEqual(parsed, {
  minX: -2400,
  maxX: 2400,
  floorY: -650,
  ceilingY: 1250,
  backZ: -2400,
  frontZ: 2400,
  tableTopY: -16,
  gameClearance: 0.8,
  backContentZ: -2386,
  rightContentX: 2386,
});

const layout = deriveNeutralRoomLayout({ worldLayout, approvedContract, roomSpecText });
assert.deepEqual(layout.bounds, {
  minX: -2400,
  maxX: 2400,
  floorY: -650,
  ceilingY: 1250,
  backZ: -2400,
  frontZ: 2400,
});
assert.deepEqual(layout.dimensions, { width: 4800, height: 1900, depth: 4800 });
assert.deepEqual(layout.center, [0, 300, 0]);
assert.deepEqual(layout.palette, { wall: '#f7f7f4', floor: '#deddd7' });
assert.deepEqual(layout.matte, { metalness: 0, roughness: 1 });
assert.equal(layout.tableTopY, -16);
assert.equal(layout.gameClearance, 0.8);
assert.equal(layout.frontWallVisibleDefault, true);
assert.equal(layout.wallContent.inset, 14);
assert.deepEqual(layout.wallContent.back.position, [0, 300, -2386]);
assert.deepEqual(layout.wallContent.right.position, [2386, 300, 0]);
assert.deepEqual(layout.surfaceIds, ['floor', 'ceiling', 'back', 'front', 'left', 'right']);
assert.equal(layout.voidSafety.enclosedSurfaceCount, 6);
assert.equal(layout.voidSafety.defaultFrontWallVisible, true);

assert.equal(Object.keys(worldLayout.cameras).length, 16);
for (const [name, camera] of Object.entries(worldLayout.cameras)) {
  assert.ok(pointInsideRoom(camera.position, layout.bounds), `${name} position must remain inside room`);
  assert.ok(pointInsideRoom(camera.target, layout.bounds), `${name} target must remain inside room`);
}
const travel = validateScriptedCameraTravel(worldLayout.cameras, layout.bounds, 129);
assert.equal(travel.cameraCount, 16);
assert.equal(travel.travel.length, 10);
assert.ok(travel.travel.every((entry) => entry.samples === 129));

assert.match(roomSpecText, /Build a neutral enclosed room from six surfaces; no imported room mesh is required\./);
assert.match(runtimeSource, /new THREE\.PlaneGeometry\(dimensions\.width, dimensions\.depth, 1, 1\)/);
assert.match(runtimeSource, /new THREE\.PlaneGeometry\(dimensions\.width, dimensions\.height, 1, 1\)/);
assert.equal((runtimeSource.match(/(?:floor|ceiling|back|front|left|right): addSurface\(root,/g) || []).length, 6, 'runtime must create exactly six room surfaces');
assert.doesNotMatch(runtimeSource, /GLTFLoader|STLLoader|OBJLoader|room-plan\.svg/, 'room runtime must not import a historical or guide mesh');
assert.match(runtimeSource, /roughness:\s*1/);
assert.match(runtimeSource, /metalness:\s*0/);
assert.match(runtimeSource, /surfaces\.front\.visible = layout\.frontWallVisibleDefault/);
assert.match(runtimeSource, /layout\.wallContent\.back\.position/);
assert.match(runtimeSource, /layout\.wallContent\.right\.position/);

console.log('THREEJS022_VERIFY_BEGIN');
console.log(JSON.stringify({
  bounds: layout.bounds,
  dimensions: layout.dimensions,
  center: layout.center,
  palette: layout.palette,
  matte: layout.matte,
  frontWallVisibleDefault: layout.frontWallVisibleDefault,
  wallContent: layout.wallContent,
  cameras: {
    count: travel.cameraCount,
    scriptedTravelPairs: travel.travel.length,
    samplesPerTravel: 129,
    allEndpointsInside: true,
    allInterpolatedSamplesInside: true,
  },
  voidSafety: layout.voidSafety,
}, null, 2));
console.log('THREEJS022_VERIFY_OK');
