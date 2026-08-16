import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_LIST, PORTABLE_MANIFEST } from '../web/app/assets/asset-manifest.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repoRoot, 'YAKOLAK_PORTABLE_KIT/assets');
const outputRoot = path.join(repoRoot, 'web/runtime-assets');

function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

const manifestBytes = await readFile(path.join(repoRoot, PORTABLE_MANIFEST.path));
const manifestSha = gitBlobSha(manifestBytes);
if (manifestSha !== PORTABLE_MANIFEST.gitBlobSha) {
  throw new Error(`Definitive portable manifest drift: expected ${PORTABLE_MANIFEST.gitBlobSha}, got ${manifestSha}`);
}

const portable = JSON.parse(manifestBytes.toString('utf8'));
const portableByPath = new Map(portable.assets.map((entry) => [entry.path, entry]));
const runtimePaths = new Set(ASSET_LIST.map((entry) => entry.source.path));
if (portableByPath.size !== runtimePaths.size || [...portableByPath.keys()].some((assetPath) => !runtimePaths.has(assetPath))) {
  throw new Error('Runtime manifest asset list does not exactly match the definitive portable manifest');
}

await rm(outputRoot, { recursive: true, force: true });

for (const asset of ASSET_LIST) {
  const portableEntry = portableByPath.get(asset.source.path);
  if (!portableEntry) throw new Error(`Missing portable asset entry: ${asset.source.path}`);
  if (Boolean(portableEntry.required) !== asset.source.required) throw new Error(`Required flag drift: ${asset.source.path}`);
  if (asset.runtimeRequired !== asset.source.required) throw new Error(`Runtime required flag drift: ${asset.source.path}`);

  const sourcePath = path.join(sourceRoot, asset.source.path);
  const bytes = await readFile(sourcePath);
  if (bytes.byteLength !== asset.source.bytes) {
    throw new Error(`Byte-size drift for ${asset.source.path}: expected ${asset.source.bytes}, got ${bytes.byteLength}`);
  }
  const actualSha = gitBlobSha(bytes);
  if (actualSha !== asset.source.gitBlobSha) {
    throw new Error(`Immutable hash drift for ${asset.source.path}: expected ${asset.source.gitBlobSha}, got ${actualSha}`);
  }

  const outputPath = path.join(outputRoot, asset.source.path);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
}

console.log(`Prepared ${ASSET_LIST.length} verified runtime assets from ${PORTABLE_MANIFEST.path}`);
