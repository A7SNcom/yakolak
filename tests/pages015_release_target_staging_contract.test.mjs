import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const helper = readFileSync(new URL("../scripts/pages015-archive-window-entry-v2.sh", import.meta.url), "utf8");

test("previous branch target stays exact-SHA bound", () => {
  assert.match(helper, /pages015-release-target-previous-\$\{THREEJS_CANDIDATE_SHA:0:8\}/);
  assert.match(helper, /release target branch does not resolve to the locked candidate SHA/);
  assert.match(helper, /release target branch moved before immutable publication/);
});

test("published tag is proven against locked candidate", () => {
  assert.match(helper, /published immutable release tag does not resolve to locked candidate SHA/);
});

test("admin gate remains before publication", () => {
  const gate = helper.indexOf("PAGES_RELEASE_ADMIN_TOKEN is required before publishing the exact draft");
  const publish = helper.indexOf("gh release edit \"$RELEASE_TAG\" --repo \"$GITHUB_REPOSITORY\" --draft=false");
  assert.ok(gate >= 0 && publish > gate);
});
