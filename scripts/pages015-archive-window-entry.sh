#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REPOSITORY:?}"
: "${RELEASE_TAG:?}"
: "${GODOT_ROOT_SHA:?}"
: "${THREEJS_CANDIDATE_SHA:?}"
: "${SOURCE_PAGES_RUN_ID:?}"
: "${SOURCE_PAGES_ARTIFACT_ID:?}"
: "${SOURCE_ARTIFACT_TAR_SHA256:?}"
: "${DEPLOYMENT_GENERATION:?}"
: "${PUBLIC_RUNTIME_PROTOCOL_SHA256:?}"
: "${CONTENT_IDENTITY_SHA256:?}"
: "${PAGES014_VERIFIER_RUN_ID:?}"
: "${PAGES014_VERIFIER_JOB_ID:?}"
: "${PAGES014_LIVE_MANIFEST_SHA256:?}"
: "${PAGES014_PAGE_URL:?}"
: "${GH_TOKEN:?}"

EXPECTED_ASSETS=(
  ARCHIVE_SHA256SUMS
  GODOT_ROOT_FILES_SHA256
  IMMUTABLE_FACTS.json
  PAGES_COMPOSITE_FILES_SHA256
  THREEJS_FILES_SHA256
  godot-root.tar
  pages-composite.tar
  threejs-candidate.tar
)

reset_workdirs() {
  rm -rf source site release-assets draft-download immutable-download restore-proof root-component threejs-component ledger-repo
  mkdir -p source site release-assets draft-download immutable-download restore-proof
}

recover_source() {
  local run_json artifacts_json actual
  run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_PAGES_RUN_ID}")"
  jq -e '.status == "completed" and .conclusion == "success"' <<<"$run_json" >/dev/null

  artifacts_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_PAGES_RUN_ID}/artifacts")"
  jq -e --argjson id "$SOURCE_PAGES_ARTIFACT_ID" \
    'any(.artifacts[]; .id == $id and .name == "github-pages" and .expired == false)' \
    <<<"$artifacts_json" >/dev/null

  gh run download "$SOURCE_PAGES_RUN_ID" --repo "$GITHUB_REPOSITORY" --name github-pages --dir source
  test -s source/artifact.tar
  actual="$(sha256sum source/artifact.tar | awk '{print $1}')"
  test "$actual" = "$SOURCE_ARTIFACT_TAR_SHA256"
  cp --preserve=mode,timestamps source/artifact.tar release-assets/pages-composite.tar
  cmp source/artifact.tar release-assets/pages-composite.tar
  tar -xf source/artifact.tar -C site
}

verify_site_identity() {
  test -s site/index.html
  test -s site/threejs/index.html
  test -s site/threejs/runtime-config.json
  test -s site/threejs/online-compatibility.json
  test -s site/deployment-manifest.json

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
    site/deployment-manifest.json >/dev/null

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
    site/threejs/online-compatibility.json >/dev/null

  test "$(jq -r '.frontendSha' site/threejs/runtime-config.json)" = "$THREEJS_CANDIDATE_SHA"
  test "$(sha256sum site/threejs/runtime-config.json | awk '{print $1}')" = "$PUBLIC_RUNTIME_PROTOCOL_SHA256"
}

