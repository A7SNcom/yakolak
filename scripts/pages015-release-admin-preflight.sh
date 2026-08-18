#!/usr/bin/env bash
set -euo pipefail

required=(GITHUB_REPOSITORY GITHUB_RUN_ID PAGES_RELEASE_ADMIN_TOKEN)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "missing required environment value: ${name}" >&2; exit 2; }
done

window='RELEASE_QUALIFICATION/ONLINE_FRONTEND_WINDOW.json'
test -s "$window"

active_sha="$(jq -r '.frontends[] | select(.role == "active") | .threejsCandidateSha' "$window")"
previous_sha="$(jq -r '.frontends[] | select(.role == "previous") | .threejsCandidateSha' "$window")"
[[ "$active_sha" =~ ^[a-f0-9]{40}$ ]]
[[ "$previous_sha" =~ ^[a-f0-9]{40}$ ]]

export GH_TOKEN="$PAGES_RELEASE_ADMIN_TOKEN"
created_refs=()
cleanup() {
  local ref api_ref
  for ref in "${created_refs[@]:-}"; do
    test -n "$ref" || continue
    api_ref="${ref#refs/}"
    gh api --method DELETE "repos/${GITHUB_REPOSITORY}/git/refs/${api_ref}" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=1" >/dev/null

probe_tag_ref() {
  local role="$1" target="$2" ref api_ref actual
  ref="refs/tags/pages015-admin-capability-probe-${GITHUB_RUN_ID}-${role}-${target:0:8}"
  api_ref="${ref#refs/}"

  if gh api "repos/${GITHUB_REPOSITORY}/git/ref/${api_ref}" >/dev/null 2>&1; then
    echo "release-admin preflight tag collision: ${ref}" >&2
    exit 1
  fi

  gh api --method POST "repos/${GITHUB_REPOSITORY}/git/refs" \
    -f ref="$ref" -f sha="$target" >/dev/null
  created_refs+=("$ref")

  actual="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/${api_ref}" --jq '.object.sha')"
  test "$actual" = "$target" || {
    echo "release-admin preflight tag target mismatch for ${role}" >&2
    exit 1
  }

  gh api --method DELETE "repos/${GITHUB_REPOSITORY}/git/refs/${api_ref}" >/dev/null
  created_refs=("${created_refs[@]:0:${#created_refs[@]}-1}")
}

# Temporary tag refs deliberately exercise the same class of ref mutation required when
# GitHub publishes the locked releases. This catches an under-scoped token (notably missing
# Workflows write permission for candidate history containing workflow-file changes) before
# expensive exact-byte archive work. Every probe tag is deleted immediately.
probe_tag_ref active "$active_sha"
probe_tag_ref previous "$previous_sha"

trap - EXIT
echo 'PAGES-015 release-admin preflight passed: release read + exact candidate tag create/read/delete capability.'
