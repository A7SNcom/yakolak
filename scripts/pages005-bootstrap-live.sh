#!/usr/bin/env bash
set -euo pipefail

required=(
  GITHUB_REPOSITORY GITHUB_RUN_ID RUNNER_TEMP
  CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
  TURSO_DATABASE_URL TURSO_AUTH_TOKEN
)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "missing required environment value: ${name}" >&2; exit 2; }
done

repo_root="$(pwd)"
secrets_file="$RUNNER_TEMP/pages005-secrets.json"
bootstrap_output="$RUNNER_TEMP/pages005-bootstrap-deploy.ndjson"
twin_output="$RUNNER_TEMP/pages005-version-upload.ndjson"
window_output="$RUNNER_TEMP/pages005-version-deploy.ndjson"
evidence="$RUNNER_TEMP/pages005-worker-window-evidence.json"
final_evidence="$RUNNER_TEMP/pages005-worker-window-final-evidence.json"
trap 'rm -f "$secrets_file"' EXIT

npm install --ignore-scripts
node --test tests/pages_backend_runtime_contract.test.mjs tests/pages_online_compatibility_contract.test.mjs
npx --yes wrangler@4 deploy --dry-run --config backend/cloudflare/wrangler.jsonc --outdir .tmp/pages005-worker

SECRETS_FILE="$secrets_file" node <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.env.SECRETS_FILE, JSON.stringify({
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
}));
NODE
chmod 600 "$secrets_file"

rm -f "$bootstrap_output"
WRANGLER_OUTPUT_FILE_PATH="$bootstrap_output" \
  npx --yes wrangler@4 deploy \
    --config backend/cloudflare/wrangler.jsonc \
    --secrets-file "$secrets_file" \
    --message 'PAGES-005 bootstrap live version'

test -s "$bootstrap_output"
bootstrap_version="$(jq -rs '[.[] | select(.type == "deploy")][-1].version_id // empty' "$bootstrap_output")"
target="$(jq -rs -r '[.[] | select(.type == "deploy")][-1].targets[]? | select(test("^https://"))' "$bootstrap_output" | head -n1)"
test -n "$bootstrap_version" || { echo 'structured deploy output missing version_id' >&2; cat "$bootstrap_output" >&2; exit 1; }
test -n "$target" || { echo 'structured deploy output missing HTTPS target' >&2; cat "$bootstrap_output" >&2; exit 1; }

api_origin="$(TARGET="$target" node <<'NODE'
const target = String(process.env.TARGET || '').trim();
const url = new URL(target);
if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid deployment target');
if (/(^|\.)vercel\.app$/i.test(url.hostname)) throw new Error('Vercel API origin is forbidden');
process.stdout.write(url.origin);
NODE
)"
test -n "$api_origin"

ready=false
for attempt in $(seq 1 24); do
  if curl --fail --silent --show-error \
    --header 'Origin: https://a7sncom.github.io' \
    --header 'Cache-Control: no-cache' \
    "${api_origin}/health?pages005-bootstrap=${GITHUB_RUN_ID}-${attempt}" \
    --output "$RUNNER_TEMP/pages005-bootstrap-health.json"; then
    observed="$(jq -r '.compatibility.worker.versionId // ""' "$RUNNER_TEMP/pages005-bootstrap-health.json" 2>/dev/null || true)"
    if [ "$observed" = "$bootstrap_version" ] && jq -e \
      '.ok == true and
       .compatibility.protocol.id == "yakolak-online-room" and
       .compatibility.protocol.version == "1" and
       .compatibility.capabilities.id == "yakolak-online-room-capabilities-v1" and
       .compatibility.turso.id == "yakolak-pages005-room-probe" and
       .compatibility.turso.version == 1' \
      "$RUNNER_TEMP/pages005-bootstrap-health.json" >/dev/null 2>&1; then
      ready=true
      break
    fi
  fi
  sleep 5
done
test "$ready" = true || { echo 'bootstrap Worker never became identity-ready' >&2; exit 1; }
node scripts/probe-pages005-cloudflare-roundtrip.mjs "$api_origin"

rm -f "$twin_output"
WRANGLER_OUTPUT_FILE_PATH="$twin_output" \
  npx --yes wrangler@4 versions upload \
    --config backend/cloudflare/wrangler.jsonc \
    --secrets-file "$secrets_file" \
    --message 'PAGES-005 rollback-window active twin'

test -s "$twin_output"
twin_version="$(jq -rs '[.[] | select(.type == "version-upload")][-1].version_id // empty' "$twin_output")"
test -n "$twin_version" || { echo 'structured version-upload output missing version_id' >&2; cat "$twin_output" >&2; exit 1; }
test "$twin_version" != "$bootstrap_version"

rm -f "$window_output"
WRANGLER_OUTPUT_FILE_PATH="$window_output" \
  npx --yes wrangler@4 versions deploy \
    "${twin_version}@100%" \
    "${bootstrap_version}@0%" \
    --config backend/cloudflare/wrangler.jsonc \
    --message 'PAGES-005 active+previous rollback window' \
    -y

test -s "$window_output"
jq -s -e 'any(.[]; .type == "version-deploy")' "$window_output" >/dev/null || {
  echo 'structured output missing version-deploy completion' >&2
  cat "$window_output" >&2
  exit 1
}

