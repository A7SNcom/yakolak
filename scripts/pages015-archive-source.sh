#!/usr/bin/env bash
set -euo pipefail

required=(RELEASE_TAG GODOT_ROOT_SHA THREEJS_CANDIDATE_SHA SOURCE_PAGES_RUN_ID SOURCE_PAGES_ARTIFACT_ID SOURCE_ARTIFACT_TAR_SHA256 EXPECTED_DEPLOYMENT_GENERATION EXPECTED_CONTENT_IDENTITY EXPECTED_LIVE_MANIFEST_SHA256 PAGES014_VERIFIER_RUN_ID)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "missing ${name}" >&2; exit 2; }
done
: "${GH_TOKEN:?GH_TOKEN is required}"
LEDGER_TOKEN="${GH_TOKEN}"
RELEASE_TOKEN="${PAGES_RELEASE_ADMIN_TOKEN:-${GH_TOKEN}}"

work="${RUNNER_TEMP:-/tmp}/pages015-archive-${SOURCE_PAGES_RUN_ID}"
rm -rf "${work}"
mkdir -p "${work}"/{source,site,release-assets,immutable-download,restore-proof}

append_ledger_event() {
  local event_json="$1"
  local event_name="$2"
  local message="$3"
  for attempt in 1 2 3 4 5; do
    rm -rf "${work}/ledger-repo"
    git clone --quiet --branch threejs-rebuild "https://x-access-token:${LEDGER_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "${work}/ledger-repo"
    git -C "${work}/ledger-repo" config user.name 'github-actions[bot]'
    git -C "${work}/ledger-repo" config user.email '41898282+github-actions[bot]@users.noreply.github.com'
    ledger="${work}/ledger-repo/RELEASE_QUALIFICATION/ledger.jsonl"
    test -s "${ledger}"
    asset_sha="$(jq -r '.assetSha256 // ""' <<<"${event_json}")"
    if jq -e --arg event "${event_name}" --arg tag "${RELEASE_TAG}" --arg digest "${asset_sha}" \
      'select(.event == $event and .releaseTag == $tag and .assetSha256 == $digest)' "${ledger}" >/dev/null; then
      echo "${event_name} already recorded for ${RELEASE_TAG}"
      return 0
    fi
    printf '%s\n' "${event_json}" >> "${ledger}"
    git -C "${work}/ledger-repo" add RELEASE_QUALIFICATION/ledger.jsonl
    git -C "${work}/ledger-repo" commit -m "${message}" >/dev/null
    if git -C "${work}/ledger-repo" push --quiet origin HEAD:threejs-rebuild; then
      return 0
    fi
    echo "ledger race on attempt ${attempt}; retrying"
  done
  echo "failed to append ${event_name} after retries" >&2
  exit 1
}

# Recover the exact already-successful Pages artifact. No rebuild/recomposition is allowed.
run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_PAGES_RUN_ID}")"
RUN_JSON="${run_json}" node <<'NODE'
const run = JSON.parse(process.env.RUN_JSON);
if (run.status !== 'completed' || run.conclusion !== 'success') {
  throw new Error(`source Pages run is not successful: ${run.status}/${run.conclusion}`);
}
NODE
artifacts_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_PAGES_RUN_ID}/artifacts")"
ARTIFACTS_JSON="${artifacts_json}" EXPECTED_ID="${SOURCE_PAGES_ARTIFACT_ID}" node <<'NODE'
const payload = JSON.parse(process.env.ARTIFACTS_JSON);
const artifact = payload.artifacts.find((item) => item.id === Number(process.env.EXPECTED_ID));
if (!artifact) throw new Error(`source artifact ${process.env.EXPECTED_ID} not found`);
if (artifact.name !== 'github-pages') throw new Error(`unexpected artifact name ${artifact.name}`);
if (artifact.expired) throw new Error('source artifact expired before immutable archival');
NODE

gh run download "${SOURCE_PAGES_RUN_ID}" --repo "${GITHUB_REPOSITORY}" --name github-pages --dir "${work}/source"
test -s "${work}/source/artifact.tar"
actual_tar_sha="$(sha256sum "${work}/source/artifact.tar" | awk '{print $1}')"
test "${actual_tar_sha}" = "${SOURCE_ARTIFACT_TAR_SHA256}"
cp "${work}/source/artifact.tar" "${work}/release-assets/pages-composite.tar"
cmp "${work}/source/artifact.tar" "${work}/release-assets/pages-composite.tar"
tar -xf "${work}/source/artifact.tar" -C "${work}/site"

