#!/usr/bin/env bash
set -euo pipefail

GODOT_VERSION="4.7.1"
GODOT_TAG="4.7.1-stable"
RELEASE="https://github.com/godotengine/godot-builds/releases/download/${GODOT_TAG}"

echo "Building YAKOLAK fast Vercel preview"
python3 scripts/check_approved_baseline.py
node --check api/rooms.js
node tests/online_rules.test.mjs

curl --fail --location --retry 4 --connect-timeout 20 --max-time 180 \
  "${RELEASE}/Godot_v${GODOT_TAG}_linux.x86_64.zip" --output /tmp/godot.zip
curl --fail --location --retry 4 --connect-timeout 20 --max-time 240 \
  "${RELEASE}/Godot_v${GODOT_TAG}_export_templates.tpz" --output /tmp/templates.tpz

rm -rf /tmp/yakolak-godot /tmp/yakolak-templates generated web .godot
mkdir -p /tmp/yakolak-godot /tmp/yakolak-templates generated web
unzip -q /tmp/godot.zip -d /tmp/yakolak-godot
unzip -q /tmp/templates.tpz -d /tmp/yakolak-templates

GODOT_BIN="$(find /tmp/yakolak-godot -maxdepth 1 -type f -name 'Godot_*' | head -n 1)"
chmod +x "$GODOT_BIN"
TEMPLATE_DIR="$HOME/.local/share/godot/export_templates/${GODOT_VERSION}.stable"
mkdir -p "$TEMPLATE_DIR"
cp -R /tmp/yakolak-templates/templates/. "$TEMPLATE_DIR/"

python3 scripts/prepare_intro_assets.py
python3 scripts/prepare_table.py
python3 scripts/prepare_logo.py

# Never allow one Godot process to monopolize Vercel's build slot.
timeout 5m "$GODOT_BIN" --headless --editor --path . --import
timeout 2m "$GODOT_BIN" --headless --path . --script res://tests/session_setup_headless.gd
timeout 2m "$GODOT_BIN" --headless --path . --script res://tests/gameplay_session_headless.gd
timeout 7m "$GODOT_BIN" --headless --path . --export-release "Web" web/index.html

test -s web/index.html
test -s web/index.js
test -s web/index.wasm
test -s web/index.pck
cp generated/YAKOLAK_INVERTED.svg web/yakolak-logo.svg
python3 scripts/apply_web_loader.py

# Cheap deployment contract checks only. Full browser smoke stays outside Vercel.
grep -q "data-loader-source=\"v130-loading-star-motion\"" web/index.html
grep -q "minimum-gated-v1" web/index.html
grep -q "canonical-zero-degree-shared-contour" web/index.html
grep -q "pixel-matched-governed-closed-box-v5" scripts/pre_intro_star_to_table.gd
grep -q "direct-slow-safe-framed" scripts/pre_intro_refinement.gd

echo "YAKOLAK_FAST_VERCEL_BUILD_OK"
