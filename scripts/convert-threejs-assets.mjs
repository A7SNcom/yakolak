import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAssetConversionPipeline } from './lib/asset-conversion-pipeline.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portableManifestPath = 'YAKOLAK_PORTABLE_KIT/assets/manifest.json';
const statePath = 'web/assets/models/conversion-state.json';
const portable = JSON.parse(await readFile(path.join(repoRoot, portableManifestPath), 'utf8'));

const outputBySource = Object.freeze({
  'models/board-and-lid.stl': ['model.board-and-lid', 'web/assets/models/board-and-lid.glb'],
  'models/player-base.stl': ['model.player-base', 'web/assets/models/player-base.glb'],
  'models/piece-small.stl': ['model.piece-small', 'web/assets/models/piece-small.glb'],
  'models/piece-medium.stl': ['model.piece-medium', 'web/assets/models/piece-medium.glb'],
  'models/piece-large.stl': ['model.piece-large', 'web/assets/models/piece-large.glb'],
  'models/score-marker.stl': ['model.score-marker', 'web/assets/models/score-marker.glb'],
});

const canonicalStlPaths = portable.assets.filter((asset) => asset.path.endsWith('.stl')).map((asset) => asset.path).sort();
const plannedStlPaths = Object.keys(outputBySource).sort();
if (JSON.stringify(canonicalStlPaths) !== JSON.stringify(plannedStlPaths)) {
  throw new Error(`STL conversion plan drift. Canonical=${canonicalStlPaths.join(', ')} planned=${plannedStlPaths.join(', ')}`);
}

const plan = canonicalStlPaths.map((sourcePath) => {
  const [logicalId, outputPath] = outputBySource[sourcePath];
  return Object.freeze({ logicalId, sourcePath: `YAKOLAK_PORTABLE_KIT/assets/${sourcePath}`, outputPath });
});

const args = process.argv.slice(2);
const mode = args.includes('--check') ? 'check' : 'convert';
const force = args.includes('--force');
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map((value) => value.trim()).filter(Boolean) : null;
const unknown = args.filter((arg) => arg !== '--check' && arg !== '--force' && !arg.startsWith('--only='));
if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);

const summary = await runAssetConversionPipeline({ repoRoot, plan, statePath, mode, force, only });
if (mode === 'check') {
  console.log(`Verified ${summary.checked.length} deterministic committed GLB asset(s)`);
} else {
  console.log(`Converted ${summary.converted.length}; skipped unchanged ${summary.skipped.length}`);
  if (summary.converted.length) console.log(`Converted: ${summary.converted.join(', ')}`);
}
