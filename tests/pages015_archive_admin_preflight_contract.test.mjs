import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/pages-015-window-archive.yml', import.meta.url), 'utf8');

test('PAGES-015 resolves admin readiness before installing the recovery bridge', () => {
  const admin = workflow.indexOf('- name: Resolve immutable-release admin readiness');
  const recovery = workflow.indexOf('- name: Install exact-source recovery bridge');
  assert.ok(admin >= 0, 'admin readiness step is required');
  assert.ok(recovery > admin, 'recovery bridge must come after admin readiness');
  assert.match(workflow, /- name: Install exact-source recovery bridge\n\s+if: steps\.admin\.outputs\.ready == 'true'/);
});

test('PAGES-015 uses exact draft receipts only as non-qualification wait-state evidence', () => {
  assert.match(workflow, /- name: Resolve existing exact draft receipt/);
  assert.match(workflow, /\.event == "draft_staged"/);
  assert.match(workflow, /\.releaseTag == \$tag/);
  assert.match(workflow, /\.assetSha256 == \$digest/);
  assert.match(workflow, /\.draft == true/);
  assert.match(workflow, /\.published == false/);
  assert.match(workflow, /\.exactDraftBytesVerified == true/);
  assert.match(workflow, /state=exact-draft-already-staged/);
  assert.match(workflow, /state=waiting-admin-before-recovery/);
});

test('PAGES-015 performs full archive helper work only when admin is ready', () => {
  const waitStart = workflow.indexOf('- name: Record safe wait state while admin credential is absent');
  const publishStart = workflow.indexOf('- name: Publish and fully qualify immutable frontend archive serially');
  assert.ok(waitStart >= 0 && publishStart > waitStart);
  const waitBlock = workflow.slice(waitStart, publishStart);
  assert.doesNotMatch(waitBlock, /pages015-archive-window-entry-v2\.sh/);
  assert.match(workflow.slice(publishStart), /if: steps\.admin\.outputs\.ready == 'true'/);
  assert.match(workflow.slice(publishStart), /bash scripts\/pages015-archive-window-entry-v2\.sh/);
});