verify_pages014_live_evidence() {
  local run_json job_json log_path
  run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${PAGES014_VERIFIER_RUN_ID}")"
  jq -e '.status == "completed" and .conclusion == "success"' <<<"$run_json" >/dev/null

  job_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/jobs/${PAGES014_VERIFIER_JOB_ID}")"
  jq -e --argjson run "$PAGES014_VERIFIER_RUN_ID" \
    '.status == "completed" and .conclusion == "success" and (.run_url | endswith("/" + ($run|tostring)))' \
    <<<"$job_json" >/dev/null

  log_path="/tmp/pages014-${PAGES014_VERIFIER_JOB_ID}.log"
  curl --fail --silent --show-error --location \
    --header 'Accept: application/vnd.github+json' \
    --header "Authorization: Bearer ${GH_TOKEN}" \
    --header 'X-GitHub-Api-Version: 2026-03-10' \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/jobs/${PAGES014_VERIFIER_JOB_ID}/logs" \
    --output "$log_path"

  grep -Fq "ROOT_SHA: ${GODOT_ROOT_SHA}" "$log_path"
  grep -Fq "CANDIDATE_SHA: ${THREEJS_CANDIDATE_SHA}" "$log_path"
  grep -Fq "DEPLOYMENT_GENERATION: ${DEPLOYMENT_GENERATION}" "$log_path"
  grep -Fq "RUNTIME_HASH: ${PUBLIC_RUNTIME_PROTOCOL_SHA256}" "$log_path"
  grep -Fq "CONTENT_IDENTITY: ${CONTENT_IDENTITY_SHA256}" "$log_path"
  grep -Fq "LIVE_MANIFEST_SHA: ${PAGES014_LIVE_MANIFEST_SHA256}" "$log_path"
  grep -Fq "Live desired generation verified: ${DEPLOYMENT_GENERATION}" "$log_path"
}

prepare_archives() {
  (
    cd site
    find . -type f -printf '%P\n' | LC_ALL=C sort | while IFS= read -r rel; do
      printf '%s  %s\n' "$(sha256sum "$rel" | awk '{print $1}')" "$rel"
    done
  ) > release-assets/PAGES_COMPOSITE_FILES_SHA256
  (
    cd site
    find . -type f ! -path './threejs/*' -printf '%P\n' | LC_ALL=C sort | while IFS= read -r rel; do
      printf '%s  %s\n' "$(sha256sum "$rel" | awk '{print $1}')" "$rel"
    done
  ) > release-assets/GODOT_ROOT_FILES_SHA256
  (
    cd site/threejs
    find . -type f -printf '%P\n' | LC_ALL=C sort | while IFS= read -r rel; do
      printf '%s  %s\n' "$(sha256sum "$rel" | awk '{print $1}')" "$rel"
    done
  ) > release-assets/THREEJS_FILES_SHA256

  mkdir root-component threejs-component
  cp -a site/. root-component/
  rm -rf root-component/threejs
  cp -a site/threejs/. threejs-component/
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    --format=posix --pax-option=delete=atime,delete=ctime -cf release-assets/godot-root.tar -C root-component .
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    --format=posix --pax-option=delete=atime,delete=ctime -cf release-assets/threejs-candidate.tar -C threejs-component .

  (
    cd release-assets
    sha256sum godot-root.tar pages-composite.tar threejs-candidate.tar > ARCHIVE_SHA256SUMS
  )

  local pages_sha root_sha three_sha pages_manifest_sha root_manifest_sha three_manifest_sha descriptor_sha sums_sha
  pages_sha="$(sha256sum release-assets/pages-composite.tar | awk '{print $1}')"
  root_sha="$(sha256sum release-assets/godot-root.tar | awk '{print $1}')"
  three_sha="$(sha256sum release-assets/threejs-candidate.tar | awk '{print $1}')"
  pages_manifest_sha="$(sha256sum release-assets/PAGES_COMPOSITE_FILES_SHA256 | awk '{print $1}')"
  root_manifest_sha="$(sha256sum release-assets/GODOT_ROOT_FILES_SHA256 | awk '{print $1}')"
  three_manifest_sha="$(sha256sum release-assets/THREEJS_FILES_SHA256 | awk '{print $1}')"
  descriptor_sha="$(sha256sum site/threejs/online-compatibility.json | awk '{print $1}')"
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
    --arg descriptorSha "$descriptor_sha" \
    --arg generation "$DEPLOYMENT_GENERATION" \
    --arg runtime "$PUBLIC_RUNTIME_PROTOCOL_SHA256" \
    --arg contentIdentity "$CONTENT_IDENTITY_SHA256" \
    --argjson pages014Run "$PAGES014_VERIFIER_RUN_ID" \
    --argjson pages014Job "$PAGES014_VERIFIER_JOB_ID" \
    --arg liveManifest "$PAGES014_LIVE_MANIFEST_SHA256" \
    --arg pageUrl "$PAGES014_PAGE_URL" \
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
      publicRuntimeProtocolSha256: $runtime,
      contentIdentitySha256: $contentIdentity,
      onlineCompatibilityDescriptorSha256: $descriptorSha,
      pages014LiveEvidence: {
        verifierWorkflowRunId: $pages014Run,
        verifierJobId: $pages014Job,
        liveManifestSha256: $liveManifest,
        pageUrl: $pageUrl,
        verified: true
      },
      archives: {
        "pages-composite.tar": {sha256: $pagesSha, contentManifestSha256: $pagesManifestSha},
        "godot-root.tar": {sha256: $rootSha, contentManifestSha256: $rootManifestSha},
        "threejs-candidate.tar": {sha256: $threeSha, contentManifestSha256: $threeManifestSha}
      },
      mutationPolicy: "immutable-release-bytes-never-change"
    }' > release-assets/IMMUTABLE_FACTS.json

  sums_sha="$(sha256sum release-assets/ARCHIVE_SHA256SUMS | awk '{print $1}')"
  jq --arg sumsSha "$sums_sha" '. + {archiveSha256ManifestSha256:$sumsSha}' \
    release-assets/IMMUTABLE_FACTS.json > release-assets/IMMUTABLE_FACTS.tmp
  mv release-assets/IMMUTABLE_FACTS.tmp release-assets/IMMUTABLE_FACTS.json
  (cd release-assets && sha256sum -c ARCHIVE_SHA256SUMS)
}

