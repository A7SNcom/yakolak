#!/usr/bin/env bash
set -euo pipefail

required=(
  GITHUB_REPOSITORY RELEASE_TAG GODOT_ROOT_SHA THREEJS_CANDIDATE_SHA
  SOURCE_PAGES_RUN_ID SOURCE_PAGES_ARTIFACT_ID SOURCE_ARTIFACT_TAR_SHA256
  EXPECTED_ONLINE_DESCRIPTOR_SHA256 DEPLOYMENT_GENERATION PUBLIC_RUNTIME_PROTOCOL_SHA256
  CONTENT_IDENTITY_SHA256 PAGES014_VERIFIER_RUN_ID PAGES014_VERIFIER_JOB_ID
  PAGES014_LIVE_MANIFEST_SHA256 PAGES014_PAGE_URL GH_TOKEN
)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "missing required environment value: ${name}" >&2; exit 2; }
done

HEX64='^[a-f0-9]{64}$'
GENERATION='^sha256:[a-f0-9]{64}$'
[[ "$SOURCE_ARTIFACT_TAR_SHA256" =~ $HEX64 ]]
[[ "$EXPECTED_ONLINE_DESCRIPTOR_SHA256" =~ $HEX64 ]]
[[ "$PUBLIC_RUNTIME_PROTOCOL_SHA256" =~ $HEX64 ]]
[[ "$CONTENT_IDENTITY_SHA256" =~ $HEX64 ]]
[[ "$PAGES014_LIVE_MANIFEST_SHA256" =~ $HEX64 ]]
[[ "$DEPLOYMENT_GENERATION" =~ $GENERATION ]]

work="$RUNNER_TEMP/pages015-archive-${ROLE:-entry}"
rm -rf "$work"
mkdir -p "$work"/{source,site,release-assets,draft-download,immutable-download,restore-proof,root-component,threejs-component}
source_dir="$work/source"
site="$work/site"
assets="$work/release-assets"
expected="$work/expected-assets.txt"

cat > "$expected" <<'EOF'
ARCHIVE_SHA256SUMS
GODOT_ROOT_FILES_SHA256
IMMUTABLE_FACTS.json
PAGES_COMPOSITE_FILES_SHA256
THREEJS_FILES_SHA256
godot-root.tar
pages-composite.tar
threejs-candidate.tar
EOF

# Exact successful Pages source only.
run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_PAGES_RUN_ID}")"
jq -e '.status == "completed" and .conclusion == "success"' <<<"$run_json" >/dev/null
artifacts_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_PAGES_RUN_ID}/artifacts")"
jq -e --argjson id "$SOURCE_PAGES_ARTIFACT_ID" \
  'any(.artifacts[]; .id == $id and .name == "github-pages" and .expired == false)' \
  <<<"$artifacts_json" >/dev/null

gh run download "$SOURCE_PAGES_RUN_ID" --repo "$GITHUB_REPOSITORY" --name github-pages --dir "$source_dir"
test -s "$source_dir/artifact.tar"
test "$(sha256sum "$source_dir/artifact.tar" | awk '{print $1}')" = "$SOURCE_ARTIFACT_TAR_SHA256"
cp --preserve=mode,timestamps "$source_dir/artifact.tar" "$assets/pages-composite.tar"
cmp "$source_dir/artifact.tar" "$assets/pages-composite.tar"
tar -xf "$source_dir/artifact.tar" -C "$site"

# Bind archive bytes to exact source/generation/runtime/content/descriptor identity.
test -s "$site/index.html"
test -s "$site/threejs/index.html"
test -s "$site/threejs/runtime-config.json"
test -s "$site/threejs/online-compatibility.json"
test -s "$site/deployment-manifest.json"

test "$(sha256sum "$site/threejs/runtime-config.json" | awk '{print $1}')" = "$PUBLIC_RUNTIME_PROTOCOL_SHA256"
test "$(sha256sum "$site/threejs/online-compatibility.json" | awk '{print $1}')" = "$EXPECTED_ONLINE_DESCRIPTOR_SHA256"
test "$(jq -r '.frontendSha' "$site/threejs/runtime-config.json")" = "$THREEJS_CANDIDATE_SHA"

