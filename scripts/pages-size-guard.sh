#!/usr/bin/env bash
set -euo pipefail

site_dir="${1:-pages-site}"

# These are YAKOLAK internal architecture guards, not mirrors of mutable GitHub
# platform policy. Current official GitHub policy is timestamped separately in
# PAGES_STATIC_HOST_TRAFFIC_BOUNDARY.md and must be re-read at release checkpoints.
SITE_BUDGET_BYTES=$((128 * 1024 * 1024))
ROUTE_CACHE_BUDGET_BYTES=$((64 * 1024 * 1024))
FILE_BUDGET_BYTES=$((64 * 1024 * 1024))
REPO_BUDGET_KIB=$((512 * 1024))

if [[ ! -d "${site_dir}" ]]; then
  echo "Pages size guard: missing site directory: ${site_dir}" >&2
  exit 1
fi

manifest="pages-size-manifest.tsv"
: > "${manifest}"
while IFS= read -r -d '' file; do
  rel="${file#${site_dir}/}"
  bytes="$(stat -c '%s' "${file}")"
  printf '%s\t%s\n' "${bytes}" "${rel}" >> "${manifest}"
done < <(find "${site_dir}" -type f -print0)
LC_ALL=C sort -t $'\t' -k2,2 "${manifest}" -o "${manifest}"

file_count="$(wc -l < "${manifest}" | tr -d ' ')"
total_bytes="$(awk -F '\t' '{sum += $1} END {printf "%.0f", sum}' "${manifest}")"
root_bytes="$(awk -F '\t' '$2 !~ /^threejs\// {sum += $1} END {printf "%.0f", sum}' "${manifest}")"
threejs_bytes="$(awk -F '\t' '$2 ~ /^threejs\// {sum += $1} END {printf "%.0f", sum}' "${manifest}")"
largest="$(LC_ALL=C sort -t $'\t' -k1,1nr "${manifest}" | head -n 1)"
largest_bytes="${largest%%$'\t'*}"
largest_path="${largest#*$'\t'}"

printf 'Pages inventory: %s files, %s bytes total\n' "${file_count}" "${total_bytes}"
printf 'Route envelopes: root=%s bytes, threejs=%s bytes\n' "${root_bytes}" "${threejs_bytes}"
printf 'Largest file: %s bytes %s\n' "${largest_bytes}" "${largest_path}"
printf 'Internal budgets: site=%s, route-cache=%s, file=%s bytes\n' \
  "${SITE_BUDGET_BYTES}" "${ROUTE_CACHE_BUDGET_BYTES}" "${FILE_BUDGET_BYTES}"
printf 'Mutable GitHub platform policy: see timestamped PAGES_STATIC_HOST_TRAFFIC_BOUNDARY.md snapshot\n'
cat "${manifest}"

if (( total_bytes > SITE_BUDGET_BYTES )); then
  echo "Refusing Pages delivery: ${total_bytes} bytes exceeds the 128 MiB internal site budget." >&2
  echo 'Do not relax the budget; use the tested immutable external-asset strategy.' >&2
  exit 1
fi
for route_bytes in "${root_bytes}" "${threejs_bytes}"; do
  if (( route_bytes > ROUTE_CACHE_BUDGET_BYTES )); then
    echo "Refusing Pages delivery: route footprint ${route_bytes} bytes exceeds the 64 MiB transfer/cache budget." >&2
    echo 'Do not relax the budget; use the tested immutable external-asset strategy.' >&2
    exit 1
  fi
done
if (( largest_bytes > FILE_BUDGET_BYTES )); then
  echo "Refusing Pages delivery: ${largest_path} is ${largest_bytes} bytes, above the 64 MiB internal file budget." >&2
  echo 'The internal file budget is intentionally independent of mutable GitHub file-size policy.' >&2
  exit 1
fi

while IFS= read -r -d '' file; do
  if LC_ALL=C head -c 42 "${file}" 2>/dev/null \
    | grep -aFqx 'version https://git-lfs.github.com/spec/v1'; then
    echo "Refusing Pages delivery: Git LFS pointer detected in ${file}. YAKOLAK Pages artifacts require real public static bytes." >&2
    exit 1
  fi
done < <(find "${site_dir}" -type f -print0)

if [[ -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_TOKEN:-}" ]]; then
  repo_json="$(curl --fail --silent --show-error \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}")"
  repo_size_kib="$(jq -er '.size' <<<"${repo_json}")"
  printf 'GitHub repository API size: %s KiB (internal budget %s KiB)\n' \
    "${repo_size_kib}" "${REPO_BUDGET_KIB}"
  if (( repo_size_kib > REPO_BUDGET_KIB )); then
    echo "Refusing Pages delivery: repository API size ${repo_size_kib} KiB exceeds the 512 MiB internal repository budget." >&2
    exit 1
  fi
fi
