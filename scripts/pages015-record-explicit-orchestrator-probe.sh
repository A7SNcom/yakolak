#!/usr/bin/env bash
set -euo pipefail

required=(GITHUB_RUN_ID GITHUB_EVENT_NAME GITHUB_SHA)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "missing required environment value: ${name}" >&2; exit 2; }
done

present() { if [ -n "$1" ]; then printf true; else printf false; fi; }
release_admin="$(present "${PAGES_RELEASE_ADMIN_TOKEN:-}")"
cf_token="$(present "${CLOUDFLARE_API_TOKEN:-}")"
cf_account="$(present "${CLOUDFLARE_ACCOUNT_ID:-}")"
turso_url="$(present "${TURSO_DATABASE_URL:-}")"
turso_token="$(present "${TURSO_AUTH_TOKEN:-}")"
backend_ready=false
if [ "$cf_token" = true ] && [ "$cf_account" = true ] && [ "$turso_url" = true ] && [ "$turso_token" = true ]; then
  backend_ready=true
fi

worker_lock_present=false
if [ -s backend/cloudflare/API_ORIGIN.txt ] && [ -s backend/cloudflare/WORKER_ROLLBACK_WINDOW.json ]; then
  worker_lock_present=true
fi

receipt='RELEASE_QUALIFICATION/PAGES015_ORCHESTRATOR_RUN.json'
mkdir -p "$(dirname "$receipt")"
jq -n \
  --arg runId "$GITHUB_RUN_ID" \
  --arg eventName "$GITHUB_EVENT_NAME" \
  --arg triggerHeadSha "$GITHUB_SHA" \
  --argjson releaseAdmin "$release_admin" \
  --argjson cfToken "$cf_token" \
  --argjson cfAccount "$cf_account" \
  --argjson tursoUrl "$turso_url" \
  --argjson tursoToken "$turso_token" \
  --argjson backendReady "$backend_ready" \
  --argjson workerLockPresent "$worker_lock_present" \
  --arg recordedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  {
    schemaVersion: 1,
    gate: "PAGES-015",
    event: "explicit_orchestrator_credential_probe",
    workflowRunId: ($runId|tonumber),
    eventName: $eventName,
    triggerHeadSha: $triggerHeadSha,
    credentials: {
      pagesReleaseAdminTokenPresent: $releaseAdmin,
      cloudflareApiTokenPresent: $cfToken,
      cloudflareAccountIdPresent: $cfAccount,
      tursoDatabaseUrlPresent: $tursoUrl,
      tursoAuthTokenPresent: $tursoToken,
      backendCredentialsReady: $backendReady
    },
    workerLockFilesPresent: $workerLockPresent,
    containsSecretValues: false,
    qualificationEvidence: false,
    recordedAt: $recordedAt
  }
' > "$receipt"

git fetch --quiet origin threejs-rebuild
git reset --hard origin/threejs-rebuild
# Recreate after reset so the receipt is based on the latest branch and is the only staged path.
jq -n \
  --arg runId "$GITHUB_RUN_ID" \
  --arg eventName "$GITHUB_EVENT_NAME" \
  --arg triggerHeadSha "$GITHUB_SHA" \
  --argjson releaseAdmin "$release_admin" \
  --argjson cfToken "$cf_token" \
  --argjson cfAccount "$cf_account" \
  --argjson tursoUrl "$turso_url" \
  --argjson tursoToken "$turso_token" \
  --argjson backendReady "$backend_ready" \
  --argjson workerLockPresent "$worker_lock_present" \
  --arg recordedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  {
    schemaVersion: 1,
    gate: "PAGES-015",
    event: "explicit_orchestrator_credential_probe",
    workflowRunId: ($runId|tonumber),
    eventName: $eventName,
    triggerHeadSha: $triggerHeadSha,
    credentials: {
      pagesReleaseAdminTokenPresent: $releaseAdmin,
      cloudflareApiTokenPresent: $cfToken,
      cloudflareAccountIdPresent: $cfAccount,
      tursoDatabaseUrlPresent: $tursoUrl,
      tursoAuthTokenPresent: $tursoToken,
      backendCredentialsReady: $backendReady
    },
    workerLockFilesPresent: $workerLockPresent,
    containsSecretValues: false,
    qualificationEvidence: false,
    recordedAt: $recordedAt
  }
' > "$receipt"

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add "$receipt"
git diff --cached --name-only | grep -qx "$receipt"
test "$(git diff --cached --name-only | wc -l)" -eq 1
git commit -m 'PAGES-015 record explicit credential probe receipt'
git push origin HEAD:threejs-rebuild
