import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const decisionPath = path.join(root, 'PAGES_SERVICE_WORKER_DECISION.md');
const migrationContractPath = path.join(root, 'PAGES_MIGRATION_CONTRACT.md');
const webRoot = path.join(root, 'web');
const textExtensions = new Set(['.html', '.js', '.mjs', '.css', '.json', '.md']);

async function walkTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkTextFiles(fullPath));
    } else if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

test('PAGES-011 locks one explicit no-service-worker decision and THREEJS-097 consumption', async () => {
  const [decision, migrationContract] = await Promise.all([
    readFile(decisionPath, 'utf8'),
    readFile(migrationContractPath, 'utf8'),
  ]);
  const markers = decision.match(/^SERVICE_WORKER_DECISION=(none|enabled)$/gm) ?? [];

  assert.deepEqual(markers, ['SERVICE_WORKER_DECISION=none']);
  assert.match(decision, /THREEJS-097 must read this file/i);
  assert.match(decision, /\/yakolak\/threejs\//);
  assert.match(decision, /runtime-config\.json/);
  assert.match(decision, /deployment-manifest\.json/);
  assert.match(decision, /seat credentials/i);
  assert.match(decision, /THREEJS-017/);

  assert.match(migrationContract, /PAGES-011 is complete and locked/i);
  assert.match(migrationContract, /SERVICE_WORKER_DECISION=none/);
  assert.match(migrationContract, /THREEJS-097 must consume the PAGES-011 decision/i);
  assert.match(migrationContract, /may not silently reverse it/i);
  assert.match(migrationContract, /runtime-config\.json/);
  assert.match(migrationContract, /deployment-manifest\.json/);
  assert.match(migrationContract, /THREEJS-017 cold-load budgets/i);
});

test('served Three.js source does not register or package an obvious Service Worker while decision is none', async () => {
  const files = await walkTextFiles(webRoot);
  const registrations = [];
  const packagedWorkers = [];
  const registerPattern = /(?:navigator\s*\.\s*)?serviceWorker\s*\.\s*register\s*\(/i;
  const workerBasenames = new Set(['service-worker.js', 'service_worker.js', 'sw.js']);

  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    if (workerBasenames.has(path.basename(file).toLowerCase())) {
      packagedWorkers.push(relative);
    }
    const content = await readFile(file, 'utf8');
    if (registerPattern.test(content)) {
      registrations.push(relative);
    }
  }

  assert.deepEqual(packagedWorkers, [], `Unexpected Service Worker scripts packaged: ${packagedWorkers.join(', ')}`);
  assert.deepEqual(registrations, [], `Unexpected Service Worker registration found: ${registrations.join(', ')}`);
});
