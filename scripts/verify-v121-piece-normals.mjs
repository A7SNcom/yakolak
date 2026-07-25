import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [policy, app, version, index] = await Promise.all([
  readFile(new URL('../src/piece-normals-v121.js', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../version.json', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8')
]);

assert.match(policy, /innerWidth <= 900/, 'v121 must remain mobile-only');
assert.match(policy, /CREASE_ANGLE_DEGREES = 55/, 'v121 crease angle changed unexpectedly');
assert.match(policy, /toCreasedNormals\(source, CREASE_ANGLE_RADIANS\)/, 'creased normals helper missing');
assert.match(policy, /before\.positions !== after\.positions \|\| before\.triangles !== after\.triangles/, 'geometry-cost guard missing');
assert.match(policy, /geometry\.setAttribute\('normal', normal\.clone\(\)\)/, 'normal-only update missing');
assert.match(policy, /unchangedRenderCost/, 'render-cost evidence missing');
assert.doesNotMatch(policy, /MeshPhysicalMaterial|clearcoat|normalMap|bumpMap|displacementMap/, 'v121 must not add a more expensive material path');
assert.doesNotMatch(policy, /setPixelRatio|antialias|shadowMap|new THREE\.(?:PointLight|DirectionalLight|SpotLight|HemisphereLight|AmbientLight)/, 'v121 must not change DPR, antialiasing, shadows, or lights');

assert.ok(app.indexOf('piece-normals-v121.js') > app.indexOf('app-game-v114.js'), 'v121 normals must load after game geometry');
assert.ok(app.indexOf('piece-normals-v121.js') < app.indexOf('online-rounds-v118.js'), 'v121 normals must complete before online play starts');
assert.match(app, /const BUILD='121'/, 'app build is not 121');
assert.match(version, /"build": 121/, 'version metadata is not Build 121');
assert.match(version, /v121-mobile-piece-normals/, 'version name missing');
assert.match(index, /content="v121-mobile-piece-normals"/, 'index version marker missing');
assert.match(index, /const BUILD='121'/, 'index build is not 121');

console.log('v121 mobile piece normals contract passed');