jq -e \
  --arg root "$GODOT_ROOT_SHA" \
  --arg candidate "$THREEJS_CANDIDATE_SHA" \
  --arg generation "$DEPLOYMENT_GENERATION" \
  --arg runtime "$PUBLIC_RUNTIME_PROTOCOL_SHA256" \
  --arg content "$CONTENT_IDENTITY_SHA256" \
  '.schemaVersion == 1 and
   .generationSchema == "pages-deployment-generation-v1" and
   .godotRootSha == $root and
   .threejsCandidateSha == $candidate and
   .deploymentGeneration == $generation and
   .publicRuntimeProtocol.sha256 == $runtime and
   .publicRuntimeProtocol.protocolVersion == "1" and
   .contentIdentity.sha256 == $content' \
  "$site/deployment-manifest.json" >/dev/null

jq -e \
  '.schemaVersion == 1 and
   .identity == "yakolak-online-frontend-compatibility-v1" and
   .protocol.id == "yakolak-online-room" and
   .protocol.version == "1" and
   .capabilities.id == "yakolak-online-room-capabilities-v1" and
   (.capabilities.required | sort) == (["health.compatibility.v1","room-probe.read.v1","room-probe.write.v1"] | sort) and
   .turso.schemaId == "yakolak-pages005-room-probe" and
   .turso.minVersion <= 1 and .turso.maxVersion >= 1 and
   .migrationPolicy.mode == "expand-contract-forward-only" and
   .migrationPolicy.tursoDataRollback == false and
   .mutationRequiresHealthProof == true' \
  "$site/threejs/online-compatibility.json" >/dev/null

# PAGES-014 live proof stays external to immutable release bytes.
pages014_run="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${PAGES014_VERIFIER_RUN_ID}")"
jq -e '.status == "completed" and .conclusion == "success"' <<<"$pages014_run" >/dev/null
pages014_job="$(gh api "repos/${GITHUB_REPOSITORY}/actions/jobs/${PAGES014_VERIFIER_JOB_ID}")"
jq -e --argjson run "$PAGES014_VERIFIER_RUN_ID" \
  '.status == "completed" and .conclusion == "success" and (.run_url | endswith("/" + ($run|tostring)))' \
  <<<"$pages014_job" >/dev/null
pages014_log="$work/pages014.log"
curl --fail --silent --show-error --location \
  --header 'Accept: application/vnd.github+json' \
  --header "Authorization: Bearer ${GH_TOKEN}" \
  --header 'X-GitHub-Api-Version: 2026-03-10' \
  "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/jobs/${PAGES014_VERIFIER_JOB_ID}/logs" \
  --output "$pages014_log"
grep -Fq "ROOT_SHA: ${GODOT_ROOT_SHA}" "$pages014_log"
grep -Fq "CANDIDATE_SHA: ${THREEJS_CANDIDATE_SHA}" "$pages014_log"
grep -Fq "DEPLOYMENT_GENERATION: ${DEPLOYMENT_GENERATION}" "$pages014_log"
grep -Fq "RUNTIME_HASH: ${PUBLIC_RUNTIME_PROTOCOL_SHA256}" "$pages014_log"
grep -Fq "CONTENT_IDENTITY: ${CONTENT_IDENTITY_SHA256}" "$pages014_log"
grep -Fq "LIVE_MANIFEST_SHA: ${PAGES014_LIVE_MANIFEST_SHA256}" "$pages014_log"
grep -Fq "Live desired generation verified: ${DEPLOYMENT_GENERATION}" "$pages014_log"