test -s "${work}/site/index.html"
test -s "${work}/site/threejs/index.html"
test -s "${work}/site/threejs/runtime-config.json"
test -s "${work}/site/threejs/online-compatibility.json"
test -s "${work}/site/deployment-manifest.json"

jq -e \
  --arg root "${GODOT_ROOT_SHA}" \
  --arg candidate "${THREEJS_CANDIDATE_SHA}" \
  --arg generation "${EXPECTED_DEPLOYMENT_GENERATION}" \
  --arg content "${EXPECTED_CONTENT_IDENTITY}" \
  '.schemaVersion == 1 and
   .generationSchema == "pages-deployment-generation-v1" and
   .godotRootSha == $root and
   .threejsCandidateSha == $candidate and
   .deploymentGeneration == $generation and
   .contentIdentity.sha256 == $content and
   .publicRuntimeProtocol.protocolVersion == "1"' \
  "${work}/site/deployment-manifest.json" >/dev/null
manifest_sha="$(sha256sum "${work}/site/deployment-manifest.json" | awk '{print $1}')"
test "${manifest_sha}" = "${EXPECTED_LIVE_MANIFEST_SHA256}"
test "$(jq -r '.frontendSha' "${work}/site/threejs/runtime-config.json")" = "${THREEJS_CANDIDATE_SHA}"

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
  "${work}/site/threejs/online-compatibility.json" >/dev/null

descriptor_sha="$(sha256sum "${work}/site/threejs/online-compatibility.json" | awk '{print $1}')"

# Build deterministic convenience component archives; pages-composite.tar remains exact source bytes.
(
  cd "${work}/site"
  find . -type f -printf '%P\n' | LC_ALL=C sort | while IFS= read -r rel; do
    printf '%s  %s\n' "$(sha256sum "${rel}" | awk '{print $1}')" "${rel}"
  done
) > "${work}/release-assets/PAGES_COMPOSITE_FILES_SHA256"
(
  cd "${work}/site"
  find . -type f ! -path './threejs/*' -printf '%P\n' | LC_ALL=C sort | while IFS= read -r rel; do
    printf '%s  %s\n' "$(sha256sum "${rel}" | awk '{print $1}')" "${rel}"
  done
) > "${work}/release-assets/GODOT_ROOT_FILES_SHA256"
(
  cd "${work}/site/threejs"
  find . -type f -printf '%P\n' | LC_ALL=C sort | while IFS= read -r rel; do
    printf '%s  %s\n' "$(sha256sum "${rel}" | awk '{print $1}')" "${rel}"
  done
) > "${work}/release-assets/THREEJS_FILES_SHA256"

mkdir -p "${work}/root-component" "${work}/threejs-component"
cp -a "${work}/site/." "${work}/root-component/"
rm -rf "${work}/root-component/threejs"
cp -a "${work}/site/threejs/." "${work}/threejs-component/"
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  --format=posix --pax-option=delete=atime,delete=ctime \
  -cf "${work}/release-assets/godot-root.tar" -C "${work}/root-component" .
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  --format=posix --pax-option=delete=atime,delete=ctime \
  -cf "${work}/release-assets/threejs-candidate.tar" -C "${work}/threejs-component" .
(
  cd "${work}/release-assets"
  sha256sum godot-root.tar pages-composite.tar threejs-candidate.tar > ARCHIVE_SHA256SUMS
)

pages_sha="$(sha256sum "${work}/release-assets/pages-composite.tar" | awk '{print $1}')"
test "${pages_sha}" = "${SOURCE_ARTIFACT_TAR_SHA256}"
root_sha="$(sha256sum "${work}/release-assets/godot-root.tar" | awk '{print $1}')"
three_sha="$(sha256sum "${work}/release-assets/threejs-candidate.tar" | awk '{print $1}')"
pages_manifest_sha="$(sha256sum "${work}/release-assets/PAGES_COMPOSITE_FILES_SHA256" | awk '{print $1}')"
root_manifest_sha="$(sha256sum "${work}/release-assets/GODOT_ROOT_FILES_SHA256" | awk '{print $1}')"
three_manifest_sha="$(sha256sum "${work}/release-assets/THREEJS_FILES_SHA256" | awk '{print $1}')"

