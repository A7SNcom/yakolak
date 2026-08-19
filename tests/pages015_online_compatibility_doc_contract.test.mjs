import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const onlineCompatibilityDoc = readFileSync(
  new URL('../PAGES_ONLINE_COMPATIBILITY.md', import.meta.url),
  'utf8',
);

test('PAGES-015 blocker documentation is receipt-driven, qualification-safe, and preserves the PAGES-014 resume trigger', () => {
  assert.match(onlineCompatibilityDoc, /PAGES-014 Post-Deploy Qualification/);
  assert.match(onlineCompatibilityDoc, /workflow_run/);
  assert.match(onlineCompatibilityDoc, /PAGES015_ORCHESTRATOR_RUN\.json/);
  assert.match(onlineCompatibilityDoc, /PAGES015_ORCHESTRATOR_STATUS\.json/);
  assert.match(
    onlineCompatibilityDoc,
    /Current blocker claims must come from the canonical non-secret receipts/,
  );
  assert.match(onlineCompatibilityDoc, /qualificationEvidence=false/);
  assert.match(onlineCompatibilityDoc, /ledger\.jsonl.*only source of qualification events/);
  assert.match(onlineCompatibilityDoc, /no `archive_verified`/);
  assert.match(onlineCompatibilityDoc, /`backend_compatibility_verified`/);
  assert.doesNotMatch(
    onlineCompatibilityDoc,
    /Fresh explicit orchestrator run `\d+` completed successfully/,
  );
});
