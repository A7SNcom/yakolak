#!/usr/bin/env bash
set -euo pipefail

required=(GITHUB_REPOSITORY GITHUB_RUN_ID RUNNER_TEMP WORKFLOW_GH_TOKEN)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "missing required environment value: ${name}" >&2; exit 2; }
done

window='RELEASE_QUALIFICATION/ONLINE_FRONTEND_WINDOW.json'
ledger='RELEASE_QUALIFICATION/ledger.jsonl'
status_file='RELEASE_QUALIFICATION/PAGES015_ORCHESTRATOR_STATUS.json'
test -s "$window"
test -s "$ledger"

present() { if [ -n "$1" ]; then printf true; else printf false; fi; }
release_admin_present="$(present "${PAGES_RELEASE_ADMIN_TOKEN:-}")"
cf_token_present="$(present "${CLOUDFLARE_API_TOKEN:-}")"
cf_account_present="$(present "${CLOUDFLARE_ACCOUNT_ID:-}")"
turso_url_present="$(present "${TURSO_DATABASE_URL:-}")"
turso_token_present="$(present "${TURSO_AUTH_TOKEN:-}")"
backend_credentials_ready=false
if [ "$cf_token_present" = true ] && [ "$cf_account_present" = true ] && \
   [ "$turso_url_present" = true ] && [ "$turso_token_present" = true ]; then
  backend_credentials_ready=true
fi

read_window() {
  local role="$1" field="$2"
  jq -r --arg role "$role" --arg field "$field" '.frontends[] | select(.role == $role) | .[$field]' "$window"
}
read_live() {
  local role="$1" field="$2"
  jq -r --arg role "$role" --arg field "$field" '.frontends[] | select(.role == $role) | .pages014LiveEvidence[$field]' "$window"
}

archive_key_ready() {
  local role="$1" tag digest descriptor generation live_manifest root candidate runtime content page_url source_run verifier_run verifier_job
  tag="$(read_window "$role" releaseTag)"
  digest="$(read_window "$role" assetSha256)"
  descriptor="$(read_window "$role" onlineCompatibilityDescriptorSha256)"
  generation="$(read_window "$role" deploymentGeneration)"
  root="$(read_window "$role" godotRootSha)"
  candidate="$(read_window "$role" threejsCandidateSha)"
  runtime="$(read_window "$role" publicRuntimeProtocolSha256)"
  content="$(read_window "$role" contentIdentitySha256)"
  source_run="$(read_window "$role" sourcePagesRunId)"
  live_manifest="$(read_live "$role" liveManifestSha256)"
  page_url="$(read_live "$role" pageUrl)"
  verifier_run="$(read_live "$role" verifierWorkflowRunId)"
  verifier_job="$(read_live "$role" verifierJobId)"
  jq -s -e \
    --arg tag "$tag" --arg digest "$digest" --arg descriptor "$descriptor" \
    --arg generation "$generation" --arg root "$root" --arg candidate "$candidate" \
    --arg runtime "$runtime" --arg content "$content" --arg liveManifest "$live_manifest" \
    --arg pageUrl "$page_url" --argjson sourceRun "$source_run" \
    --argjson verifierRun "$verifier_run" --argjson verifierJob "$verifier_job" '
    (any(.[];
      .event == "archive_verified" and
      .releaseTag == $tag and
      .assetName == "pages-composite.tar" and
      .assetSha256 == $digest and
      .immutable == true and
      .releaseAttestationVerified == true and
      .archiveSha256Verified == true and
      .nonProductionRestoreVerified == true and
      .godotRootSha == $root and
      .threejsCandidateSha == $candidate and
      .onlineCompatibilityDescriptorSha256 == $descriptor and
      .deploymentGenerationInArchive == $generation
    )) and
    (any(.[];
      .event == "deployment_generation_verified" and
      .releaseTag == $tag and
      .assetName == "pages-composite.tar" and
      .assetSha256 == $digest and
      .deploymentGeneration == $generation and
      .godotRootSha == $root and
      .threejsCandidateSha == $candidate and
      .publicRuntimeProtocolSha256 == $runtime and
      .protocolVersion == "1" and
      .contentIdentitySha256 == $content and
      .pagesDeploymentStatus == "succeed" and
      .pageUrl == $pageUrl and
      .liveManifestSha256 == $liveManifest and
      .pages014LiveEvidenceVerified == true and
      .pages014VerifierWorkflowRunId == $verifierRun and
      .pages014VerifierJobId == $verifierJob and
      .sourceCompositeRunId == $sourceRun and
      .manifestVerified == true and
      .archiveMatchVerified == true and
      .verified == true
    ))
  ' "$ledger" >/dev/null
}