jq -n \
  --arg releaseTag "${RELEASE_TAG}" --arg releaseTargetSha "${THREEJS_CANDIDATE_SHA}" \
  --arg godotRootSha "${GODOT_ROOT_SHA}" --arg threejsCandidateSha "${THREEJS_CANDIDATE_SHA}" \
  --argjson pagesRunId "${SOURCE_PAGES_RUN_ID}" --argjson pagesArtifactId "${SOURCE_PAGES_ARTIFACT_ID}" \
  --arg sourceArtifactTarSha256 "${SOURCE_ARTIFACT_TAR_SHA256}" --arg pagesSha "${pages_sha}" \
  --arg rootSha "${root_sha}" --arg threeSha "${three_sha}" \
  --arg pagesManifestSha "${pages_manifest_sha}" --arg rootManifestSha "${root_manifest_sha}" \
  --arg threeManifestSha "${three_manifest_sha}" --arg descriptorSha "${descriptor_sha}" \
  --arg generation "${EXPECTED_DEPLOYMENT_GENERATION}" --arg contentIdentity "${EXPECTED_CONTENT_IDENTITY}" \
  --arg liveManifestSha "${EXPECTED_LIVE_MANIFEST_SHA256}" --arg pages014VerifierRunId "${PAGES014_VERIFIER_RUN_ID}" \
  '{schemaVersion:1,releaseTag:$releaseTag,releaseTargetSha:$releaseTargetSha,
    source:{godotRootSha:$godotRootSha,threejsCandidateSha:$threejsCandidateSha,pagesRunId:$pagesRunId,pagesArtifactId:$pagesArtifactId,sourceArtifactTarSha256:$sourceArtifactTarSha256},
    deploymentGeneration:$generation,contentIdentitySha256:$contentIdentity,liveManifestSha256:$liveManifestSha,
    pages014VerifierRunId:($pages014VerifierRunId|tonumber),onlineCompatibilityDescriptorSha256:$descriptorSha,
    archives:{"pages-composite.tar":{sha256:$pagesSha,contentManifestSha256:$pagesManifestSha},"godot-root.tar":{sha256:$rootSha,contentManifestSha256:$rootManifestSha},"threejs-candidate.tar":{sha256:$threeSha,contentManifestSha256:$threeManifestSha}},
    mutationPolicy:"immutable-release-bytes-never-change"}' > "${work}/release-assets/IMMUTABLE_FACTS.json"
sums_sha="$(sha256sum "${work}/release-assets/ARCHIVE_SHA256SUMS" | awk '{print $1}')"
jq --arg digest "${sums_sha}" '. + {archiveSha256ManifestSha256:$digest}' \
  "${work}/release-assets/IMMUTABLE_FACTS.json" > "${work}/release-assets/IMMUTABLE_FACTS.tmp"
mv "${work}/release-assets/IMMUTABLE_FACTS.tmp" "${work}/release-assets/IMMUTABLE_FACTS.json"
(cd "${work}/release-assets" && sha256sum -c ARCHIVE_SHA256SUMS)

cat > "${work}/expected-assets.txt" <<'EOF'
ARCHIVE_SHA256SUMS
GODOT_ROOT_FILES_SHA256
IMMUTABLE_FACTS.json
PAGES_COMPOSITE_FILES_SHA256
THREEJS_FILES_SHA256
godot-root.tar
pages-composite.tar
threejs-candidate.tar
EOF
find "${work}/release-assets" -maxdepth 1 -type f -printf '%f\n' | LC_ALL=C sort > "${work}/actual-assets.txt"
diff -u "${work}/expected-assets.txt" "${work}/actual-assets.txt"

# Artifact recovery above uses the Actions token. Release API and immutable-release
# administration use the stronger token when configured; immutable release bytes
# are still never changed after publication.
export GH_TOKEN="${RELEASE_TOKEN}"

