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
node --check api/rooms.js
node tests/online_rules.test.mjs

if ! find "$GODOT_DIR" -maxdepth 1 -type f -name 'Godot_*' -perm -u+x 2>/dev/null | grep -q .; then
  rm -rf "$GODOT_DIR"
  mkdir -p "$GODOT_DIR"
  zip="$TOOL_CACHE/Godot_v${GODOT_TAG}_linux.x86_64.zip"
  if [ ! -s "$zip" ]; then
    tmp="${zip}.tmp"
    rm -f "$tmp"
    curl --fail --location --retry 4 --connect-timeout 20 --max-time 180 \
      "${RELEASE}/Godot_v${GODOT_TAG}_linux.x86_64.zip" --output "$tmp"
    mv "$tmp" "$zip"
  fi
  unzip -q "$zip" -d "$GODOT_DIR"
  chmod +x "$GODOT_DIR"/Godot_*
fi

if [ ! -d "$TEMPLATE_DIR" ] || [ -z "$(find "$TEMPLATE_DIR" -type f -print -quit 2>/dev/null)" ]; then
  rm -rf "$TEMPLATE_DIR"
  mkdir -p "$TEMPLATE_DIR"
  tpz="$TOOL_CACHE/Godot_v${GODOT_TAG}_export_templates.tpz"
  if [ ! -s "$tpz" ]; then
    tmp="${tpz}.tmp"
    rm -f "$tmp"
    curl --fail --location --retry 4 --connect-timeout 20 --max-time 240 \
      "${RELEASE}/Godot_v${GODOT_TAG}_export_templates.tpz" --output "$tmp"
    mv "$tmp" "$tpz"
  fi
  work="$(mktemp -d)"
  unzip -q "$tpz" -d "$work"
  cp -R "$work/templates/." "$TEMPLATE_DIR/"
  rm -rf "$work"
fi

GODOT_BIN="$(find "$GODOT_DIR" -maxdepth 1 -type f -name 'Godot_*' | head -n 1)"
chmod +x "$GODOT_BIN"

rm -rf generated web
mkdir -p generated web
if [ "${YAKOLAK_KEEP_IMPORT_CACHE:-0}" != "1" ]; then
  rm -rf .godot
fi

python3 scripts/prepare_intro_assets.py
python3 scripts/prepare_table.py
python3 scripts/prepare_logo.py

timeout 5m "$GODOT_BIN" --headless --path . --import
timeout 2m "$GODOT_BIN" --headless --path . --script res://tests/session_setup_headless.gd
timeout 2m "$GODOT_BIN" --headless --path . --script res://tests/gameplay_session_headless.gd
timeout 7m "$GODOT_BIN" --headless --path . --export-release "Web" web/index.html

test -s web/index.html
test -s web/index.js
test -s web/index.wasm
test -s web/index.pck
cp generated/YAKOLAK_INVERTED.svg web/yakolak-logo.svg
python3 scripts/apply_web_loader.py

grep -q "data-loader-source=\"v130-loading-star-motion\"" web/index.html
grep -q "minimum-gated-v1" web/index.html
grep -q "canonical-zero-degree-shared-contour" web/index.html
grep -q "pixel-matched-governed-closed-box-v5" scripts/pre_intro_star_to_table.gd
grep -q "direct-slow-safe-framed" scripts/pre_intro_refinement.gd

echo "YAKOLAK_ONLINE_BUILD_OK"
