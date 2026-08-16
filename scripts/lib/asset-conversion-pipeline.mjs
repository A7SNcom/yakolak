import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONVERTER_ID, CONVERTER_VERSION, gitBlobSha1, sha256, stlToGlb } from './stl-glb-converter.mjs';

export const STATE_SCHEMA_VERSION = 1;

function stableState(targets) {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    converter: { id: CONVERTER_ID, version: CONVERTER_VERSION, node: '22.x' },
    targets: Object.fromEntries(Object.entries(targets).sort(([a], [b]) => a.localeCompare(b))),
  };
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function readState(statePath) {
  if (!(await exists(statePath))) return stableState({});
  const parsed = JSON.parse(await readFile(statePath, 'utf8'));
  if (parsed.schemaVersion !== STATE_SCHEMA_VERSION) throw new Error(`Unsupported conversion state schema: ${parsed.schemaVersion}`);
  return stableState(parsed.targets || {});
}

async function atomicWrite(filePath, bytes) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  try {
    await writeFile(tempPath, bytes);
    await rename(tempPath, filePath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

function normalizePlan(plan) {
  const ids = new Set();
  return plan.map((entry) => {
    if (!entry.logicalId || !entry.sourcePath || !entry.outputPath) throw new TypeError('Conversion plan entries require logicalId, sourcePath and outputPath');
    if (ids.has(entry.logicalId)) throw new Error(`Duplicate conversion logicalId: ${entry.logicalId}`);
    ids.add(entry.logicalId);
    if (!entry.sourcePath.endsWith('.stl')) throw new Error(`Only canonical STL sources may be converted by this pipeline: ${entry.sourcePath}`);
    if (!entry.outputPath.endsWith('.glb')) throw new Error(`Runtime conversion output must be GLB: ${entry.outputPath}`);
    if (entry.convert !== undefined && typeof entry.convert !== 'function') throw new TypeError(`Conversion profile for ${entry.logicalId} must be a function`);
    if (entry.profileId !== undefined && (typeof entry.profileId !== 'string' || !entry.profileId)) throw new TypeError(`Conversion profile ID for ${entry.logicalId} must be a non-empty string`);
    return Object.freeze({ ...entry });
  });
}

function entrySignature({ logicalId, sourcePath, outputPath, profileId, sourceSha256, sourceGitBlobSha1, sourceBytes }) {
  return {
    logicalId,
    sourcePath,
    outputPath,
    ...(profileId ? { conversionProfile: profileId } : {}),
    sourceSha256,
    sourceGitBlobSha1,
    sourceBytes,
    converter: { id: CONVERTER_ID, version: CONVERTER_VERSION, node: '22.x' },
  };
}

async function outputMatches(outputPath, expectedSha256) {
  if (!expectedSha256 || !(await exists(outputPath))) return false;
  return sha256(await readFile(outputPath)) === expectedSha256;
}

function sameInputSignature(previous, current) {
  return Boolean(previous)
    && previous.sourceSha256 === current.sourceSha256
    && previous.sourceGitBlobSha1 === current.sourceGitBlobSha1
    && previous.sourceBytes === current.sourceBytes
    && previous.sourcePath === current.sourcePath
    && previous.outputPath === current.outputPath
    && (previous.conversionProfile || null) === (current.conversionProfile || null)
    && previous.converter?.id === current.converter.id
    && previous.converter?.version === current.converter.version
    && previous.converter?.node === current.converter.node;
}

export class AssetConversionCheckError extends Error {
  constructor(stale) {
    super(`Asset conversion outputs are stale or missing: ${stale.map((entry) => entry.logicalId).join(', ')}`);
    this.name = 'AssetConversionCheckError';
    this.stale = Object.freeze(stale);
  }
}

export async function runAssetConversionPipeline({
  repoRoot,
  plan,
  statePath,
  mode = 'convert',
  force = false,
  only = null,
} = {}) {
  if (!repoRoot) throw new TypeError('repoRoot is required');
  if (!statePath) throw new TypeError('statePath is required');
  if (!['convert', 'check'].includes(mode)) throw new TypeError(`Unsupported conversion mode: ${mode}`);

  const normalizedPlan = normalizePlan(plan || []);
  const selected = only?.length ? normalizedPlan.filter((entry) => only.includes(entry.logicalId)) : normalizedPlan;
  if (only?.length) {
    const missing = only.filter((id) => !normalizedPlan.some((entry) => entry.logicalId === id));
    if (missing.length) throw new Error(`Unknown conversion target(s): ${missing.join(', ')}`);
  }

  const absoluteStatePath = path.resolve(repoRoot, statePath);
  const state = await readState(absoluteStatePath);
  const nextTargets = { ...state.targets };
  const summary = { converted: [], skipped: [], checked: [], stale: [] };

  for (const target of selected) {
    const absoluteSource = path.resolve(repoRoot, target.sourcePath);
    const absoluteOutput = path.resolve(repoRoot, target.outputPath);
    const sourceBytes = await readFile(absoluteSource);
    const sourceSignature = entrySignature({
      ...target,
      sourceSha256: sha256(sourceBytes),
      sourceGitBlobSha1: gitBlobSha1(sourceBytes),
      sourceBytes: sourceBytes.byteLength,
    });
    const previous = state.targets[target.logicalId] || null;
    const currentOutputMatches = await outputMatches(absoluteOutput, previous?.outputSha256);
    const upToDate = !force && sameInputSignature(previous, sourceSignature) && currentOutputMatches;

    if (mode === 'check') {
      if (!upToDate) summary.stale.push({ logicalId: target.logicalId, sourcePath: target.sourcePath, outputPath: target.outputPath });
      else summary.checked.push(target.logicalId);
      continue;
    }

    if (upToDate) {
      summary.skipped.push(target.logicalId);
      continue;
    }

    const convert = target.convert || stlToGlb;
    const converted = convert(sourceBytes, {
      sourcePath: target.sourcePath,
      sourceGitBlobSha1: sourceSignature.sourceGitBlobSha1,
    });
    await atomicWrite(absoluteOutput, converted.glb);
    nextTargets[target.logicalId] = {
      ...sourceSignature,
      outputSha256: converted.outputSha256,
      outputBytes: converted.outputBytes,
      triangleCount: converted.provenance.geometry.triangleCount,
      componentCount: converted.provenance.geometry.componentCount,
      transformPolicy: converted.provenance.geometry.transformPolicy,
      normalPolicy: converted.provenance.geometry.normalPolicy,
      componentPolicy: converted.provenance.geometry.componentPolicy,
      ...(converted.provenance.geometry.semanticProfile ? { semanticProfile: converted.provenance.geometry.semanticProfile } : {}),
      ...(converted.provenance.geometry.sourcePivot ? { sourcePivot: converted.provenance.geometry.sourcePivot } : {}),
      ...(converted.provenance.geometry.pivotPolicy ? { pivotPolicy: converted.provenance.geometry.pivotPolicy } : {}),
    };
    summary.converted.push(target.logicalId);
  }

  if (mode === 'check') {
    if (summary.stale.length) throw new AssetConversionCheckError(summary.stale);
    return Object.freeze(summary);
  }

  await atomicWrite(absoluteStatePath, `${JSON.stringify(stableState(nextTargets), null, 2)}\n`);
  return Object.freeze(summary);
}
