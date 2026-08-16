#!/usr/bin/env bash
set -euo pipefail

GODOT_VERSION="4.7.1"
GODOT_TAG="4.7.1-stable"
RELEASE="https://github.com/godotengine/godot-builds/releases/download/${GODOT_TAG}"
TOOL_CACHE="${YAKOLAK_TOOL_CACHE:-$HOME/.cache/yakolak-tools}"
GODOT_DIR="$TOOL_CACHE/godot-${GODOT_VERSION}"
TEMPLATE_DIR="$HOME/.local/share/godot/export_templates/${GODOT_VERSION}.stable"

mkdir -p "$TOOL_CACHE"
echo "YAKOLAK_FLASH_EXPORT_START"

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

rm -rf generated web .godot/exported
mkdir -p generated web

# Build assets only. No gameplay tests, browser tests, CI quality gates, or regression suites.
python3 scripts/prepare_intro_assets.py
python3 scripts/prepare_table.py
python3 scripts/prepare_logo.py

timeout 5m "$GODOT_BIN" --headless --path . --import
timeout 7m "$GODOT_BIN" --headless --path . --export-release "Web" web/index.html

test -s web/index.html
test -s web/index.js
test -s web/index.wasm
test -s web/index.pck

cp generated/YAKOLAK_INVERTED.svg web/yakolak-logo.svg
python3 scripts/apply_web_loader.py

echo "YAKOLAK_FLASH_EXPORT_OK"
