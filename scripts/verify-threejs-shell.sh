#!/usr/bin/env bash
set -euo pipefail

required=(
  web/index.html
  web/styles/app.css
  web/app/boot/boot.js
  web/app/boot/fatal-error.js
  web/app/boot/build-marker.js
  web/app/core/resource-registry.js
  web/app/data/runtime-data.js
  web/app/materials/canonical-materials.js
  web/app/scene/renderer.js
  web/app/scene/context-recovery.js
  web/app/scene/preview-scene.js
  web/app/scene/lighting-rig.js
  web/app/scene/board-and-lid.js
  web/app/scene/piece-layout.js
  web/app/scene/pieces.js
  web/app/scene/player-bases.js
  web/app/scene/table-score-layout.js
  web/app/scene/table-and-score.js
  web/app/scene/room-layout.js
  web/app/scene/neutral-room.js
  web/app/camera/frame-governor.js
  web/app/assets/asset-manifest.js
  web/app/assets/asset-manager.js
  web/app/assets/glb-components.js
  web/app/perf/startup-marks.js
  web/app/perf/performance-budgets.js
  web/assets/models/board-and-lid.glb
  web/assets/models/board-and-lid-layout.json
  web/assets/models/player-base.glb
  web/assets/models/player-base-layout.json
  web/assets/models/score-marker.glb
  web/vendor/three/r185/three.module.js
  web/vendor/three/r185/three.core.js
  web/vendor/three/r185/addons/loaders/STLLoader.js
  scripts/prepare-threejs-runtime-assets.mjs
  scripts/convert-threejs-assets.mjs
  scripts/lib/stl-glb-converter.mjs
  scripts/lib/asset-conversion-pipeline.mjs
  scripts/lib/board-lid-semantic-glb.mjs
  scripts/analyze-threejs-player-base.mjs
  scripts/verify-threejs-player-bases.mjs
  scripts/verify-threejs-pieces.mjs
  scripts/verify-threejs-board-lid.mjs
  scripts/verify-threejs-board-lid-runtime-contract.mjs
  scripts/verify-threejs-table-score.mjs
  scripts/verify-threejs-room.mjs
  scripts/verify-threejs-runtime-data.mjs
  scripts/verify-threejs-materials.mjs
  scripts/verify-threejs-lighting.mjs
  scripts/measure-threejs-performance.mjs
  tests/threejs_renderer_owner_contract.test.mjs
  tests/threejs_context_recovery_contract.test.mjs
  tests/threejs_frame_governor_contract.test.mjs
  tests/threejs_resource_registry_contract.test.mjs
  tests/threejs_resource_registry_scope_ownership.test.mjs
  tests/threejs_resource_registry_preflight_contract.test.mjs
  tests/threejs_resource_registry_atomic_listener_replacement.test.mjs
  tests/threejs_asset_loading_contract.test.mjs
  tests/threejs_asset_runtime_copies_contract.test.mjs
  tests/threejs_asset_conversion_pipeline.test.mjs
  tests/threejs_performance_budget_contract.test.mjs
  tests/threejs_board_and_lid_contract.test.mjs
  tests/threejs_player_bases_contract.test.mjs
  tests/threejs_pieces_contract.test.mjs
  tests/threejs_table_score_contract.test.mjs
  tests/threejs_room_contract.test.mjs
  tests/threejs_runtime_data_contract.test.mjs
  tests/threejs_materials_contract.test.mjs
  tests/threejs_lighting_contract.test.mjs
)

for file in "${required[@]}"; do
  test -s "$file" || { echo "Missing required Three.js shell file: $file" >&2; exit 1; }
done

node scripts/prepare-threejs-runtime-assets.mjs
npm run assets:check -- --only=model.board-and-lid
npm run assets:check -- --only=model.score-marker
node scripts/verify-threejs-board-lid.mjs
node scripts/verify-threejs-board-lid-runtime-contract.mjs
node scripts/verify-threejs-player-bases.mjs
node scripts/verify-threejs-pieces.mjs
node scripts/verify-threejs-table-score.mjs
node scripts/verify-threejs-room.mjs
node scripts/verify-threejs-runtime-data.mjs
node scripts/verify-threejs-materials.mjs
node scripts/verify-threejs-lighting.mjs

if find web -type f \( -name '*.pck' -o -name '*.wasm' -o -name 'index.js' -o -name 'index.audio*.js' \) -print -quit | grep -q .; then
  echo "Forbidden Godot runtime artifact found under web/" >&2
  exit 1
fi

if grep -Eqi 'index\.pck|index\.wasm|index\.audio|godot' \
  web/index.html web/app/boot/boot.js web/app/scene/renderer.js web/app/scene/preview-scene.js web/app/scene/neutral-room.js \
  web/app/camera/frame-governor.js web/app/assets/asset-manifest.js web/app/assets/asset-manager.js; then
  echo "Forbidden Godot runtime dependency found in Three.js entry graph" >&2
  exit 1
fi

node tests/threejs_renderer_owner_contract.test.mjs
node tests/threejs_context_recovery_contract.test.mjs
node tests/threejs_frame_governor_contract.test.mjs
node tests/threejs_resource_registry_contract.test.mjs
node tests/threejs_resource_registry_scope_ownership.test.mjs
node tests/threejs_resource_registry_preflight_contract.test.mjs
node tests/threejs_resource_registry_atomic_listener_replacement.test.mjs
node tests/threejs_asset_loading_contract.test.mjs
node tests/threejs_asset_runtime_copies_contract.test.mjs
node tests/threejs_asset_conversion_pipeline.test.mjs
node tests/threejs_performance_budget_contract.test.mjs
node tests/threejs_board_and_lid_contract.test.mjs
node tests/threejs_player_bases_contract.test.mjs
node tests/threejs_pieces_contract.test.mjs
node tests/threejs_table_score_contract.test.mjs
node tests/threejs_room_contract.test.mjs
node tests/threejs_runtime_data_contract.test.mjs
node tests/threejs_materials_contract.test.mjs
node tests/threejs_lighting_contract.test.mjs

if [ "${VERCEL_GIT_COMMIT_REF:-}" = "threejs-rebuild" ]; then
  test -n "${TURSO_DATABASE_URL:-}" || { echo "Missing TURSO_DATABASE_URL" >&2; exit 1; }
  test -n "${TURSO_AUTH_TOKEN:-}" || { echo "Missing TURSO_AUTH_TOKEN" >&2; exit 1; }
fi

echo "Verified YAKOLAK static Three.js shell with one lifecycle registry, immutable shared resources, leak-safe rematch/context restore, canonical assets and locked performance budgets"
