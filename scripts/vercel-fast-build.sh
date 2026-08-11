#!/usr/bin/env bash
set -euo pipefail
GODOT_VERSION="4.7.1"
GODOT_TAG="4.7.1-stable"
RELEASE="https://github.com/godotengine/godot-builds/releases/download/${GODOT_TAG}"
TOOL_CACHE="${YAKOLAK_TOOL_CACHE:-$HOME/.cache/yakolak-tools}"
GODOT_DIR="$TOOL_CACHE/godot-${GODOT_VERSION}"
TEMPLATE_DIR="$HOME/.local/share/godot/export_templates/${GODOT_VERSION}.stable"
mkdir -p "$TOOL_CACHE"
echo "Building YAKOLAK online preview"
python3 scripts/check_approved_baseline.py
node --check api/game-rules.js
node --check api/rooms.js
node tests/online_rules.test.mjs
if ! find "$GODOT_DIR" -maxdepth 1 -type f -name 'Godot_*' -perm -u+x 2>/dev/null | grep -q .; then
  rm -rf "$GODOT_DIR"; mkdir -p "$GODOT_DIR"; zip="$TOOL_CACHE/Godot_v${GODOT_TAG}_linux.x86_64.zip"
  if [ ! -s "$zip" ]; then tmp="${zip}.tmp"; rm -f "$tmp"; curl --fail --location --retry 4 --connect-timeout 20 --max-time 180 "${RELEASE}/Godot_v${GODOT_TAG}_linux.x86_64.zip" --output "$tmp"; mv "$tmp" "$zip"; fi
  unzip -q "$zip" -d "$GODOT_DIR"; chmod +x "$GODOT_DIR"/Godot_*
fi
if [ ! -d "$TEMPLATE_DIR" ] || [ -z "$(find "$TEMPLATE_DIR" -type f -print -quit 2>/dev/null)" ]; then
  rm -rf "$TEMPLATE_DIR"; mkdir -p "$TEMPLATE_DIR"; tpz="$TOOL_CACHE/Godot_v${GODOT_TAG}_export_templates.tpz"
  if [ ! -s "$tpz" ]; then tmp="${tpz}.tmp"; rm -f "$tmp"; curl --fail --location --retry 4 --connect-timeout 20 --max-time 240 "${RELEASE}/Godot_v${GODOT_TAG}_export_templates.tpz" --output "$tmp"; mv "$tmp" "$tpz"; fi
  work="$(mktemp -d)"; unzip -q "$tpz" -d "$work"; cp -R "$work/templates/." "$TEMPLATE_DIR/"; rm -rf "$work"
fi
GODOT_BIN="$(find "$GODOT_DIR" -maxdepth 1 -type f -name 'Godot_*' | head -n 1)"; chmod +x "$GODOT_BIN"
rm -rf generated web; mkdir -p generated web
if [ "${YAKOLAK_KEEP_IMPORT_CACHE:-0}" != "1" ]; then rm -rf .godot; fi
python3 scripts/prepare_intro_assets.py
python3 scripts/prepare_table.py
python3 scripts/prepare_logo.py
timeout 5m "$GODOT_BIN" --headless --path . --import
timeout 2m "$GODOT_BIN" --headless --path . --script res://tests/game_rules_headless.gd
timeout 2m "$GODOT_BIN" --headless --path . --script res://tests/session_setup_headless.gd

run_godot_resource_gate() {
  local script_path="$1"
  local label="$2"
  local log_file
  local status
  local detail
  log_file="$(mktemp)"
  set +e
  timeout 2m "$GODOT_BIN" --verbose --headless --path . --script "$script_path" 2>&1 | tee "$log_file"
  status=${PIPESTATUS[0]}
  set -e
  if [ "$status" -ne 0 ]; then
    detail="$(tail -n 28 "$log_file" | tr '\n' ' ' | cut -c1-3500)"
    detail="${detail//'%'/'%25'}"
    echo "::error title=YAKOLAK ${label} Godot gate::${detail}"
    rm -f "$log_file"
    return "$status"
  fi
  if grep -Eq "ObjectDB instances were leaked at exit|resources still in use at exit" "$log_file"; then
    detail="$(grep -E "ObjectDB instances were leaked at exit|resources still in use at exit" "$log_file" | tr '\n' ' ' | cut -c1-2000)"
    detail="${detail//'%'/'%25'}"
    echo "::error title=YAKOLAK ${label} resource leak::${detail}"
    echo "YAKOLAK_GAMEPLAY_RESOURCE_LEAK_GATE_FAIL label=$label"
    rm -f "$log_file"
    return 1
  fi
  echo "YAKOLAK_GAMEPLAY_RESOURCE_LEAK_GATE_OK label=$label"
  rm -f "$log_file"
}

run_godot_resource_gate res://tests/intro_handoff_headless.gd intro_handoff
run_godot_resource_gate res://tests/intro_handoff_base_consumer_headless.gd intro_handoff_base_consumer
run_godot_resource_gate res://tests/gameplay_session_headless.gd gameplay_session
run_godot_resource_gate res://tests/gameplay_session_lifecycle_headless.gd gameplay_lifecycle

timeout 7m "$GODOT_BIN" --headless --path . --export-release "Web" web/index.html
test -s web/index.html; test -s web/index.js; test -s web/index.wasm; test -s web/index.pck
cp generated/YAKOLAK_INVERTED.svg web/yakolak-logo.svg
python3 scripts/apply_web_loader.py
grep -q "data-loader-source=\"v130-loading-star-motion\"" web/index.html
grep -q "minimum-gated-v1" web/index.html
grep -q "canonical-zero-degree-shared-contour" web/index.html
grep -q "pixel-matched-governed-closed-box-v5" scripts/pre_intro_star_to_table.gd
grep -q "direct-slow-safe-framed" scripts/pre_intro_refinement.gd
echo "YAKOLAK_ONLINE_BUILD_OK"