proved=false
for attempt in $(seq 1 12); do
  if API_ORIGIN="$api_origin" \
     ACTIVE_WORKER_VERSION="$twin_version" \
     PREVIOUS_WORKER_VERSION="$bootstrap_version" \
     PAGES015_EVIDENCE_PATH="$evidence" \
     node scripts/probe-pages015-live-compatibility.mjs; then
    proved=true
    break
  fi
  echo "Worker rollback window not globally ready yet (attempt ${attempt}); retrying."
  sleep 5
done
test "$proved" = true || { echo 'active+previous Worker override/Turso proof failed' >&2; exit 1; }

PAGES015_API_ORIGIN="$api_origin" npx --yes playwright install chromium
PAGES015_API_ORIGIN="$api_origin" npx --yes playwright test tests/pages015-browser-cors.spec.js --workers=1

# Re-prove the exact version window immediately before committing the public lock files.
API_ORIGIN="$api_origin" \
ACTIVE_WORKER_VERSION="$twin_version" \
PREVIOUS_WORKER_VERSION="$bootstrap_version" \
PAGES015_EVIDENCE_PATH="$final_evidence" \
node scripts/probe-pages015-live-compatibility.mjs

test -s "$final_evidence"
jq -e \
  --arg apiOrigin "$api_origin" \
  --arg active "$twin_version" \
  --arg previous "$bootstrap_version" '
    .gate == "PAGES-015" and
    .verified == true and
    .apiOrigin == $apiOrigin and
    .protocolIdentity == "yakolak-online-room@1" and
    .capabilityIdentity == "yakolak-online-room-capabilities-v1" and
    (.capabilities | sort) == ["health.compatibility.v1","room-probe.read.v1","room-probe.write.v1"] and
    .tursoSchemaId == "yakolak-pages005-room-probe" and
    .tursoSchemaVersion == 1 and
    .migrationPolicy == "expand-contract-forward-only" and
    .tursoDataRollbackRequired == false and
    .liveHealthVerified == true and
    .corsHeadersVerified == true and
    .liveTursoRoundTripVerified == true and
    (.workerWindow | length) == 2 and
    any(.workerWindow[]; .role == "active" and .workerVersionId == $active and .healthVerified == true and .tursoRoundTripVerified == true) and
    any(.workerWindow[]; .role == "previous" and .workerVersionId == $previous and .healthVerified == true and .tursoRoundTripVerified == true)
  ' "$final_evidence" >/dev/null

curl --fail --silent --show-error \
  --header 'Origin: https://a7sncom.github.io' \
  --header 'Cache-Control: no-cache' \
  "${api_origin}/health?pages005-final=${GITHUB_RUN_ID}" \
  --output "$RUNNER_TEMP/pages005-final-health.json"
jq -e --arg active "$twin_version" \
  '.ok == true and .compatibility.worker.versionId == $active' \
  "$RUNNER_TEMP/pages005-final-health.json" >/dev/null

final_evidence_sha="$(sha256sum "$final_evidence" | awk '{print $1}')"

# Discard build/test workspace mutations before writing the two public proof files.
git fetch --quiet origin threejs-rebuild
git reset --hard origin/threejs-rebuild
git clean -fd
mkdir -p backend/cloudflare
printf '%s\n' "$api_origin" > backend/cloudflare/API_ORIGIN.txt
jq -n \
  --arg apiOrigin "$api_origin" \
  --arg activeWorkerVersionId "$twin_version" \
  --arg previousWorkerVersionId "$bootstrap_version" \
  --arg evidenceSha256 "$final_evidence_sha" \
  --arg workflowRunId "$GITHUB_RUN_ID" \
  --arg recordedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --slurpfile proof "$final_evidence" '
  {
    schemaVersion: 1,
    gate: "PAGES-005",
    provider: "cloudflare-workers",
    workerName: "yakolak-room-api",
    apiOrigin: $apiOrigin,
    activeWorkerVersionId: $activeWorkerVersionId,
    previousWorkerVersionId: $previousWorkerVersionId,
    protocolIdentity: $proof[0].protocolIdentity,
    capabilityIdentity: $proof[0].capabilityIdentity,
    capabilities: $proof[0].capabilities,
    tursoSchemaId: $proof[0].tursoSchemaId,
    tursoSchemaVersion: $proof[0].tursoSchemaVersion,
    traffic: {activePercent: 100, previousPercent: 0},
    versionOverrideProof: true,
    browserCorsVerified: true,
    liveTursoRoundTripVerified: true,
    finalEvidenceSha256: $evidenceSha256,
    migrationPolicy: "expand-contract-forward-only",
    tursoDataRollbackRequired: false,
    workflowRunId: ($workflowRunId|tonumber),
    recordedAt: $recordedAt
  }' > backend/cloudflare/WORKER_ROLLBACK_WINDOW.json

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add backend/cloudflare/API_ORIGIN.txt backend/cloudflare/WORKER_ROLLBACK_WINDOW.json
if git diff --cached --quiet; then
  echo 'Proven live API origin and Worker rollback window already locked.'
  exit 0
fi
git diff --cached --name-only | grep -qx 'backend/cloudflare/API_ORIGIN.txt'
git diff --cached --name-only | grep -qx 'backend/cloudflare/WORKER_ROLLBACK_WINDOW.json'
test "$(git diff --cached --name-only | wc -l)" -eq 2
git commit -m 'PAGES-005 lock proven Cloudflare rollback window'
git push origin HEAD:threejs-rebuild