write_expected_assets() {
  printf '%s\n' "${EXPECTED_ASSETS[@]}" | LC_ALL=C sort > /tmp/pages015-expected-assets.txt
  find release-assets -maxdepth 1 -type f -printf '%f\n' | LC_ALL=C sort > /tmp/pages015-local-assets.txt
  diff -u /tmp/pages015-expected-assets.txt /tmp/pages015-local-assets.txt
}

stage_or_verify_draft() {
  local release_id immutable draft name asset_id
  gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100" > /tmp/pages015-releases.json
  release_id="$(jq -r --arg tag "$RELEASE_TAG" '.[] | select(.tag_name == $tag) | .id' /tmp/pages015-releases.json | head -n1)"
  if [ -z "$release_id" ]; then
    gh release create "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" \
      --target "$THREEJS_CANDIDATE_SHA" \
      --title "YAKOLAK exact-byte Pages archive ${RELEASE_TAG}" \
      --notes "Exact deployed Pages bytes from run ${SOURCE_PAGES_RUN_ID}. Qualification remains external in RELEASE_QUALIFICATION/ledger.jsonl." \
      --latest=false --draft
    gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100" > /tmp/pages015-releases.json
    release_id="$(jq -r --arg tag "$RELEASE_TAG" '.[] | select(.tag_name == $tag) | .id' /tmp/pages015-releases.json | head -n1)"
  fi
  test -n "$release_id"

  gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}" > /tmp/pages015-release.json
  immutable="$(jq -r '.immutable // false' /tmp/pages015-release.json)"
  draft="$(jq -r '.draft' /tmp/pages015-release.json)"
  test "$(jq -r '.tag_name' /tmp/pages015-release.json)" = "$RELEASE_TAG"
  test "$(jq -r '.target_commitish' /tmp/pages015-release.json)" = "$THREEJS_CANDIDATE_SHA"

  if [ "$immutable" = true ]; then
    return 0
  fi
  test "$draft" = true || { echo 'existing release is published but not immutable; refusing mutation' >&2; exit 1; }

  gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets?per_page=100" > /tmp/pages015-assets.json
  while IFS= read -r name; do
    if ! jq -e --arg name "$name" 'any(.[]; .name == $name)' /tmp/pages015-assets.json >/dev/null; then
      gh release upload "$RELEASE_TAG" "release-assets/${name}" --repo "$GITHUB_REPOSITORY"
      gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets?per_page=100" > /tmp/pages015-assets.json
    fi
  done < /tmp/pages015-expected-assets.txt
  jq -r '.[].name' /tmp/pages015-assets.json | LC_ALL=C sort > /tmp/pages015-remote-assets.txt
  diff -u /tmp/pages015-expected-assets.txt /tmp/pages015-remote-assets.txt

  rm -rf draft-download && mkdir draft-download
  while IFS= read -r name; do
    asset_id="$(jq -r --arg name "$name" '.[] | select(.name == $name) | .id' /tmp/pages015-assets.json | head -n1)"
    test -n "$asset_id"
    curl --fail --silent --show-error --location \
      --header 'Accept: application/octet-stream' \
      --header "Authorization: Bearer ${GH_TOKEN}" \
      --header 'X-GitHub-Api-Version: 2026-03-10' \
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/assets/${asset_id}" \
      --output "draft-download/${name}"
    cmp "release-assets/${name}" "draft-download/${name}"
  done < /tmp/pages015-expected-assets.txt
  (cd draft-download && sha256sum -c ARCHIVE_SHA256SUMS)

  record_draft_staged
}

