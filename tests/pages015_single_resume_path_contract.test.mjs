import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const legacy = readFileSync(new URL('../.github/workflows/pages-015-online-compatibility.yml', import.meta.url), 'utf8');
const pages005 = readFileSync(new URL('../.github/workflows/pages-005-cloudflare-backend.yml', import.meta.url), 'utf8');

function onBlock(yaml) {
  const start = yaml.indexOf('on:\n');
  assert.ok(start >= 0, 'workflow must declare on:');
  const permissions = yaml.indexOf('\npermissions:', start);
  assert.ok(permissions > start, 'workflow must declare permissions after on:');
  return yaml.slice(start, permissions);
}

test('legacy PAGES-015 compatibility workflow is manual fallback only', () => {
  const block = onBlock(legacy);
  assert.match(block, /workflow_dispatch:/);
  assert.doesNotMatch(block, /\bpush:/);
  assert.doesNotMatch(block, /\bschedule:/);
});

test('legacy fallback keeps a distinct manual-only identity', () => {
  assert.match(legacy, /^name: PAGES-015 online compatibility qualification/m);
  assert.match(legacy, /backend_compatibility_verified|append-pages015-qualification/);
});

test('PAGES-005 may verify on push but live deploy stays manual-only', () => {
  assert.match(onBlock(pages005), /\bpush:/);
  const deploy = pages005.indexOf('\n  deploy:\n');
  assert.ok(deploy >= 0, 'PAGES-005 workflow must keep a deploy job');
  const deployBlock = pages005.slice(deploy);
  assert.match(deployBlock, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(deployBlock, /bash scripts\/pages005-bootstrap-live\.sh/);
});
