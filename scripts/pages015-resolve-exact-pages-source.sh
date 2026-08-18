#!/usr/bin/env bash
set -euo pipefail

[ "$#" -eq 1 ] || { echo 'usage: pages015-resolve-exact-pages-source.sh <output-artifact.tar>' >&2; exit 2; }
output="$1"

required=(
  ROLE GITHUB_REPOSITORY GH_TOKEN SOURCE_PAGES_RUN_ID SOURCE_PAGES_ARTIFACT_ID
  SOURCE_ARTIFACT_TAR_SHA256 GODOT_ROOT_SHA THREEJS_CANDIDATE_SHA
  DEPLOYMENT_GENERATION PUBLIC_RUNTIME_PROTOCOL_SHA256 CONTENT_IDENTITY_SHA256
)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "missing required environment value: ${name}" >&2; exit 2; }
done
[[ "$ROLE" == active || "$ROLE" == previous ]]
[[ "$SOURCE_ARTIFACT_TAR_SHA256" =~ ^[a-f0-9]{64}$ ]]

mkdir -p "$(dirname "$output")"
rm -f "$output"
work="${RUNNER_TEMP:-/tmp}/pages015-source-resolve-${ROLE}"
rm -rf "$work"
mkdir -p "$work"

verify_tar() {
  local path="$1" source="$2"
  test -s "$path"
  local sha
  sha="$(sha256sum "$path" | awk '{print $1}')"
  test "$sha" = "$SOURCE_ARTIFACT_TAR_SHA256" || {
    echo "${source} source SHA mismatch for ${ROLE}: expected ${SOURCE_ARTIFACT_TAR_SHA256}, got ${sha}" >&2
    return 1
  }
  cp "$path" "$output"
  cmp "$path" "$output"
  echo "PAGES-015 exact source resolved from ${source}: ${ROLE} / ${sha}"
}

# 1) Prefer the original successful Pages artifact while GitHub still retains it.
run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_PAGES_RUN_ID}")"
jq -e '.status == "completed" and .conclusion == "success"' <<<"$run_json" >/dev/null
artifacts_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_PAGES_RUN_ID}/artifacts")"
original_available=false
if jq -e --argjson id "$SOURCE_PAGES_ARTIFACT_ID" '
  any(.artifacts[]; .id == $id and .name == "github-pages" and .expired == false)
' <<<"$artifacts_json" >/dev/null; then
  original_available=true
fi

if [ "$original_available" = true ]; then
  mkdir -p "$work/original"
  gh run download "$SOURCE_PAGES_RUN_ID" --repo "$GITHUB_REPOSITORY" --name github-pages --dir "$work/original"
  if verify_tar "$work/original/artifact.tar" 'original-pages-artifact'; then
    exit 0
  fi
  echo 'Original retained artifact existed but did not match the locked SHA; refusing fallback.' >&2
  exit 1
fi

