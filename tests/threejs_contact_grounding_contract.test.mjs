import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(file) {
  return readFile(path.join(repoRoot, file), 'utf8');
}

test('THREEJS-026 contact grounding stays single-pass, registry-owned and shadow-map free', async () => {
  const [preview, lighting, renderer] = await Promise.all([
    source('web/app/scene/preview-scene.js'),
    source('web/app/scene/lighting-rig.js'),
    source('web/app/scene/renderer.js'),
  ]);

  assert.match(preview, /mode:\s*'single-transparent-ellipse'/);
  assert.match(preview, /segments:\s*24/);
  assert.match(preview, /extraLightCount:\s*0/);
  assert.match(preview, /shadowMap:\s*false/);
  assert.match(preview, /renderTarget:\s*false/);
  assert.match(preview, /texture:\s*false/);
  assert.match(preview, /new THREE\.CircleGeometry\(1, CONTACT_GROUNDING_POLICY\.segments\)/);
  assert.match(preview, /new THREE\.MeshBasicMaterial\(/);
  assert.match(preview, /kind:\s*RESOURCE_KINDS\.GEOMETRY/);
  assert.match(preview, /kind:\s*RESOURCE_KINDS\.MATERIAL_VARIANT/);
  assert.match(preview, /ownership:\s*RESOURCE_OWNERSHIP\.TRANSIENT/);
  assert.doesNotMatch(preview, /new THREE\.(?:Ambient|Hemisphere|Directional|Point|Spot|RectArea)Light/);
  assert.doesNotMatch(preview, /WebGLRenderTarget/);

  const lightConstructors = lighting.match(/new THREE\.(?:HemisphereLight|DirectionalLight)\(/g) || [];
  assert.equal(lightConstructors.length, 3, 'THREEJS-025 must remain exactly three neutral lights');
  assert.match(lighting, /neutralLightCount:\s*3/);
  assert.match(lighting, /shadows:\s*false/);
  assert.match(renderer, /renderer\.shadowMap\.enabled\s*=\s*false/);
});
