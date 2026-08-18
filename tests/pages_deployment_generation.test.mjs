import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function deploymentGeneration(rootSha, candidateSha, runtimeHash) {
  return `sha256:${sha256(`pages-deployment-generation-v1\n${rootSha}\n${candidateSha}\n${runtimeHash}\n`)}`;
}

function walkFiles(root, current = root) {
  const out = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(root, absolute));
    else if (entry.isFile()) out.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return out;
}

function contentIdentity(root) {
  const lines = walkFiles(root)
    .filter((rel) => path.posix.basename(rel) !== 'deployment-manifest.json')
    .sort()
    .map((rel) => `${sha256(fs.readFileSync(path.join(root, rel)))}  ${rel}\n`)
    .join('');
  return sha256(lines);
}

function writeFixture(root, { manifest = false, runtime = '{"protocolVersion":"1"}\n' } = {}) {
  fs.mkdirSync(path.join(root, 'threejs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>root</title>\n');
  fs.writeFileSync(path.join(root, 'threejs', 'index.html'), '<!doctype html><title>three</title>\n');
  fs.writeFileSync(path.join(root, 'threejs', 'runtime-config.json'), runtime);
  if (manifest) fs.writeFileSync(path.join(root, 'deployment-manifest.json'), '{"ignored":"self-reference"}\n');
}

test('deployment generation binds exact root, candidate, and public runtime hash', () => {
  const root = 'a'.repeat(40);
  const candidate = 'b'.repeat(40);
  const runtime = sha256('runtime-v1');
  const generation = deploymentGeneration(root, candidate, runtime);

  assert.match(generation, /^sha256:[a-f0-9]{64}$/);
  assert.equal(generation, deploymentGeneration(root, candidate, runtime));
  assert.notEqual(generation, deploymentGeneration('c'.repeat(40), candidate, runtime));
  assert.notEqual(generation, deploymentGeneration(root, 'd'.repeat(40), runtime));
  assert.notEqual(generation, deploymentGeneration(root, candidate, sha256('runtime-v2')));
});

test('content identity excludes only deployment manifest self-reference', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pages014-base-'));
  const withManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'pages014-manifest-'));
  try {
    writeFixture(base, { manifest: false });
    writeFixture(withManifest, { manifest: true });
    assert.equal(contentIdentity(base), contentIdentity(withManifest));

    fs.writeFileSync(path.join(withManifest, 'threejs', 'runtime-config.json'), '{"protocolVersion":"2"}\n');
    assert.notEqual(contentIdentity(base), contentIdentity(withManifest));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(withManifest, { recursive: true, force: true });
  }
});

test('old archive without deployment manifest can still prove exact generation bytes', () => {
  const archived = fs.mkdtempSync(path.join(os.tmpdir(), 'pages014-archive-'));
  const live = fs.mkdtempSync(path.join(os.tmpdir(), 'pages014-live-'));
  const root = '1'.repeat(40);
  const candidate = '2'.repeat(40);
  const runtime = '{"frontendSha":"' + candidate + '","protocolVersion":"1"}\n';

  try {
    writeFixture(archived, { manifest: false, runtime });
    writeFixture(live, { manifest: true, runtime });

    const archivedRuntimeHash = sha256(fs.readFileSync(path.join(archived, 'threejs', 'runtime-config.json')));
    const liveRuntimeHash = sha256(fs.readFileSync(path.join(live, 'threejs', 'runtime-config.json')));

    assert.equal(archivedRuntimeHash, liveRuntimeHash);
    assert.equal(deploymentGeneration(root, candidate, archivedRuntimeHash), deploymentGeneration(root, candidate, liveRuntimeHash));
    assert.equal(contentIdentity(archived), contentIdentity(live));
  } finally {
    fs.rmSync(archived, { recursive: true, force: true });
    fs.rmSync(live, { recursive: true, force: true });
  }
});