# Deterministic release assets. IMMUTABLE_FACTS deliberately contains byte/source facts,
# not later qualification state, so it matches the already-staged active draft contract.
(
  cd "$site"
  find . -type f -printf '%P\n' | LC_ALL=C sort | while IFS= read -r rel; do
    printf '%s  %s\n' "$(sha256sum "$rel" | awk '{print $1}')" "$rel"
  done
) > "$assets/PAGES_COMPOSITE_FILES_SHA256"
(
  cd "$site"
  find . -type f ! -path './threejs/*' -printf '%P\n' | LC_ALL=C sort | while IFS= read -r rel; do
    printf '%s  %s\n' "$(sha256sum "$rel" | awk '{print $1}')" "$rel"
  done
) > "$assets/GODOT_ROOT_FILES_SHA256"
(
  cd "$site/threejs"
  find . -type f -printf '%P\n' | LC_ALL=C sort | while IFS= read -r rel; do
    printf '%s  %s\n' "$(sha256sum "$rel" | awk '{print $1}')" "$rel"
  done
) > "$assets/THREEJS_FILES_SHA256"

cp -a "$site/." "$work/root-component/"
rm -rf "$work/root-component/threejs"
cp -a "$site/threejs/." "$work/threejs-component/"
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  --format=posix --pax-option=delete=atime,delete=ctime \
  -cf "$assets/godot-root.tar" -C "$work/root-component" .
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  --format=posix --pax-option=delete=atime,delete=ctime \
  -cf "$assets/threejs-candidate.tar" -C "$work/threejs-component" .
(
  cd "$assets"
  sha256sum godot-root.tar pages-composite.tar threejs-candidate.tar > ARCHIVE_SHA256SUMS
)

pages_sha="$(sha256sum "$assets/pages-composite.tar" | awk '{print $1}')"
root_sha="$(sha256sum "$assets/godot-root.tar" | awk '{print $1}')"
three_sha="$(sha256sum "$assets/threejs-candidate.tar" | awk '{print $1}')"
pages_manifest_sha="$(sha256sum "$assets/PAGES_COMPOSITE_FILES_SHA256" | awk '{print $1}')"
root_manifest_sha="$(sha256sum "$assets/GODOT_ROOT_FILES_SHA256" | awk '{print $1}')"
three_manifest_sha="$(sha256sum "$assets/THREEJS_FILES_SHA256" | awk '{print $1}')"
test "$pages_sha" = "$SOURCE_ARTIFACT_TAR_SHA256"

jq -n \
  --arg releaseTag "$RELEASE_TAG" \
  --arg releaseTargetSha "$THREEJS_CANDIDATE_SHA" \
  --arg godotRootSha "$GODOT_ROOT_SHA" \
  --arg threejsCandidateSha "$THREEJS_CANDIDATE_SHA" \
  --argjson pagesRunId "$SOURCE_PAGES_RUN_ID" \
  --argjson pagesArtifactId "$SOURCE_PAGES_ARTIFACT_ID" \
  --arg sourceArtifactTarSha256 "$SOURCE_ARTIFACT_TAR_SHA256" \
  --arg pagesSha "$pages_sha" --arg rootSha "$root_sha" --arg threeSha "$three_sha" \
  --arg pagesManifestSha "$pages_manifest_sha" --arg rootManifestSha "$root_manifest_sha" --arg threeManifestSha "$three_manifest_sha" \
  --arg descriptorSha "$EXPECTED_ONLINE_DESCRIPTOR_SHA256" \
  --arg generation "$DEPLOYMENT_GENERATION" \
  --arg contentIdentity "$CONTENT_IDENTITY_SHA256" \
  '{
    schemaVersion: 1,
    releaseTag: $releaseTag,
    releaseTargetSha: $releaseTargetSha,
    source: {
      godotRootSha: $godotRootSha,
      threejsCandidateSha: $threejsCandidateSha,
      pagesRunId: $pagesRunId,
      pagesArtifactId: $pagesArtifactId,
      sourceArtifactTarSha256: $sourceArtifactTarSha256
    },
    deploymentGeneration: $generation,
    contentIdentitySha256: $contentIdentity,
    onlineCompatibilityDescriptorSha256: $descriptorSha,
    archives: {
      "pages-composite.tar": {sha256: $pagesSha, contentManifestSha256: $pagesManifestSha},
      "godot-root.tar": {sha256: $rootSha, contentManifestSha256: $rootManifestSha},
      "threejs-candidate.tar": {sha256: $threeSha, contentManifestSha256: $threeManifestSha}
    },
    mutationPolicy: "immutable-release-bytes-never-change"
  }' > "$assets/IMMUTABLE_FACTS.json"
