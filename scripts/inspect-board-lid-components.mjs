import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectedTriangleComponents, parseStl } from './lib/stl-glb-converter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(repoRoot, 'YAKOLAK_PORTABLE_KIT/assets/models/board-and-lid.stl');
const bytes = await readFile(sourcePath);
const stl = parseStl(bytes);
const components = connectedTriangleComponents(stl);

function round(value) {
  return Number(value.toFixed(6));
}

function componentReport(triangles, componentIndex) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let scalarVertices = 0;
  const unique = new Set();

  for (const triangle of triangles) {
    const base = triangle * 9;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const offset = base + vertex * 3;
      const position = [stl.positions[offset], stl.positions[offset + 1], stl.positions[offset + 2]];
      unique.add(position.join(','));
      scalarVertices += 1;
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], position[axis]);
        max[axis] = Math.max(max[axis], position[axis]);
      }
    }
  }

  const center = min.map((value, axis) => (value + max[axis]) / 2);
  const size = min.map((value, axis) => max[axis] - value);
  return Object.freeze({
    componentIndex,
    nodeName: `board-and-lid#component-${String(componentIndex).padStart(3, '0')}`,
    triangleCount: triangles.length,
    emittedVertexReferences: scalarVertices,
    uniquePositionCount: unique.size,
    min: min.map(round),
    max: max.map(round),
    center: center.map(round),
    size: size.map(round),
  });
}

const report = components.map(componentReport);
const globalMin = [Infinity, Infinity, Infinity];
const globalMax = [-Infinity, -Infinity, -Infinity];
for (const component of report) {
  for (let axis = 0; axis < 3; axis += 1) {
    globalMin[axis] = Math.min(globalMin[axis], component.min[axis]);
    globalMax[axis] = Math.max(globalMax[axis], component.max[axis]);
  }
}

console.log(`THREEJS-018_COMPONENTS ${JSON.stringify({
  triangleCount: stl.triangleCount,
  componentCount: report.length,
  globalBounds: {
    min: globalMin.map(round),
    max: globalMax.map(round),
    size: globalMin.map((value, axis) => round(globalMax[axis] - value)),
  },
  components: report,
})}`);