record_draft_staged() {
  local asset_sha record
  asset_sha="$(sha256sum release-assets/pages-composite.tar | awk '{print $1}')"
  record="$(jq -cn \
    --arg releaseTag "$RELEASE_TAG" --arg assetSha256 "$asset_sha" \
    --arg workflowRunId "${GITHUB_RUN_ID:-0}" --arg recordedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,event:"draft_staged",releaseTag:$releaseTag,assetName:"pages-composite.tar",assetSha256:$assetSha256,draft:true,published:false,exactDraftBytesVerified:true,workflowRunId:($workflowRunId|tonumber),recordedAt:$recordedAt}')"
  append_ledger_record_if_missing "$record" 'draft_staged'
}

verify_or_enable_immutable_setting() {
  : "${ADMIN_TOKEN:?PAGES_RELEASE_ADMIN_TOKEN is required to prove/enable immutable releases before publication}"
  local api code put_code
  api="https://api.github.com/repos/${GITHUB_REPOSITORY}/immutable-releases"
  code="$(curl --silent --show-error --output /tmp/pages015-immutable-setting.json --write-out '%{http_code}' \
    --header 'Accept: application/vnd.github+json' \
    --header "Authorization: Bearer ${ADMIN_TOKEN}" \
    --header 'X-GitHub-Api-Version: 2026-03-10' "$api")"
  if [ "$code" = 404 ]; then
    put_code="$(curl --silent --show-error --output /tmp/pages015-immutable-enable.json --write-out '%{http_code}' \
      --request PUT --header 'Accept: application/vnd.github+json' \
      --header "Authorization: Bearer ${ADMIN_TOKEN}" \
      --header 'X-GitHub-Api-Version: 2026-03-10' "$api")"
    test "$put_code" = 204 || { echo "failed to enable immutable releases (HTTP ${put_code})" >&2; exit 1; }
    code="$(curl --silent --show-error --output /tmp/pages015-immutable-setting.json --write-out '%{http_code}' \
      --header 'Accept: application/vnd.github+json' \
      --header "Authorization: Bearer ${ADMIN_TOKEN}" \
      --header 'X-GitHub-Api-Version: 2026-03-10' "$api")"
  fi
  test "$code" = 200 || { echo "cannot prove immutable releases enabled (HTTP ${code})" >&2; cat /tmp/pages015-immutable-setting.json >&2 || true; exit 1; }
  jq -e '.enabled == true' /tmp/pages015-immutable-setting.json >/dev/null
}