sums_sha="$(sha256sum "$assets/ARCHIVE_SHA256SUMS" | awk '{print $1}')"
jq --arg sumsSha "$sums_sha" '. + {archiveSha256ManifestSha256:$sumsSha}' \
  "$assets/IMMUTABLE_FACTS.json" > "$assets/IMMUTABLE_FACTS.tmp"
mv "$assets/IMMUTABLE_FACTS.tmp" "$assets/IMMUTABLE_FACTS.json"
(cd "$assets" && sha256sum -c ARCHIVE_SHA256SUMS)
find "$assets" -maxdepth 1 -type f -printf '%f\n' | LC_ALL=C sort > "$work/local-assets.txt"
diff -u "$expected" "$work/local-assets.txt"

# Stage/reuse a mutable draft. Existing assets are never silently replaced.
gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100" > "$work/releases.json"
release_id="$(jq -r --arg tag "$RELEASE_TAG" '.[] | select(.tag_name == $tag) | .id' "$work/releases.json" | head -n1)"
if [ -z "$release_id" ]; then
  gh release create "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" \
    --target "$THREEJS_CANDIDATE_SHA" \
    --title "YAKOLAK exact-byte Pages archive ${RELEASE_TAG}" \
    --notes "Exact deployed Pages bytes from run ${SOURCE_PAGES_RUN_ID}. Qualification remains external in RELEASE_QUALIFICATION/ledger.jsonl." \
    --latest=false --draft
  gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100" > "$work/releases.json"
  release_id="$(jq -r --arg tag "$RELEASE_TAG" '.[] | select(.tag_name == $tag) | .id' "$work/releases.json" | head -n1)"
fi
test -n "$release_id"
gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}" > "$work/release.json"
test "$(jq -r '.tag_name' "$work/release.json")" = "$RELEASE_TAG"
test "$(jq -r '.target_commitish' "$work/release.json")" = "$THREEJS_CANDIDATE_SHA"
release_immutable="$(jq -r '.immutable // false' "$work/release.json")"
release_draft="$(jq -r '.draft' "$work/release.json")"

if [ "$release_immutable" != true ]; then
  test "$release_draft" = true || { echo 'existing release is published but not immutable; refusing mutation' >&2; exit 1; }
  gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets?per_page=100" > "$work/assets.json"
  while IFS= read -r name; do
    if ! jq -e --arg name "$name" 'any(.[]; .name == $name)' "$work/assets.json" >/dev/null; then
      gh release upload "$RELEASE_TAG" "$assets/$name" --repo "$GITHUB_REPOSITORY"
      gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets?per_page=100" > "$work/assets.json"
    fi
  done < "$expected"
  jq -r '.[].name' "$work/assets.json" | LC_ALL=C sort > "$work/remote-assets.txt"
  diff -u "$expected" "$work/remote-assets.txt"

  while IFS= read -r name; do
    asset_id="$(jq -r --arg name "$name" '.[] | select(.name == $name) | .id' "$work/assets.json" | head -n1)"
    test -n "$asset_id"
    curl --fail --silent --show-error --location \
      --header 'Accept: application/octet-stream' \
      --header "Authorization: Bearer ${GH_TOKEN}" \
      --header 'X-GitHub-Api-Version: 2026-03-10' \
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/assets/${asset_id}" \
      --output "$work/draft-download/$name"
    cmp "$assets/$name" "$work/draft-download/$name"
  done < "$expected"
  (cd "$work/draft-download" && sha256sum -c ARCHIVE_SHA256SUMS)

  # Publication is fail-closed until repository immutable releases can be proved/enabled.
  test -n "${ADMIN_TOKEN:-}" || {
    echo 'PAGES_RELEASE_ADMIN_TOKEN is required before publishing the exact draft.' >&2
    exit 1
  }
  immutable_api="https://api.github.com/repos/${GITHUB_REPOSITORY}/immutable-releases"
  code="$(curl --silent --show-error --output "$work/immutable-setting.json" --write-out '%{http_code}' \
    --header 'Accept: application/vnd.github+json' \
    --header "Authorization: Bearer ${ADMIN_TOKEN}" \
    --header 'X-GitHub-Api-Version: 2026-03-10' "$immutable_api")"
  if [ "$code" = 404 ]; then
    put_code="$(curl --silent --show-error --output "$work/immutable-enable.json" --write-out '%{http_code}' \
      --request PUT --header 'Accept: application/vnd.github+json' \
      --header "Authorization: Bearer ${ADMIN_TOKEN}" \
      --header 'X-GitHub-Api-Version: 2026-03-10' "$immutable_api")"
    test "$put_code" = 204 || { echo "failed to enable immutable releases (HTTP ${put_code})" >&2; exit 1; }
    code="$(curl --silent --show-error --output "$work/immutable-setting.json" --write-out '%{http_code}' \
      --header 'Accept: application/vnd.github+json' \
      --header "Authorization: Bearer ${ADMIN_TOKEN}" \
      --header 'X-GitHub-Api-Version: 2026-03-10' "$immutable_api")"
  fi
  test "$code" = 200 || { echo "cannot prove immutable releases enabled (HTTP ${code})" >&2; exit 1; }
  jq -e '.enabled == true' "$work/immutable-setting.json" >/dev/null
  gh release edit "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --draft=false
