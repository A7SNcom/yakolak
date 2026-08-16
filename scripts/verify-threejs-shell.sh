#!/usr/bin/env bash
set -euo pipefail

required=(
  web/index.html
  web/styles/app.css
  web/app/boot/boot.js
  web/app/boot/fatal-error.js
  web/app/boot/build-marker.js
  web/app/scene/renderer.js
  web/app/scene/preview-scene.js
  web/vendor/three/r185/three.module.js
  web/vendor/three/r185/three.core.js
  tests/threejs_renderer_owner_contract.test.mjs
)

for file in "${required[@]}"; do
  test -s "$file" || { echo "Missing required Three.js shell file: $file" >&2; exit 1; }
done

if find web -type f \( -name '*.pck' -o -name '*.wasm' -o -name 'index.js' -o -name 'index.audio*.js' \) -print -quit | grep -q .; then
  echo "Forbidden Godot runtime artifact found under web/" >&2
  exit 1
fi

if grep -Eqi 'index\.pck|index\.wasm|index\.audio|godot' \
  web/index.html web/app/boot/boot.js web/app/scene/renderer.js web/app/scene/preview-scene.js; then
  echo "Forbidden Godot runtime dependency found in Three.js entry graph" >&2
  exit 1
fi

node tests/threejs_renderer_owner_contract.test.mjs

if [ "${VERCEL_GIT_COMMIT_REF:-}" = "threejs-rebuild" ]; then
  test -n "${TURSO_DATABASE_URL:-}" || { echo "Missing TURSO_DATABASE_URL" >&2; exit 1; }
  test -n "${TURSO_AUTH_TOKEN:-}" || { echo "Missing TURSO_AUTH_TOKEN" >&2; exit 1; }
fi

echo "Verified YAKOLAK zero-Godot static Three.js shell"