publish_if_needed() {
  local immutable release_id draft
  immutable="$(gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --json isImmutable --jq '.isImmutable' 2>/dev/null || true)"
  if [ "$immutable" = true ]; then return 0; fi
  gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100" > /tmp/pages015-releases.json
  release_id="$(jq -r --arg tag "$RELEASE_TAG" '.[] | select(.tag_name == $tag) | .id' /tmp/pages015-releases.json | head -n1)"
  test -n "$release_id"
  draft="$(gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}" --jq '.draft')"
  test "$draft" = true || { echo 'expected mutable draft before publication' >&2; exit 1; }
  gh release edit "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --draft=false
}

verify_immutable_release_and_restore() {
  local ok=false immutable name server_pid
  for _ in $(seq 1 12); do
    immutable="$(gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --json isImmutable --jq '.isImmutable' 2>/dev/null || true)"
    if [ "$immutable" = true ] && gh release verify "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
      ok=true
      break
    fi
    sleep 5
  done
  test "$ok" = true

  rm -rf immutable-download restore-proof && mkdir immutable-download restore-proof
  gh release download "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --dir immutable-download
  while IFS= read -r name; do
    cmp "release-assets/${name}" "immutable-download/${name}"
    gh release verify-asset "$RELEASE_TAG" "immutable-download/${name}" --repo "$GITHUB_REPOSITORY" >/dev/null
  done < /tmp/pages015-expected-assets.txt
  (cd immutable-download && sha256sum -c ARCHIVE_SHA256SUMS)

  tar -xf immutable-download/pages-composite.tar -C restore-proof
  test -s restore-proof/index.html
  test -s restore-proof/threejs/index.html
  test -s restore-proof/threejs/online-compatibility.json
  test -s restore-proof/deployment-manifest.json
  python3 -m http.server 8765 --directory restore-proof >/tmp/pages015-restore.log 2>&1 &
  server_pid=$!
  trap 'kill ${server_pid} 2>/dev/null || true' EXIT
  for _ in $(seq 1 20); do
    if curl --fail --silent http://127.0.0.1:8765/ >/dev/null; then break; fi
    sleep 0.25
  done
  curl --fail --silent http://127.0.0.1:8765/threejs/ >/dev/null
  curl --fail --silent http://127.0.0.1:8765/threejs/online-compatibility.json \
    | jq -e '.mutationRequiresHealthProof == true' >/dev/null
  kill "$server_pid" 2>/dev/null || true
  trap - EXIT
}

append_ledger_record_if_missing() {
  local record="$1" event="$2" tag digest generation exists_filter
  tag="$(jq -r '.releaseTag' <<<"$record")"
  digest="$(jq -r '.assetSha256' <<<"$record")"
  generation="$(jq -r '.deploymentGeneration // ""' <<<"$record")"

  rm -rf ledger-repo
  git clone --quiet --branch threejs-rebuild "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" ledger-repo
  git -C ledger-repo config user.name 'github-actions[bot]'
  git -C ledger-repo config user.email '41898282+github-actions[bot]@users.noreply.github.com'

  for _ in 1 2 3 4; do
    git -C ledger-repo fetch --quiet origin threejs-rebuild
    git -C ledger-repo reset --hard origin/threejs-rebuild >/dev/null
    if [ -n "$generation" ]; then
      exists_filter='any(.[]; .event == $event and .releaseTag == $tag and .assetSha256 == $digest and .deploymentGeneration == $generation)'
    else
      exists_filter='any(.[]; .event == $event and .releaseTag == $tag and .assetSha256 == $digest)'
    fi
    if jq -s -e --arg event "$event" --arg tag "$tag" --arg digest "$digest" --arg generation "$generation" \
      "$exists_filter" ledger-repo/RELEASE_QUALIFICATION/ledger.jsonl >/dev/null; then
      return 0
    fi
    printf '%s\n' "$record" >> ledger-repo/RELEASE_QUALIFICATION/ledger.jsonl
    git -C ledger-repo add RELEASE_QUALIFICATION/ledger.jsonl
    git -C ledger-repo commit -m "PAGES-015 record ${event} ${RELEASE_TAG}"
    if git -C ledger-repo push --quiet origin HEAD:threejs-rebuild; then return 0; fi
  done
  echo "failed to append ${event} after retries" >&2
  exit 1
}