worker_window_ready() {
  test -s backend/cloudflare/API_ORIGIN.txt || return 1
  test -s backend/cloudflare/WORKER_ROLLBACK_WINDOW.json || return 1
  local origin
  origin="$(tr -d '\r\n' < backend/cloudflare/API_ORIGIN.txt)"
  [[ "$origin" =~ ^https://[^/]+$ ]] || return 1
  jq -e --arg origin "$origin" '
    .schemaVersion == 1 and
    .gate == "PAGES-005" and
    .provider == "cloudflare-workers" and
    .workerName == "yakolak-room-api" and
    .apiOrigin == $origin and
    (.activeWorkerVersionId | type == "string" and length > 0) and
    (.previousWorkerVersionId | type == "string" and length > 0) and
    .activeWorkerVersionId != .previousWorkerVersionId and
    .protocolIdentity == "yakolak-online-room@1" and
    .capabilityIdentity == "yakolak-online-room-capabilities-v1" and
    (.capabilities | type == "array") and
    (.capabilities | length) == 3 and
    ((.capabilities | index("health.compatibility.v1")) != null) and
    ((.capabilities | index("room-probe.read.v1")) != null) and
    ((.capabilities | index("room-probe.write.v1")) != null) and
    .tursoSchemaId == "yakolak-pages005-room-probe" and
    .tursoSchemaVersion == 1 and
    .traffic.activePercent == 100 and
    .traffic.previousPercent == 0 and
    .versionOverrideProof == true and
    .browserCorsVerified == true and
    .liveTursoRoundTripVerified == true and
    (.finalEvidenceSha256 | test("^[a-f0-9]{64}$")) and
    .migrationPolicy == "expand-contract-forward-only" and
    .tursoDataRollbackRequired == false
  ' backend/cloudflare/WORKER_ROLLBACK_WINDOW.json >/dev/null
}

full_qualification_ready() {
  local active_tag active_digest previous_tag previous_digest
  active_tag="$(read_window active releaseTag)"
  active_digest="$(read_window active assetSha256)"
  previous_tag="$(read_window previous releaseTag)"
  previous_digest="$(read_window previous assetSha256)"
  node scripts/verify-release-qualification.mjs "$active_tag" "$active_digest" >/dev/null 2>&1 && \
    node scripts/verify-release-qualification.mjs "$previous_tag" "$previous_digest" >/dev/null 2>&1 && \
    node scripts/verify-pages015-current-lock-qualification.mjs >/dev/null 2>&1
}

record_status() {
  local phase="$1" active_archive=false previous_archive=false worker=false complete=false
  archive_key_ready active && active_archive=true || true
  archive_key_ready previous && previous_archive=true || true
  worker_window_ready && worker=true || true
  full_qualification_ready && complete=true || true

  mkdir -p "$(dirname "$status_file")"
  local core="$RUNNER_TEMP/pages015-orchestrator-core.json"
  jq -n \
    --arg phase "$phase" \
    --argjson releaseAdminPresent "$release_admin_present" \
    --argjson cloudflareApiTokenPresent "$cf_token_present" \
    --argjson cloudflareAccountIdPresent "$cf_account_present" \
    --argjson tursoDatabaseUrlPresent "$turso_url_present" \
    --argjson tursoAuthTokenPresent "$turso_token_present" \
    --argjson backendCredentialsReady "$backend_credentials_ready" \
    --argjson activeArchiveReady "$active_archive" \
    --argjson previousArchiveReady "$previous_archive" \
    --argjson workerWindowReady "$worker" \
    --argjson complete "$complete" '
    {
      schemaVersion: 1,
      gate: "PAGES-015",
      phase: $phase,
      credentials: {
        pagesReleaseAdminTokenPresent: $releaseAdminPresent,
        cloudflareApiTokenPresent: $cloudflareApiTokenPresent,
        cloudflareAccountIdPresent: $cloudflareAccountIdPresent,
        tursoDatabaseUrlPresent: $tursoDatabaseUrlPresent,
        tursoAuthTokenPresent: $tursoAuthTokenPresent,
        backendCredentialsReady: $backendCredentialsReady
      },
      activeArchiveQualified: $activeArchiveReady,
      previousArchiveQualified: $previousArchiveReady,
      workerRollbackWindowLocked: $workerWindowReady,
      completeQualification: $complete,
      containsSecretValues: false,
      qualificationEvidence: false
    }
  ' > "$core"

  local changed=true
  if [ -s "$status_file" ]; then
    jq 'del(.workflowRunId,.recordedAt)' "$status_file" > "$RUNNER_TEMP/pages015-existing-orchestrator-core.json"
    if cmp -s "$core" "$RUNNER_TEMP/pages015-existing-orchestrator-core.json"; then
      changed=false
    fi
  fi
  if [ "$changed" != true ]; then
    return 0
  fi

  jq \
    --arg runId "$GITHUB_RUN_ID" \
    --arg recordedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '. + {workflowRunId:($runId|tonumber),recordedAt:$recordedAt}' \
    "$core" > "$status_file"

  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git add "$status_file"
  git diff --cached --name-only | grep -qx "$status_file"
  test "$(git diff --cached --name-only | wc -l)" -eq 1
  git commit -m "PAGES-015 record orchestrator ${phase} state"
  git push origin HEAD:threejs-rebuild
}

# Always establish a truthful non-qualification readiness receipt first.
record_status 'readiness'

if full_qualification_ready; then
  echo 'PAGES-015 already fully qualified for both immutable frontend keys and the current Worker rollback lock.'
  record_status 'complete'
  exit 0
fi

# Archive qualification is independent of backend credentials.
if [ "$release_admin_present" = true ]; then
  for role in active previous; do
    git fetch --quiet origin threejs-rebuild
    git reset --hard origin/threejs-rebuild
    if archive_key_ready "$role"; then
      echo "${role} immutable frontend archive is already strongly qualified."
      continue
    fi

    RELEASE_TAG="$(read_window "$role" releaseTag)" \
    GODOT_ROOT_SHA="$(read_window "$role" godotRootSha)" \
    THREEJS_CANDIDATE_SHA="$(read_window "$role" threejsCandidateSha)" \
    SOURCE_PAGES_RUN_ID="$(read_window "$role" sourcePagesRunId)" \
    SOURCE_PAGES_ARTIFACT_ID="$(read_window "$role" sourcePagesArtifactId)" \
    SOURCE_ARTIFACT_TAR_SHA256="$(read_window "$role" assetSha256)" \
    EXPECTED_ONLINE_DESCRIPTOR_SHA256="$(read_window "$role" onlineCompatibilityDescriptorSha256)" \
    DEPLOYMENT_GENERATION="$(read_window "$role" deploymentGeneration)" \
    PUBLIC_RUNTIME_PROTOCOL_SHA256="$(read_window "$role" publicRuntimeProtocolSha256)" \
    CONTENT_IDENTITY_SHA256="$(read_window "$role" contentIdentitySha256)" \
    PAGES014_VERIFIER_RUN_ID="$(read_live "$role" verifierWorkflowRunId)" \
    PAGES014_VERIFIER_JOB_ID="$(read_live "$role" verifierJobId)" \
    PAGES014_LIVE_MANIFEST_SHA256="$(read_live "$role" liveManifestSha256)" \
    PAGES014_PAGE_URL="$(read_live "$role" pageUrl)" \
    ROLE="$role" \
    GH_TOKEN="$PAGES_RELEASE_ADMIN_TOKEN" \
    ADMIN_TOKEN="$PAGES_RELEASE_ADMIN_TOKEN" \
    bash scripts/pages015-archive-window-entry-v2.sh
  done
else
  echo 'PAGES-015 immutable frontend publication remains WAITING for PAGES_RELEASE_ADMIN_TOKEN.'
fi

# Refresh after archive helper commits.
git fetch --quiet origin threejs-rebuild
git reset --hard origin/threejs-rebuild

# Backend qualification is independent of release-admin credential.
if [ "$backend_credentials_ready" = true ]; then
  if worker_window_ready; then
    echo 'PAGES-005 Worker rollback window is already locked with explicit compatibility identity.'
  else
    bash scripts/pages005-bootstrap-live.sh
  fi
else
  echo 'PAGES-005 live backend remains WAITING for Cloudflare/Turso credentials.'
fi

# Refresh after backend helper commits.
git fetch --quiet origin threejs-rebuild
git reset --hard origin/threejs-rebuild

if archive_key_ready active && archive_key_ready previous && worker_window_ready; then
  final_gh_token="${PAGES_RELEASE_ADMIN_TOKEN:-$WORKFLOW_GH_TOKEN}"
  GH_TOKEN="$final_gh_token" bash scripts/pages015-finalize-live-window.sh
  git fetch --quiet origin threejs-rebuild
  git reset --hard origin/threejs-rebuild
  full_qualification_ready || { echo 'finalizer returned without complete current-lock qualification' >&2; exit 1; }
  record_status 'complete'
else
  record_status 'waiting-external-prerequisites'
  echo 'PAGES-015 remains correctly unqualified until external credentials/prerequisites become available.'
fi
