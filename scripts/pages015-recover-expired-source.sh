#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo 'usage: pages015-recover-expired-source.sh <root-source> <candidate-source> <layout.json> <output-dir>' >&2
  exit 2
}

[ "$#" -eq 4 ] || usage
root_source="$1"
candidate_source="$2"
layout="$3"
out="$4"

required=(
  GODOT_ROOT_SHA THREEJS_CANDIDATE_SHA EXPECTED_ARTIFACT_SHA256
  EXPECTED_DEPLOYMENT_GENERATION EXPECTED_RUNTIME_SHA256 EXPECTED_CONTENT_IDENTITY_SHA256
)
for name in "${required[@]}"; do
  test -n "${!name:-}" || { echo "missing required environment value: ${name}" >&2; exit 2; }
done

[[ "$GODOT_ROOT_SHA" =~ ^[a-f0-9]{40}$ ]]
[[ "$THREEJS_CANDIDATE_SHA" =~ ^[a-f0-9]{40}$ ]]
[[ "$EXPECTED_ARTIFACT_SHA256" =~ ^[a-f0-9]{64}$ ]]
[[ "$EXPECTED_DEPLOYMENT_GENERATION" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "$EXPECTED_RUNTIME_SHA256" =~ ^[a-f0-9]{64}$ ]]
[[ "$EXPECTED_CONTENT_IDENTITY_SHA256" =~ ^[a-f0-9]{64}$ ]]
test -s "$layout"
test -s "$root_source/web/index.html"
test -s "$candidate_source/web/index.html"

rm -rf "$out"
mkdir -p "$out/site"
site="$out/site"

# Re-run the exact PAGES-002 composition contract from the immutable source SHAs.
rsync -a "$root_source/web/" "$site/"
mkdir -p "$site/threejs"
rsync -a "$candidate_source/web/" "$site/threejs/"
touch "$site/.nojekyll"

cmp "$root_source/web/index.html" "$site/index.html"
cmp "$candidate_source/web/index.html" "$site/threejs/index.html"
diff -qr --exclude=threejs --exclude=.nojekyll "$root_source/web" "$site"
diff -qr "$candidate_source/web" "$site/threejs"

# These locked archives predate API_ORIGIN, so the exact public config is the absent-origin shape.
FRONTEND_SHA="$THREEJS_CANDIDATE_SHA" SITE="$site" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const config = {
  frontendSha: process.env.FRONTEND_SHA,
  protocolVersion: '1',
  apiOrigin: null,
  environment: 'production',
  branch: 'threejs-rebuild',
  apiOriginState: 'absent',
};
fs.writeFileSync(path.join(process.env.SITE, 'threejs/runtime-config.json'), `${JSON.stringify(config, null, 2)}\n`);
NODE

runtime_hash="$(sha256sum "$site/threejs/runtime-config.json" | awk '{print $1}')"
test "$runtime_hash" = "$EXPECTED_RUNTIME_SHA256"

manifest_tmp="$out/content-manifest.txt"
(
  cd "$site"
  find . -type f ! -name 'deployment-manifest.json' -printf '%P\n' \
    | LC_ALL=C sort \
    | while IFS= read -r rel; do
        digest="$(sha256sum "$rel" | awk '{print $1}')"
        printf '%s  %s\n' "$digest" "$rel"
      done
) > "$manifest_tmp"
content_identity="$(sha256sum "$manifest_tmp" | awk '{print $1}')"
test "$content_identity" = "$EXPECTED_CONTENT_IDENTITY_SHA256"

generation_digest="$(
  printf 'pages-deployment-generation-v1\n%s\n%s\n%s\n' \
    "$GODOT_ROOT_SHA" "$THREEJS_CANDIDATE_SHA" "$runtime_hash" \
    | sha256sum | awk '{print $1}'
)"
deployment_generation="sha256:${generation_digest}"
test "$deployment_generation" = "$EXPECTED_DEPLOYMENT_GENERATION"

jq -n \
  --arg generation "$deployment_generation" \
  --arg godotRootSha "$GODOT_ROOT_SHA" \
  --arg threejsCandidateSha "$THREEJS_CANDIDATE_SHA" \
  --arg runtimeHash "$runtime_hash" \
  --arg protocolVersion '1' \
  --arg contentIdentity "$content_identity" \
  '{
    schemaVersion: 1,
    generationSchema: "pages-deployment-generation-v1",
    deploymentGeneration: $generation,
    godotRootSha: $godotRootSha,
    threejsCandidateSha: $threejsCandidateSha,
    publicRuntimeProtocol: {
      sha256: $runtimeHash,
      protocolVersion: $protocolVersion
    },
    contentIdentity: {
      algorithm: "sha256-canonical-file-manifest-v1",
      sha256: $contentIdentity,
      excludes: ["deployment-manifest.json"]
    }
  }' > "$site/deployment-manifest.json"

