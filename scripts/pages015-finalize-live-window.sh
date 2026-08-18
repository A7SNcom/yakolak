#!/usr/bin/env bash
set -euo pipefail

required=(GITHUB_REPOSITORY GITHUB_RUN_ID RUNNER_TEMP GH_TOKEN)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "missing required environment value: ${name}" >&2; exit 2; }
done

window='RELEASE_QUALIFICATION/ONLINE_FRONTEND_WINDOW.json'
ledger='RELEASE_QUALIFICATION/ledger.jsonl'
test -s "$window"
test -s "$ledger"
test -s backend/cloudflare/API_ORIGIN.txt
test -s backend/cloudflare/WORKER_ROLLBACK_WINDOW.json

read_window() {
  local role="$1" field="$2"
  jq -r --arg role "$role" --arg field "$field" '.frontends[] | select(.role == $role) | .[$field]' "$window"
}
read_live() {
  local role="$1" field="$2"
  jq -r --arg role "$role" --arg field "$field" '.frontends[] | select(.role == $role) | .pages014LiveEvidence[$field]' "$window"
}

active_tag="$(read_window active releaseTag)"
active_digest="$(read_window active assetSha256)"
active_descriptor_sha="$(read_window active onlineCompatibilityDescriptorSha256)"
active_generation="$(read_window active deploymentGeneration)"
active_live_manifest="$(read_live active liveManifestSha256)"
previous_tag="$(read_window previous releaseTag)"
previous_digest="$(read_window previous assetSha256)"
previous_descriptor_sha="$(read_window previous onlineCompatibilityDescriptorSha256)"
previous_generation="$(read_window previous deploymentGeneration)"
previous_live_manifest="$(read_live previous liveManifestSha256)"

if node scripts/verify-release-qualification.mjs "$active_tag" "$active_digest" >/dev/null 2>&1 && \
   node scripts/verify-release-qualification.mjs "$previous_tag" "$previous_digest" >/dev/null 2>&1; then
  echo 'PAGES-015 locked window is already fully qualified.'
  exit 0
fi

check_frontend_prerequisites() {
  local tag="$1" digest="$2" descriptor="$3" generation="$4" live_manifest="$5"
  jq -s -e \
    --arg tag "$tag" --arg digest "$digest" --arg descriptor "$descriptor" \
    --arg generation "$generation" --arg liveManifest "$live_manifest" '
    (any(.[];
      .event == "archive_verified" and
      .releaseTag == $tag and
      .assetName == "pages-composite.tar" and
      .assetSha256 == $digest and
      .immutable == true and
      .releaseAttestationVerified == true and
      .archiveSha256Verified == true and
      .nonProductionRestoreVerified == true and
      .onlineCompatibilityDescriptorSha256 == $descriptor
    )) and
    (any(.[];
      .event == "deployment_generation_verified" and
      .releaseTag == $tag and
      .assetName == "pages-composite.tar" and
      .assetSha256 == $digest and
      .deploymentGeneration == $generation and
      .liveManifestSha256 == $liveManifest and
      .pages014LiveEvidenceVerified == true and
      .manifestVerified == true and
      .archiveMatchVerified == true and
      .verified == true
    ))
  ' "$ledger" >/dev/null
}

check_frontend_prerequisites "$active_tag" "$active_digest" "$active_descriptor_sha" "$active_generation" "$active_live_manifest"
check_frontend_prerequisites "$previous_tag" "$previous_digest" "$previous_descriptor_sha" "$previous_generation" "$previous_live_manifest"