append_final_qualifications() {
  local asset_sha descriptor_sha archive_record generation_record
  asset_sha="$(sha256sum immutable-download/pages-composite.tar | awk '{print $1}')"
  descriptor_sha="$(sha256sum restore-proof/threejs/online-compatibility.json | awk '{print $1}')"
  test "$asset_sha" = "$SOURCE_ARTIFACT_TAR_SHA256"

  archive_record="$(jq -cn \
    --arg releaseTag "$RELEASE_TAG" --arg assetSha256 "$asset_sha" \
    --arg godotRootSha "$GODOT_ROOT_SHA" --arg threejsCandidateSha "$THREEJS_CANDIDATE_SHA" \
    --arg descriptorSha256 "$descriptor_sha" --arg deploymentGeneration "$DEPLOYMENT_GENERATION" \
    --arg workflowRunId "${GITHUB_RUN_ID:-0}" --arg recordedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,event:"archive_verified",releaseTag:$releaseTag,assetName:"pages-composite.tar",assetSha256:$assetSha256,immutable:true,releaseAttestationVerified:true,archiveSha256Verified:true,nonProductionRestoreVerified:true,godotRootSha:$godotRootSha,threejsCandidateSha:$threejsCandidateSha,onlineCompatibilityDescriptorSha256:$descriptorSha256,deploymentGenerationInArchive:$deploymentGeneration,workflowRunId:($workflowRunId|tonumber),recordedAt:$recordedAt}')"
  append_ledger_record_if_missing "$archive_record" 'archive_verified'

  generation_record="$(jq -cn \
    --arg releaseTag "$RELEASE_TAG" --arg assetSha256 "$asset_sha" \
    --arg generation "$DEPLOYMENT_GENERATION" --arg root "$GODOT_ROOT_SHA" --arg candidate "$THREEJS_CANDIDATE_SHA" \
    --arg runtime "$PUBLIC_RUNTIME_PROTOCOL_SHA256" --arg content "$CONTENT_IDENTITY_SHA256" \
    --arg liveManifest "$PAGES014_LIVE_MANIFEST_SHA256" --arg pageUrl "$PAGES014_PAGE_URL" \
    --argjson verifierRun "$PAGES014_VERIFIER_RUN_ID" --argjson verifierJob "$PAGES014_VERIFIER_JOB_ID" \
    --argjson sourceRun "$SOURCE_PAGES_RUN_ID" --arg recordedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,event:"deployment_generation_verified",releaseTag:$releaseTag,assetName:"pages-composite.tar",assetSha256:$assetSha256,deploymentGeneration:$generation,godotRootSha:$root,threejsCandidateSha:$candidate,publicRuntimeProtocolSha256:$runtime,protocolVersion:"1",contentIdentitySha256:$content,pagesDeploymentStatus:"succeed",pageUrl:$pageUrl,liveManifestSha256:$liveManifest,manifestVerified:true,archiveMatchVerified:true,pages014LiveEvidenceVerified:true,pages014VerifierWorkflowRunId:$verifierRun,pages014VerifierJobId:$verifierJob,sourceCompositeRunId:$sourceRun,verified:true,recordedAt:$recordedAt}')"
  append_ledger_record_if_missing "$generation_record" 'deployment_generation_verified'
}

reset_workdirs
recover_source
verify_site_identity
verify_pages014_live_evidence
prepare_archives
write_expected_assets
stage_or_verify_draft
verify_or_enable_immutable_setting
publish_if_needed
verify_immutable_release_and_restore
append_final_qualifications

echo "PAGES-015 immutable frontend qualification complete for ${RELEASE_TAG} / ${SOURCE_ARTIFACT_TAR_SHA256}"