# 2) Prefer the independently recovered/preserved v4 Actions artifact.
recovered='RELEASE_QUALIFICATION/PAGES015_RECOVERED_SOURCES.json'
if [ -s "$recovered" ]; then
  row="$(jq -c \
    --arg role "$ROLE" \
    --arg digest "$SOURCE_ARTIFACT_TAR_SHA256" \
    --argjson originalRun "$SOURCE_PAGES_RUN_ID" \
    --argjson originalArtifact "$SOURCE_PAGES_ARTIFACT_ID" '
      .artifacts[]
      | select(.role == $role)
      | select(.pagesTarSha256 == $digest)
      | select(.originalPagesRunId == $originalRun)
      | select(.originalPagesArtifactId == $originalArtifact)
    ' "$recovered" | head -n1)"
  if [ -n "$row" ]; then
    recovered_id="$(jq -r '.artifactId' <<<"$row")"
    recovered_zip_digest="$(jq -r '.actionsArtifactDigest' <<<"$row")"
    recovered_name="$(jq -r '.artifactName' <<<"$row")"
    metadata="$(gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/${recovered_id}" 2>/dev/null || true)"
    if [ -n "$metadata" ] && jq -e \
      --arg name "$recovered_name" '.expired == false and .name == $name' <<<"$metadata" >/dev/null 2>&1; then
      zip="$work/recovered.zip"
      curl --fail --silent --show-error --location --retry 3 --retry-all-errors \
        --header 'Accept: application/vnd.github+json' \
        --header "Authorization: Bearer ${GH_TOKEN}" \
        --header 'X-GitHub-Api-Version: 2026-03-10' \
        "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/artifacts/${recovered_id}/zip" \
        --output "$zip"
      test "$(sha256sum "$zip" | awk '{print $1}')" = "$recovered_zip_digest"
      mkdir -p "$work/recovered"
      unzip -q "$zip" -d "$work/recovered"
      test -s "$work/recovered/SOURCE_RECOVERY_PROVENANCE.json"
      jq -e \
        --arg role "$ROLE" \
        --arg root "$GODOT_ROOT_SHA" \
        --arg candidate "$THREEJS_CANDIDATE_SHA" \
        --arg digest "$SOURCE_ARTIFACT_TAR_SHA256" \
        --arg generation "$DEPLOYMENT_GENERATION" \
        --arg runtime "$PUBLIC_RUNTIME_PROTOCOL_SHA256" \
        --arg content "$CONTENT_IDENTITY_SHA256" '
          .schemaVersion == 1 and
          .recovery == "exact-byte-git-sources-plus-historical-tar-layout-v1" and
          .role == $role and
          .godotRootSha == $root and
          .threejsCandidateSha == $candidate and
          .artifactSha256 == $digest and
          .deploymentGeneration == $generation and
          .publicRuntimeProtocolSha256 == $runtime and
          .contentIdentitySha256 == $content and
          .exactSha256MatchRequired == true
        ' "$work/recovered/SOURCE_RECOVERY_PROVENANCE.json" >/dev/null
      if verify_tar "$work/recovered/artifact.tar" 'preserved-recovered-actions-artifact'; then
        exit 0
      fi
      echo 'Preserved recovered artifact metadata existed but exact tar verification failed; refusing reconstruction fallback.' >&2
      exit 1
    fi
  fi
fi

# 3) Durable last resort: reconstruct from the immutable Git source SHAs + historical tar layout.
# The reconstructed tar is accepted ONLY when its SHA equals the original Pages artifact digest.
repo_root="$(git rev-parse --show-toplevel)"
layout="${repo_root}/RELEASE_QUALIFICATION/PAGES015_TAR_LAYOUT/${ROLE}.json"
test -s "$layout"

git fetch --quiet origin "$GODOT_ROOT_SHA" "$THREEJS_CANDIDATE_SHA"
root_tree="$work/root-source"
candidate_tree="$work/candidate-source"
git worktree add --quiet --detach "$root_tree" "$GODOT_ROOT_SHA"
git worktree add --quiet --detach "$candidate_tree" "$THREEJS_CANDIDATE_SHA"
cleanup() {
  git worktree remove --force "$candidate_tree" >/dev/null 2>&1 || true
  git worktree remove --force "$root_tree" >/dev/null 2>&1 || true
}
trap cleanup EXIT

rebuild="$work/reconstructed"
ROLE="$ROLE" \
GODOT_ROOT_SHA="$GODOT_ROOT_SHA" \
THREEJS_CANDIDATE_SHA="$THREEJS_CANDIDATE_SHA" \
EXPECTED_ARTIFACT_SHA256="$SOURCE_ARTIFACT_TAR_SHA256" \
EXPECTED_DEPLOYMENT_GENERATION="$DEPLOYMENT_GENERATION" \
EXPECTED_RUNTIME_SHA256="$PUBLIC_RUNTIME_PROTOCOL_SHA256" \
EXPECTED_CONTENT_IDENTITY_SHA256="$CONTENT_IDENTITY_SHA256" \
bash "$repo_root/scripts/pages015-recover-expired-source.sh" \
  "$root_tree" "$candidate_tree" "$layout" "$rebuild"

verify_tar "$rebuild/artifact.tar" 'deterministic-git-layout-reconstruction'
