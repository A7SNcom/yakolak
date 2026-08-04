#!/usr/bin/env bash
set -euo pipefail

GODOT_VERSION="4.7.1"
GODOT_TAG="4.7.1-stable"
RELEASE="https://github.com/godotengine/godot-builds/releases/download/${GODOT_TAG}"

echo "Installing Godot ${GODOT_TAG} for YAKOLAK 2.2"
curl --fail --location --retry 4 --connect-timeout 20 --max-time 180 \
  "${RELEASE}/Godot_v${GODOT_TAG}_linux.x86_64.zip" --output /tmp/godot.zip
curl --fail --location --retry 4 --connect-timeout 20 --max-time 240 \
  "${RELEASE}/Godot_v${GODOT_TAG}_export_templates.tpz" --output /tmp/templates.tpz

rm -rf /tmp/yakolak-godot /tmp/yakolak-templates
mkdir -p /tmp/yakolak-godot /tmp/yakolak-templates
unzip -q /tmp/godot.zip -d /tmp/yakolak-godot
unzip -q /tmp/templates.tpz -d /tmp/yakolak-templates

GODOT_BIN="$(find /tmp/yakolak-godot -maxdepth 1 -type f -name 'Godot_*' | head -n 1)"
chmod +x "$GODOT_BIN"
TEMPLATE_DIR="$HOME/.local/share/godot/export_templates/${GODOT_VERSION}.stable"
mkdir -p "$TEMPLATE_DIR"
cp -R /tmp/yakolak-templates/templates/. "$TEMPLATE_DIR/"

"$GODOT_BIN" --version

set -o pipefail
"$GODOT_BIN" --headless --editor --path . --quit-after 15 2>&1 | tee /tmp/yakolak-import.log
if grep -E "SCRIPT ERROR|Parse Error|Failed to load script" /tmp/yakolak-import.log; then
  echo "Godot script validation failed."
  exit 1
fi

"$GODOT_BIN" --headless --path . --script res://scripts/rules_smoke_test.gd

rm -rf web
mkdir -p web
"$GODOT_BIN" --headless --path . --export-release "Web" web/game.html
cp web_shell/index.html web/index.html

test -f web/index.html
test -f web/game.html
test -f web/game.js
test -f web/game.wasm
test -f web/game.pck

echo "YAKOLAK 2.2 Web payload"
du -h web/game.wasm web/game.pck