# Create/complete a mutable draft. Never mutate a published release.
gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100" > "${work}/releases.json"
release_id="$(jq -r --arg tag "${RELEASE_TAG}" '.[] | select(.tag_name == $tag) | .id' "${work}/releases.json" | head -n1)"
if [ -z "${release_id}" ]; then
  gh release create "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --target "${THREEJS_CANDIDATE_SHA}" \
    --title "YAKOLAK exact-byte Pages archive ${RELEASE_TAG}" \
    --notes "Exact deployed Pages bytes from run ${SOURCE_PAGES_RUN_ID}. Later qualification is additive in RELEASE_QUALIFICATION/ledger.jsonl." \
    --latest=false --draft
  gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100" > "${work}/releases.json"
  release_id="$(jq -r --arg tag "${RELEASE_TAG}" '.[] | select(.tag_name == $tag) | .id' "${work}/releases.json" | head -n1)"
fi
test -n "${release_id}"
gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}" > "${work}/release.json"
immutable="$(jq -r '.immutable // false' "${work}/release.json")"
draft="$(jq -r '.draft' "${work}/release.json")"
if [ "${immutable}" != true ]; then
  test "${draft}" = true || { echo 'existing release is published but not immutable; refusing mutation' >&2; exit 1; }
  test "$(jq -r '.target_commitish' "${work}/release.json")" = "${THREEJS_CANDIDATE_SHA}"
  gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets?per_page=100" > "${work}/assets.json"
  while IFS= read -r name; do
    if ! jq -e --arg name "${name}" 'any(.[]; .name == $name)' "${work}/assets.json" >/dev/null; then
      gh release upload "${RELEASE_TAG}" "${work}/release-assets/${name}" --repo "${GITHUB_REPOSITORY}"
      gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets?per_page=100" > "${work}/assets.json"
    fi
  done < "${work}/expected-assets.txt"
  jq -r '.[].name' "${work}/assets.json" | LC_ALL=C sort > "${work}/remote-assets.txt"
  diff -u "${work}/expected-assets.txt" "${work}/remote-assets.txt"

  draft_event="$(jq -cn --arg releaseTag "${RELEASE_TAG}" --argjson releaseId "${release_id}" \
    --arg assetSha256 "${pages_sha}" --arg workflowRunId "${GITHUB_RUN_ID:-0}" --arg recordedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,event:"draft_staged",releaseTag:$releaseTag,releaseId:$releaseId,assetName:"pages-composite.tar",assetSha256:$assetSha256,draft:true,published:false,exactDraftBytesVerified:true,workflowRunId:($workflowRunId|tonumber),recordedAt:$recordedAt}')"
  append_ledger_event "${draft_event}" draft_staged "PAGES-015 record exact frontend draft ${RELEASE_TAG}"

  # Publication is fail-closed on the repository immutable-release setting.
  api="https://api.github.com/repos/${GITHUB_REPOSITORY}/immutable-releases"
  token="${RELEASE_TOKEN}"
  code="$(curl --silent --show-error --output "${work}/immutable-setting.json" --write-out '%{http_code}' \
    --header 'Accept: application/vnd.github+json' --header "Authorization: Bearer ${token}" \
    --header 'X-GitHub-Api-Version: 2026-03-10' "${api}")"
  if [ "${code}" = 404 ] && [ -n "${PAGES_RELEASE_ADMIN_TOKEN:-}" ]; then
    put_code="$(curl --silent --show-error --output "${work}/immutable-enable.json" --write-out '%{http_code}' --request PUT \
      --header 'Accept: application/vnd.github+json' --header "Authorization: Bearer ${PAGES_RELEASE_ADMIN_TOKEN}" \
      --header 'X-GitHub-Api-Version: 2026-03-10' "${api}")"
    test "${put_code}" = 204
    code="$(curl --silent --show-error --output "${work}/immutable-setting.json" --write-out '%{http_code}' \
      --header 'Accept: application/vnd.github+json' --header "Authorization: Bearer ${PAGES_RELEASE_ADMIN_TOKEN}" \
      --header 'X-GitHub-Api-Version: 2026-03-10' "${api}")"
  fi
  test "${code}" = 200 || { echo "cannot prove immutable releases enabled (HTTP ${code}); exact draft remains unpublished" >&2; exit 1; }
  jq -e '.enabled == true' "${work}/immutable-setting.json" >/dev/null
  gh release edit "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --draft=false
fi

verified=false
for attempt in $(seq 1 12); do
  is_immutable="$(gh release view "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --json isImmutable --jq '.isImmutable' 2>/dev/null || true)"
  if [ "${is_immutable}" = true ] && gh release verify "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" >/dev/null 2>&1; then
    verified=true
    break
  fi
  sleep 5
