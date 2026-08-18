import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../scripts/pages015-release-admin-preflight.sh', import.meta.url), 'utf8');

test('PAGES-015 admin preflight probes exact locked candidates through temporary tag refs', () => {
  assert.match(script, /refs\/tags\/pages015-admin-capability-probe-/);
  assert.match(script, /probe_tag_ref active \"\$active_sha\"/);
  assert.match(script, /probe_tag_ref previous \"\$previous_sha\"/);
  assert.match(script, /git\/refs/);
});

test('PAGES-015 admin preflight verifies and deletes every temporary tag ref', () => {
  assert.match(script, /git\/ref\/\$\{api_ref\}/);
  assert.match(script, /--method DELETE \"repos\/\$\{GITHUB_REPOSITORY\}\/git\/refs\/\$\{api_ref\}\"/);
  assert.match(script, /trap cleanup EXIT/);
  assert.match(script, /trap - EXIT/);
});

test('PAGES-015 admin preflight is capability-only and never writes qualification evidence', () => {
  assert.match(script, /PAGES_RELEASE_ADMIN_TOKEN/);
  assert.match(script, /releases\?per_page=1/);
  assert.doesNotMatch(script, /ledger\.jsonl/);
  assert.doesNotMatch(script, /archive_verified/);
  assert.doesNotMatch(script, /deployment_generation_verified/);
  assert.doesNotMatch(script, /backend_compatibility_verified/);
});
