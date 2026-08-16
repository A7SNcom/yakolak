import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectedTriangleComponents, parseStl } from './lib/stl-glb-converter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(repoRoot, 'YAKOLAK_PORTABLE_KIT/assets/models/board-and-lid.stl');
const bytes = await readFile(sourcePath);
const stl = parseStl(bytes);
const components = connectedTriangleComponents(stl);

function boundsForTriangles(triangles) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const triangle of triangles) {
    const base = triangle * 9;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const scalar = base + vertex * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = stl.positions[scalar + axis];
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
  }
  const size = min.map((value, axis) => max[axis] - value);
  const center = min.map((value, axis) => (value + max[axis]) / 2);
  return { min, max, size, center };
}

const records = components.map((triangles, index) => ({
  index,
  name: `board-and-lid#component-${String(index).padStart(3, '0')}`,
  triangles: triangles.length,
  ...boundsForTriangles(triangles),
}));

const global = boundsForTriangles(Array.from({ length: stl.triangleCount }, (_, index) => index));
const report = {
  sourceBytes: bytes.byteLength,
  triangleCount: stl.triangleCount,
  componentCount: components.length,
  global,
  components: records,
};

console.log('THREEJS018_GEOMETRY_BEGIN');
console.log(JSON.stringify(report, null, 2));
console.log('THREEJS018_GEOMETRY_END');
