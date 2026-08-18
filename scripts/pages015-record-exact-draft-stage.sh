#!/usr/bin/env bash
set -euo pipefail

required=(
  GITHUB_REPOSITORY GITHUB_RUN_ID RUNNER_TEMP GH_TOKEN
  RELEASE_TAG THREEJS_CANDIDATE_SHA SOURCE_ARTIFACT_TAR_SHA256
)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "missing required environment value: ${name}" >&2; exit 2; }
done
[[ "$SOURCE_ARTIFACT_TAR_SHA256" =~ ^[a-f0-9]{64}$ ]]
[[ "$THREEJS_CANDIDATE_SHA" =~ ^[a-f0-9]{40}$ ]]

work="$RUNNER_TEMP/pages015-draft-record-${ROLE:-entry}"
rm -rf "$work"
mkdir -p "$work"

expected_assets="$work/expected-assets.txt"
cat > "$expected_assets" <<'EOF'
ARCHIVE_SHA256SUMS
GODOT_ROOT_FILES_SHA256
IMMUTABLE_FACTS.json
PAGES_COMPOSITE_FILES_SHA256
THREEJS_FILES_SHA256
godot-root.tar
pages-composite.tar
threejs-candidate.tar
EOF

releases_json="$work/releases.json"
gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100" > "$releases_json"
match_count="$(jq --arg tag "$RELEASE_TAG" '[.[] | select(.tag_name == $tag)] | length' "$releases_json")"
test "$match_count" -eq 1 || { echo "expected exactly one draft release for ${RELEASE_TAG}, got ${match_count}" >&2; exit 1; }
release_id="$(jq -r --arg tag "$RELEASE_TAG" '.[] | select(.tag_name == $tag) | .id' "$releases_json")"
test -n "$release_id"

gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}" > "$work/release.json"
jq -e \
  --arg tag "$RELEASE_TAG" '
    .tag_name == $tag and
    .draft == true and
    (.immutable // false) == false
  ' "$work/release.json" >/dev/null

release_target_commitish="$(jq -r '.target_commitish' "$work/release.json")"
if [ "$release_target_commitish" = "$THREEJS_CANDIDATE_SHA" ]; then
  :
elif [ "${ROLE:-}" = previous ]; then
  expected_branch="pages015-release-target-previous-${THREEJS_CANDIDATE_SHA:0:8}"
  test "$release_target_commitish" = "$expected_branch" || {
    echo "previous draft target mismatch: expected ${THREEJS_CANDIDATE_SHA} or ${expected_branch}, got ${release_target_commitish}" >&2
    exit 1
  }
  target_ref_sha="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/${expected_branch}" --jq '.object.sha')"
  test "$target_ref_sha" = "$THREEJS_CANDIDATE_SHA" || {
    echo "previous draft target branch moved: expected ${THREEJS_CANDIDATE_SHA}, got ${target_ref_sha}" >&2
    exit 1
  }
else
  echo "draft target mismatch: expected ${THREEJS_CANDIDATE_SHA}, got ${release_target_commitish}" >&2
  exit 1
fi

gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets?per_page=100" > "$work/assets.json"
jq -r '.[].name' "$work/assets.json" | LC_ALL=C sort > "$work/remote-assets.txt"
diff -u "$expected_assets" "$work/remote-assets.txt"

asset_id="$(jq -r '.[] | select(.name == "pages-composite.tar") | .id' "$work/assets.json")"
test -n "$asset_id"
curl --fail --silent --show-error --location \
  --header 'Accept: application/octet-stream' \
  --header "Authorization: Bearer ${GH_TOKEN}" \
  --header 'X-GitHub-Api-Version: 2026-03-10' \
  "https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/assets/${asset_id}" \
  --output "$work/pages-composite.tar"
actual_sha="$(sha256sum "$work/pages-composite.tar" | awk '{print $1}')"
test "$actual_sha" = "$SOURCE_ARTIFACT_TAR_SHA256" || {
  echo "draft pages-composite.tar SHA mismatch: expected ${SOURCE_ARTIFACT_TAR_SHA256}, got ${actual_sha}" >&2
  exit 1
}

# Record only external mutable-draft staging evidence. This event never confers release eligibility.
git fetch --quiet origin threejs-rebuild
git reset --hard origin/threejs-rebuild
ledger='RELEASE_QUALIFICATION/ledger.jsonl'
test -s "$ledger"
if jq -s -e \
  --arg tag "$RELEASE_TAG" \
  --arg digest "$SOURCE_ARTIFACT_TAR_SHA256" '
    any(.[];
      .event == "draft_staged" and
      .releaseTag == $tag and
      .assetName == "pages-composite.tar" and
      .assetSha256 == $digest and
      .draft == true and
      .published == false and
      .exactDraftBytesVerified == true
    )
  ' "$ledger" >/dev/null; then
  echo "exact draft already recorded for ${RELEASE_TAG}"
  exit 0
fi

jq -cn \
  --arg releaseTag "$RELEASE_TAG" \
  --argjson releaseId "$release_id" \
  --arg assetSha256 "$SOURCE_ARTIFACT_TAR_SHA256" \
  --argjson workflowRunId "$GITHUB_RUN_ID" \
  --arg recordedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  {
    schemaVersion: 1,
    event: "draft_staged",
    releaseTag: $releaseTag,
    releaseId: $releaseId,
    assetName: "pages-composite.tar",
    assetSha256: $assetSha256,
    draft: true,
    published: false,
    exactDraftBytesVerified: true,
    workflowRunId: $workflowRunId,
    recordedAt: $recordedAt
  }
  ' >> "$ledger"

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add "$ledger"
git diff --cached --name-only | grep -qx 'RELEASE_QUALIFICATION/ledger.jsonl'
test "$(git diff --cached --name-only | wc -l)" -eq 1
git commit -m "PAGES-015 stage exact ${ROLE:-frontend} release draft"
git push origin HEAD:threejs-rebuild
