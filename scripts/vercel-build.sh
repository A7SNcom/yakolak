#!/usr/bin/env bash
set -euo pipefail

GODOT_VERSION="4.7.1"
GODOT_TAG="4.7.1-stable"
RELEASE="https://github.com/godotengine/godot-builds/releases/download/${GODOT_TAG}"

echo "Building YAKOLAK Free Play from the stable 2.9 scene"

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

rm -rf generated web .godot
mkdir -p generated web
python3 scripts/prepare_intro_assets.py
python3 scripts/prepare_table.py
for required in board_and_lid player_base piece_large piece_medium piece_small table; do
  test -s "generated/${required}.obj"
done

set -o pipefail
"$GODOT_BIN" --headless --editor --path . --quit-after 30 2>&1 | tee /tmp/yakolak-free-import.log
if grep -E "SCRIPT ERROR|Parse Error|Failed to load script|Cannot open file|Could not parse|ERROR:" /tmp/yakolak-free-import.log; then
  echo "Godot import or script validation failed."
  exit 1
fi

set +e
"$GODOT_BIN" --headless --path . --export-release "Web" web/index.html 2>&1 | tee /tmp/yakolak-free-export.log
export_status=${PIPESTATUS[0]}
set -e
if [ "$export_status" -ne 0 ] || grep -E "SCRIPT ERROR|Parse Error|Failed to load script|ERROR:" /tmp/yakolak-free-export.log; then
  echo "Godot Web export failed."
  exit 1
fi

test -s web/index.html
test -s web/index.js
test -s web/index.wasm
test -s web/index.pck
grep -q "YAKOLAK Free Play" project.godot
grep -q "YAKOLAK_FREE_PLAY_READY" scripts/gameplay.gd
grep -q 'reset.text = "RESET"' scripts/gameplay.gd

echo "YAKOLAK Free Play export ready: four fixed players, free stone movement, one reset button"
du -h web/index.wasm web/index.pck