# Validate the compact historical tar-layout oracle before using it.
jq -e \
  --arg role "${ROLE:-}" '
    .schemaVersion == 1 and
    .role == $role and
    .owner.uid == 1001 and .owner.gid == 1001 and
    .owner.uname == "runner" and .owner.gname == "runner" and
    .entryFormat == ["name","type","mode","mtime","size"] and
    (.entries | length) == 114 and
    all(.entries[]; (length == 5) and (.[0] | type == "string") and (.[1] == "f" or .[1] == "d"))
  ' "$layout" >/dev/null

# Reconstruct the GNU tar header stream explicitly. This was proven locally against the
# preserved historical tar: files + layout reproduce the exact SHA byte-for-byte.
SITE="$site" LAYOUT="$layout" OUTPUT="$out/artifact.tar" python3 <<'PY'
import json, os, pathlib, tarfile
site = pathlib.Path(os.environ['SITE'])
layout = json.load(open(os.environ['LAYOUT'], encoding='utf-8'))
owner = layout['owner']
output = os.environ['OUTPUT']

with tarfile.open(output, 'w', format=tarfile.GNU_FORMAT) as tf:
    for name, kind, mode, mtime, expected_size in layout['entries']:
        ti = tarfile.TarInfo(name)
        ti.mode = int(mode, 8)
        ti.uid = int(owner['uid'])
        ti.gid = int(owner['gid'])
        ti.uname = owner['uname']
        ti.gname = owner['gname']
        ti.mtime = int(mtime)
        if kind == 'd':
            ti.type = tarfile.DIRTYPE
            ti.size = 0
            target = site if name == '.' else site / name.removeprefix('./')
            if not target.is_dir():
                raise SystemExit(f'missing expected directory: {name}')
            tf.addfile(ti)
            continue

        target = site / name.removeprefix('./')
        if not target.is_file():
            raise SystemExit(f'missing expected file: {name}')
        actual_size = target.stat().st_size
        if actual_size != int(expected_size):
            raise SystemExit(f'size mismatch for {name}: expected {expected_size}, got {actual_size}')
        ti.type = tarfile.REGTYPE
        ti.size = actual_size
        with target.open('rb') as fh:
            tf.addfile(ti, fh)
PY

actual_sha="$(sha256sum "$out/artifact.tar" | awk '{print $1}')"
if [ "$actual_sha" != "$EXPECTED_ARTIFACT_SHA256" ]; then
  echo "exact-byte recovery failed: expected ${EXPECTED_ARTIFACT_SHA256}, got ${actual_sha}" >&2
  exit 1
fi

jq -n \
  --arg role "${ROLE:-}" \
  --arg godotRootSha "$GODOT_ROOT_SHA" \
  --arg threejsCandidateSha "$THREEJS_CANDIDATE_SHA" \
  --arg artifactSha256 "$actual_sha" \
  --arg deploymentGeneration "$deployment_generation" \
  --arg publicRuntimeProtocolSha256 "$runtime_hash" \
  --arg contentIdentitySha256 "$content_identity" \
  --arg layoutSha256 "$(sha256sum "$layout" | awk '{print $1}')" \
  '{
    schemaVersion: 1,
    recovery: "exact-byte-git-sources-plus-historical-tar-layout-v1",
    role: $role,
    godotRootSha: $godotRootSha,
    threejsCandidateSha: $threejsCandidateSha,
    artifactName: "artifact.tar",
    artifactSha256: $artifactSha256,
    deploymentGeneration: $deploymentGeneration,
    publicRuntimeProtocolSha256: $publicRuntimeProtocolSha256,
    contentIdentitySha256: $contentIdentitySha256,
    tarLayoutSha256: $layoutSha256,
    exactSha256MatchRequired: true
  }' > "$out/SOURCE_RECOVERY_PROVENANCE.json"
printf '%s  artifact.tar\n' "$actual_sha" > "$out/ARTIFACT_SHA256SUMS"
(cd "$out" && sha256sum -c ARTIFACT_SHA256SUMS)

echo "PAGES-015 exact expired-source recovery verified: ${ROLE:-unknown} / ${actual_sha}"