fi

# Immutable publication + release/asset attestation + exact-byte restore.
ok=false
for attempt in $(seq 1 12); do
  immutable="$(gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --json isImmutable --jq '.isImmutable' 2>/dev/null || true)"
  if [ "$immutable" = true ] && gh release verify "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
    ok=true
    break
  fi
  sleep 5
done
test "$ok" = true || { echo 'published release did not verify as immutable/attested' >&2; exit 1; }

gh release download "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --dir "$work/immutable-download"
while IFS= read -r name; do
  cmp "$assets/$name" "$work/immutable-download/$name"
  gh release verify-asset "$RELEASE_TAG" "$work/immutable-download/$name" --repo "$GITHUB_REPOSITORY" >/dev/null
done < "$expected"
(cd "$work/immutable-download" && sha256sum -c ARCHIVE_SHA256SUMS)
tar -xf "$work/immutable-download/pages-composite.tar" -C "$work/restore-proof"
test -s "$work/restore-proof/index.html"
test -s "$work/restore-proof/threejs/index.html"
test -s "$work/restore-proof/threejs/online-compatibility.json"
test -s "$work/restore-proof/deployment-manifest.json"
test "$(sha256sum "$work/restore-proof/threejs/online-compatibility.json" | awk '{print $1}')" = "$EXPECTED_ONLINE_DESCRIPTOR_SHA256"

python3 -m http.server 8765 --directory "$work/restore-proof" >"$work/restore.log" 2>&1 &
server_pid=$!
trap 'kill ${server_pid} 2>/dev/null || true' EXIT
ready=false
for attempt in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:8765/ >/dev/null; then ready=true; break; fi
  sleep 0.25
done
test "$ready" = true
curl --fail --silent http://127.0.0.1:8765/threejs/ >/dev/null
curl --fail --silent http://127.0.0.1:8765/threejs/online-compatibility.json \
  | jq -e '.mutationRequiresHealthProof == true' >/dev/null
kill "$server_pid" 2>/dev/null || true
trap - EXIT

