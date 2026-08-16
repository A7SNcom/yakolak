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
  web/app/camera/frame-governor.js
  web/app/assets/asset-manifest.js
  web/app/assets/asset-manager.js
  web/app/perf/startup-marks.js
  web/app/perf/performance-budgets.js
  web/vendor/three/r185/three.module.js
  web/vendor/three/r185/three.core.js
  web/vendor/three/r185/addons/loaders/STLLoader.js
  scripts/prepare-threejs-runtime-assets.mjs
  scripts/convert-threejs-assets.mjs
  scripts/lib/stl-glb-converter.mjs
  scripts/lib/asset-conversion-pipeline.mjs
  scripts/measure-threejs-performance.mjs
  tests/threejs_renderer_owner_contract.test.mjs
  tests/threejs_frame_governor_contract.test.mjs
  tests/threejs_asset_loading_contract.test.mjs
  tests/threejs_asset_runtime_copies_contract.test.mjs
  tests/threejs_asset_conversion_pipeline.test.mjs
  tests/threejs_performance_budget_contract.test.mjs
)

for file in "${required[@]}"; do
  test -s "$file" || { echo "Missing required Three.js shell file: $file" >&2; exit 1; }
done

node scripts/prepare-threejs-runtime-assets.mjs

if find web -type f \( -name '*.pck' -o -name '*.wasm' -o -name 'index.js' -o -name 'index.audio*.js' \) -print -quit | grep -q .; then
  echo "Forbidden Godot runtime artifact found under web/" >&2
  exit 1
fi

if grep -Eqi 'index\.pck|index\.wasm|index\.audio|godot' \
  web/index.html web/app/boot/boot.js web/app/scene/renderer.js web/app/scene/preview-scene.js web/app/camera/frame-governor.js \
  web/app/assets/asset-manifest.js web/app/assets/asset-manager.js; then
  echo "Forbidden Godot runtime dependency found in Three.js entry graph" >&2
  exit 1
fi

node tests/threejs_renderer_owner_contract.test.mjs
node tests/threejs_frame_governor_contract.test.mjs
node tests/threejs_asset_loading_contract.test.mjs
node tests/threejs_asset_runtime_copies_contract.test.mjs
node tests/threejs_asset_conversion_pipeline.test.mjs
node tests/threejs_performance_budget_contract.test.mjs

if [ "${VERCEL_GIT_COMMIT_REF:-}" = "threejs-rebuild" ]; then
  test -n "${TURSO_DATABASE_URL:-}" || { echo "Missing TURSO_DATABASE_URL" >&2; exit 1; }
  test -n "${TURSO_AUTH_TOKEN:-}" || { echo "Missing TURSO_AUTH_TOKEN" >&2; exit 1; }
fi

echo "Verified YAKOLAK static Three.js shell with immutable asset gate, deterministic conversion, and THREEJS-017 performance budgets"
