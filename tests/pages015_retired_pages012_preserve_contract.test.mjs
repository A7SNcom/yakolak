import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const preserve = readFileSync(new URL('../.github/workflows/pages-012-preserve-source.yml', import.meta.url), 'utf8');

function onBlock(yaml) {
  const start = yaml.indexOf('on:\n');
  assert.ok(start >= 0, 'workflow must declare on:');
  const permissions = yaml.indexOf('\npermissions:', start);
  assert.ok(permissions > start, 'workflow must declare permissions after on:');
  return yaml.slice(start, permissions);
}

test('historical PAGES-012 source preservation is retired, manual-only, and read-only', () => {
  assert.match(preserve, /^name: PAGES-012 Preserve Exact Source Bytes/m);
  const block = onBlock(preserve);
  assert.match(block, /workflow_dispatch:/);
  assert.doesNotMatch(block, /\bpush:/);
  assert.doesNotMatch(block, /\bschedule:/);
  assert.doesNotMatch(block, /\bworkflow_run:/);
  assert.match(preserve, /permissions:\n\s+contents: read/);
  assert.match(preserve, /historical evidence only/);
  assert.match(preserve, /PAGES015_RECOVERED_SOURCES\.json/);

  for (const forbidden of [
    'actions/upload-artifact',
    'gh run download',
    'SOURCE_PAGES_RUN_ID',
    'SOURCE_PAGES_ARTIFACT_ID',
    'pages012-exact-byte-source',
    'retention-days:',
  ]) {
    assert.ok(!preserve.includes(forbidden), `retired PAGES-012 preserve workflow must not contain ${forbidden}`);
  }
});