# Only now write external qualification events. Pull first, append idempotently, push one ledger-only commit.
git fetch --quiet origin threejs-rebuild
git checkout -B threejs-rebuild origin/threejs-rebuild
ledger='RELEASE_QUALIFICATION/ledger.jsonl'
test -s "$ledger"
asset_sha="$(sha256sum "$work/immutable-download/pages-composite.tar" | awk '{print $1}')"
test "$asset_sha" = "$SOURCE_ARTIFACT_TAR_SHA256"
recorded_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if ! jq -s -e --arg tag "$RELEASE_TAG" --arg digest "$asset_sha" \
  'any(.[]; .event == "archive_verified" and .releaseTag == $tag and .assetSha256 == $digest and .immutable == true)' \
  "$ledger" >/dev/null; then
  jq -cn \
    --arg releaseTag "$RELEASE_TAG" --arg assetSha256 "$asset_sha" \
    --arg godotRootSha "$GODOT_ROOT_SHA" --arg threejsCandidateSha "$THREEJS_CANDIDATE_SHA" \
    --arg descriptorSha256 "$EXPECTED_ONLINE_DESCRIPTOR_SHA256" \
    --arg deploymentGeneration "$DEPLOYMENT_GENERATION" \
    --arg workflowRunId "${GITHUB_RUN_ID:-0}" --arg recordedAt "$recorded_at" \
    '{schemaVersion:1,event:"archive_verified",releaseTag:$releaseTag,assetName:"pages-composite.tar",assetSha256:$assetSha256,immutable:true,releaseAttestationVerified:true,archiveSha256Verified:true,nonProductionRestoreVerified:true,godotRootSha:$godotRootSha,threejsCandidateSha:$threejsCandidateSha,onlineCompatibilityDescriptorSha256:$descriptorSha256,deploymentGenerationInArchive:$deploymentGeneration,workflowRunId:($workflowRunId|tonumber),recordedAt:$recordedAt}' \
    >> "$ledger"
fi

if ! jq -s -e --arg tag "$RELEASE_TAG" --arg digest "$asset_sha" --arg generation "$DEPLOYMENT_GENERATION" \
  'any(.[]; .event == "deployment_generation_verified" and .releaseTag == $tag and .assetSha256 == $digest and .deploymentGeneration == $generation and .pages014LiveEvidenceVerified == true and .verified == true)' \
  "$ledger" >/dev/null; then
  jq -cn \
    --arg releaseTag "$RELEASE_TAG" --arg assetSha256 "$asset_sha" \
    --arg generation "$DEPLOYMENT_GENERATION" --arg root "$GODOT_ROOT_SHA" --arg candidate "$THREEJS_CANDIDATE_SHA" \
    --arg runtime "$PUBLIC_RUNTIME_PROTOCOL_SHA256" --arg content "$CONTENT_IDENTITY_SHA256" \
    --arg liveManifest "$PAGES014_LIVE_MANIFEST_SHA256" --arg pageUrl "$PAGES014_PAGE_URL" \
    --argjson verifierRun "$PAGES014_VERIFIER_RUN_ID" --argjson verifierJob "$PAGES014_VERIFIER_JOB_ID" \
    --argjson sourceRun "$SOURCE_PAGES_RUN_ID" --arg recordedAt "$recorded_at" \
    '{schemaVersion:1,event:"deployment_generation_verified",releaseTag:$releaseTag,assetName:"pages-composite.tar",assetSha256:$assetSha256,deploymentGeneration:$generation,godotRootSha:$root,threejsCandidateSha:$candidate,publicRuntimeProtocolSha256:$runtime,protocolVersion:"1",contentIdentitySha256:$content,pagesDeploymentStatus:"succeed",pageUrl:$pageUrl,liveManifestSha256:$liveManifest,manifestVerified:true,archiveMatchVerified:true,pages014LiveEvidenceVerified:true,pages014VerifierWorkflowRunId:$verifierRun,pages014VerifierJobId:$verifierJob,sourceCompositeRunId:$sourceRun,verified:true,recordedAt:$recordedAt}' \
    >> "$ledger"
fi

if git diff --quiet -- "$ledger"; then
  echo "Frontend archive qualification already recorded for ${RELEASE_TAG}."
  exit 0
fi
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add "$ledger"
git diff --cached --name-only | grep -qx "$ledger"
test "$(git diff --cached --name-only | wc -l)" -eq 1
git commit -m "PAGES-015 qualify immutable frontend ${ROLE:-entry}: ${RELEASE_TAG}"
git push origin HEAD:threejs-rebuild

echo "PAGES-015 immutable frontend qualification complete: ${RELEASE_TAG} / ${asset_sha}"