done
test "${verified}" = true

gh release download "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --dir "${work}/immutable-download"
while IFS= read -r name; do
  cmp "${work}/release-assets/${name}" "${work}/immutable-download/${name}"
  gh release verify-asset "${RELEASE_TAG}" "${work}/immutable-download/${name}" --repo "${GITHUB_REPOSITORY}" >/dev/null
done < "${work}/expected-assets.txt"
(cd "${work}/immutable-download" && sha256sum -c ARCHIVE_SHA256SUMS)

tar -xf "${work}/immutable-download/pages-composite.tar" -C "${work}/restore-proof"
test -s "${work}/restore-proof/index.html"
test -s "${work}/restore-proof/threejs/index.html"
test -s "${work}/restore-proof/threejs/online-compatibility.json"
python3 -m http.server 8765 --directory "${work}/restore-proof" >"${work}/restore-http.log" 2>&1 &
server_pid=$!
trap 'kill ${server_pid} 2>/dev/null || true' EXIT
for attempt in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:8765/ >/dev/null; then break; fi
  sleep 0.25
done
curl --fail --silent http://127.0.0.1:8765/threejs/ >/dev/null
curl --fail --silent http://127.0.0.1:8765/threejs/online-compatibility.json | jq -e '.mutationRequiresHealthProof == true' >/dev/null

recorded_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
archive_event="$(jq -cn --arg releaseTag "${RELEASE_TAG}" --arg assetSha256 "${pages_sha}" \
  --arg godotRootSha "${GODOT_ROOT_SHA}" --arg threejsCandidateSha "${THREEJS_CANDIDATE_SHA}" \
  --arg descriptorSha256 "${descriptor_sha}" --arg workflowRunId "${GITHUB_RUN_ID:-0}" --arg recordedAt "${recorded_at}" \
  '{schemaVersion:1,event:"archive_verified",releaseTag:$releaseTag,assetName:"pages-composite.tar",assetSha256:$assetSha256,immutable:true,releaseAttestationVerified:true,archiveSha256Verified:true,nonProductionRestoreVerified:true,godotRootSha:$godotRootSha,threejsCandidateSha:$threejsCandidateSha,onlineCompatibilityDescriptorSha256:$descriptorSha256,workflowRunId:($workflowRunId|tonumber),recordedAt:$recordedAt}')"
append_ledger_event "${archive_event}" archive_verified "PAGES-015 verify immutable frontend archive ${RELEASE_TAG}"

generation_event="$(jq -cn --arg releaseTag "${RELEASE_TAG}" --arg assetSha256 "${pages_sha}" \
  --arg deploymentGeneration "${EXPECTED_DEPLOYMENT_GENERATION}" --arg godotRootSha "${GODOT_ROOT_SHA}" \
  --arg threejsCandidateSha "${THREEJS_CANDIDATE_SHA}" --arg contentIdentitySha256 "${EXPECTED_CONTENT_IDENTITY}" \
  --arg liveManifestSha256 "${EXPECTED_LIVE_MANIFEST_SHA256}" --arg sourcePagesRunId "${SOURCE_PAGES_RUN_ID}" \
  --arg pages014VerifierRunId "${PAGES014_VERIFIER_RUN_ID}" --arg recordedAt "${recorded_at}" \
  '{schemaVersion:1,event:"deployment_generation_verified",releaseTag:$releaseTag,assetName:"pages-composite.tar",assetSha256:$assetSha256,deploymentGeneration:$deploymentGeneration,godotRootSha:$godotRootSha,threejsCandidateSha:$threejsCandidateSha,contentIdentitySha256:$contentIdentitySha256,liveManifestSha256:$liveManifestSha256,sourcePagesRunId:($sourcePagesRunId|tonumber),pages014VerifierRunId:($pages014VerifierRunId|tonumber),evidenceSource:"pages-014-live-verification",verified:true,recordedAt:$recordedAt}')"
append_ledger_event "${generation_event}" deployment_generation_verified "PAGES-015 bind archive to PAGES-014 live generation ${RELEASE_TAG}"

echo "ARCHIVE_RELEASE_TAG=${RELEASE_TAG}"
echo "ARCHIVE_ASSET_SHA256=${pages_sha}"
echo "ARCHIVE_DEPLOYMENT_GENERATION=${EXPECTED_DEPLOYMENT_GENERATION}"
