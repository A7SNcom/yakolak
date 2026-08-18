#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?}"
: "${GITHUB_PATH:?}"

real_gh="$(command -v gh)"
repo_root="$(git rev-parse --show-toplevel)"
original_path="$PATH"
shim_dir="$RUNNER_TEMP/pages015-source-gh-shim"
mkdir -p "$shim_dir"

cat > "$shim_dir/gh" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail

: "${PAGES015_REAL_GH:?}"
: "${PAGES015_ORIGINAL_PATH:?}"
: "${PAGES015_REPO_ROOT:?}"
: "${GITHUB_REPOSITORY:?}"
: "${SOURCE_PAGES_RUN_ID:?}"
: "${SOURCE_PAGES_ARTIFACT_ID:?}"

# Preserve the historical helper contract for the one source-artifact listing call.
# The subsequent download is resolved by exact SHA from original/preserved/reconstructed bytes.
if [ "$#" -eq 2 ] && [ "$1" = api ] && \
   [ "$2" = "repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_PAGES_RUN_ID}/artifacts" ]; then
  printf '{"artifacts":[{"id":%s,"name":"github-pages","expired":false}]}\n' "$SOURCE_PAGES_ARTIFACT_ID"
  exit 0
fi

if [ "$#" -ge 3 ] && [ "$1" = run ] && [ "$2" = download ] && [ "$3" = "$SOURCE_PAGES_RUN_ID" ]; then
  shift 3
  name=''
  dir=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --repo)
        shift 2
        ;;
      --name)
        name="${2:-}"
        shift 2
        ;;
      --dir)
        dir="${2:-}"
        shift 2
        ;;
      *)
        echo "unsupported gh run download argument in PAGES-015 recovery shim: $1" >&2
        exit 2
        ;;
    esac
  done
  test "$name" = github-pages || { echo "unexpected artifact name: $name" >&2; exit 2; }
  test -n "$dir" || { echo 'missing --dir for recovered exact source' >&2; exit 2; }
  mkdir -p "$dir"
  PATH="$PAGES015_ORIGINAL_PATH" \
    bash "$PAGES015_REPO_ROOT/scripts/pages015-resolve-exact-pages-source.sh" "$dir/artifact.tar"
  exit 0
fi

exec "$PAGES015_REAL_GH" "$@"
SHIM
chmod 0755 "$shim_dir/gh"

# Export values for the shim in subsequent Actions steps without exposing credentials.
{
  echo "PAGES015_REAL_GH=$real_gh"
  echo "PAGES015_ORIGINAL_PATH=$original_path"
  echo "PAGES015_REPO_ROOT=$repo_root"
} >> "$GITHUB_ENV"
printf '%s\n' "$shim_dir" >> "$GITHUB_PATH"

echo "PAGES-015 exact-source gh shim installed: ${shim_dir}"