api_origin="$(tr -d '\r\n' < backend/cloudflare/API_ORIGIN.txt)"
[[ "$api_origin" =~ ^https://[^/]+$ ]] || { echo "invalid locked API_ORIGIN: ${api_origin}" >&2; exit 1; }
[[ "$api_origin" != https://*.vercel.app ]] || { echo 'Vercel API_ORIGIN is forbidden' >&2; exit 1; }

jq -e --arg apiOrigin "$api_origin" '
  .schemaVersion == 1 and
  .gate == "PAGES-005" and
  .provider == "cloudflare-workers" and
  .workerName == "yakolak-room-api" and
  .apiOrigin == $apiOrigin and
  (.activeWorkerVersionId | type == "string" and length > 0) and
  (.previousWorkerVersionId | type == "string" and length > 0) and
  .activeWorkerVersionId != .previousWorkerVersionId and
  .protocolIdentity == "yakolak-online-room@1" and
  .capabilityIdentity == "yakolak-online-room-capabilities-v1" and
  (.capabilities | type == "array") and
  (.capabilities | sort) == ["health.compatibility.v1","room-probe.read.v1","room-probe.write.v1"] and
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

active_worker="$(jq -r '.activeWorkerVersionId' backend/cloudflare/WORKER_ROLLBACK_WINDOW.json)"
previous_worker="$(jq -r '.previousWorkerVersionId' backend/cloudflare/WORKER_ROLLBACK_WINDOW.json)"
locked_protocol_identity="$(jq -r '.protocolIdentity' backend/cloudflare/WORKER_ROLLBACK_WINDOW.json)"
locked_capability_identity="$(jq -r '.capabilityIdentity' backend/cloudflare/WORKER_ROLLBACK_WINDOW.json)"
locked_capabilities_json="$(jq -c '.capabilities | sort' backend/cloudflare/WORKER_ROLLBACK_WINDOW.json)"
locked_turso_schema_id="$(jq -r '.tursoSchemaId' backend/cloudflare/WORKER_ROLLBACK_WINDOW.json)"
locked_turso_schema_version="$(jq -r '.tursoSchemaVersion' backend/cloudflare/WORKER_ROLLBACK_WINDOW.json)"
evidence="$RUNNER_TEMP/pages015-live-evidence.json"
frontends="$RUNNER_TEMP/pages015-frontends"
rm -rf "$frontends" "$evidence"
mkdir -p "$frontends"/{active,previous}/{download,extract}

npm install --ignore-scripts
node --test \
  tests/pages_backend_runtime_contract.test.mjs \
  tests/pages_online_compatibility_contract.test.mjs \
  tests/pages015_archive_facts_contract.test.mjs
npx --yes wrangler@4 deploy --dry-run --config backend/cloudflare/wrangler.jsonc --outdir .tmp/pages015-worker

API_ORIGIN="$api_origin" \
ACTIVE_WORKER_VERSION="$active_worker" \
PREVIOUS_WORKER_VERSION="$previous_worker" \
PAGES015_EVIDENCE_PATH="$evidence" \
node scripts/probe-pages015-live-compatibility.mjs

jq -e \
  --arg apiOrigin "$api_origin" \
  --arg protocol "$locked_protocol_identity" \
  --arg capability "$locked_capability_identity" \
  --argjson capabilities "$locked_capabilities_json" \
  --arg tursoId "$locked_turso_schema_id" \
  --argjson tursoVersion "$locked_turso_schema_version" \
  --arg active "$active_worker" \
  --arg previous "$previous_worker" '
  .gate == "PAGES-015" and
  .verified == true and
  .apiOrigin == $apiOrigin and
  .protocolIdentity == $protocol and
  .capabilityIdentity == $capability and
  (.capabilities | sort) == $capabilities and
  .tursoSchemaId == $tursoId and
  .tursoSchemaVersion == $tursoVersion and
  .migrationPolicy == "expand-contract-forward-only" and
  .tursoDataRollbackRequired == false and
  .liveHealthVerified == true and
  .corsHeadersVerified == true and
  .liveTursoRoundTripVerified == true and
  (.workerWindow | length) == 2 and
  any(.workerWindow[];
    .role == "active" and
    .workerVersionId == $active and
    .healthVerified == true and
    .tursoRoundTripVerified == true
  ) and
  any(.workerWindow[];
    .role == "previous" and
    .workerVersionId == $previous and
    .healthVerified == true and
    .tursoRoundTripVerified == true
  )
' "$evidence" >/dev/null

gh release view "$active_tag" --repo "$GITHUB_REPOSITORY" --json isImmutable --jq '.isImmutable' | grep -qx true
gh release view "$previous_tag" --repo "$GITHUB_REPOSITORY" --json isImmutable --jq '.isImmutable' | grep -qx true
gh release verify "$active_tag" --repo "$GITHUB_REPOSITORY" >/dev/null
gh release verify "$previous_tag" --repo "$GITHUB_REPOSITORY" >/dev/null

gh release download "$active_tag" --repo "$GITHUB_REPOSITORY" --pattern pages-composite.tar --dir "$frontends/active/download"
gh release download "$previous_tag" --repo "$GITHUB_REPOSITORY" --pattern pages-composite.tar --dir "$frontends/previous/download"
active_tar="$frontends/active/download/pages-composite.tar"
previous_tar="$frontends/previous/download/pages-composite.tar"
test "$(sha256sum "$active_tar" | awk '{print $1}')" = "$active_digest"
test "$(sha256sum "$previous_tar" | awk '{print $1}')" = "$previous_digest"
gh release verify-asset "$active_tag" "$active_tar" --repo "$GITHUB_REPOSITORY" >/dev/null
gh release verify-asset "$previous_tag" "$previous_tar" --repo "$GITHUB_REPOSITORY" >/dev/null

tar -xf "$active_tar" -C "$frontends/active/extract"
tar -xf "$previous_tar" -C "$frontends/previous/extract"
active_descriptor="$(find "$frontends/active/extract" -type f -path '*/threejs/online-compatibility.json' -print -quit)"
previous_descriptor="$(find "$frontends/previous/extract" -type f -path '*/threejs/online-compatibility.json' -print -quit)"
test -n "$active_descriptor" && test -s "$active_descriptor"
test -n "$previous_descriptor" && test -s "$previous_descriptor"
test "$(sha256sum "$active_descriptor" | awk '{print $1}')" = "$active_descriptor_sha"
test "$(sha256sum "$previous_descriptor" | awk '{print $1}')" = "$previous_descriptor_sha"

ACTIVE_RELEASE_TAG="$active_tag" \
ACTIVE_ASSET_SHA256="$active_digest" \
PREVIOUS_RELEASE_TAG="$previous_tag" \
PREVIOUS_ASSET_SHA256="$previous_digest" \
PAGES015_EVIDENCE_PATH="$evidence" \
node scripts/verify-pages015-frontend-window.mjs "$active_descriptor" "$previous_descriptor"

npm install --no-save --ignore-scripts @playwright/test@1.55.0
PAGES015_API_ORIGIN="$api_origin" npx playwright install --with-deps chromium
PAGES015_API_ORIGIN="$api_origin" npx playwright test tests/pages015-browser-cors.spec.js --workers=1

ACTIVE_RELEASE_TAG="$active_tag" \
ACTIVE_ASSET_SHA256="$active_digest" \
PREVIOUS_RELEASE_TAG="$previous_tag" \
PREVIOUS_ASSET_SHA256="$previous_digest" \
PAGES015_EVIDENCE_PATH="$evidence" \
PAGES015_BROWSER_CORS_VERIFIED=true \
node scripts/append-pages015-qualification.mjs

node scripts/verify-release-qualification.mjs "$active_tag" "$active_digest"
node scripts/verify-release-qualification.mjs "$previous_tag" "$previous_digest"

rm -f "$evidence"
git restore --worktree --staged package.json package-lock.json 2>/dev/null || true
if git diff --quiet -- "$ledger"; then
  echo 'Equivalent PAGES-015 backend qualification already exists.'
  exit 0
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add "$ledger"
git diff --cached --name-only | grep -qx "$ledger"
test "$(git diff --cached --name-only | wc -l)" -eq 1
git commit -m 'PAGES-015 qualify active+previous frontend Worker window'
git push origin HEAD:threejs-rebuild

echo 'PAGES-015 live compatibility qualification complete for both immutable frontend keys.'
