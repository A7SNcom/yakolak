#!/usr/bin/env bash
set -euo pipefail

GODOT_VERSION="4.7.1"
GODOT_TAG="4.7.1-stable"
RELEASE="https://github.com/godotengine/godot-builds/releases/download/${GODOT_TAG}"

echo "Installing Godot ${GODOT_TAG} for YAKOLAK 2.2.1"
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

# Godot 4.7 rejects inferred bool types from compound Variant expressions.
python3 - <<'PY'
from pathlib import Path
path = Path('scripts/main.gd')
text = path.read_text(encoding='utf-8')
old = 'var human_turn := match_active and not pending_input and seat.type == "human"'
new = 'var human_turn: bool = match_active and not pending_input and String(seat.type) == "human"'
if old not in text and new not in text:
    raise SystemExit('Expected human_turn source line was not found')
path.write_text(text.replace(old, new), encoding='utf-8')
PY

set -o pipefail
"$GODOT_BIN" --headless --editor --path . --quit-after 15 2>&1 | tee /tmp/yakolak-import.log
if grep -E "SCRIPT ERROR|Parse Error|Failed to load script" /tmp/yakolak-import.log; then
  echo "Godot script validation failed during import."
  exit 1
fi

"$GODOT_BIN" --headless --path . --script res://scripts/rules_smoke_test.gd

set +e
"$GODOT_BIN" --headless --path . --script res://scripts/ui_smoke_test.gd 2>&1 | tee /tmp/yakolak-ui-smoke.log
ui_status=${PIPESTATUS[0]}
set -e
if [ "$ui_status" -ne 0 ] || grep -E "SCRIPT ERROR|Parse Error|Failed to load script|ERROR:" /tmp/yakolak-ui-smoke.log; then
  echo "YAKOLAK runtime UI smoke test failed."
  exit 1
fi
grep -q "YAKOLAK UI smoke test passed" /tmp/yakolak-ui-smoke.log

rm -rf web
mkdir -p web
set +e
"$GODOT_BIN" --headless --path . --export-release "Web" web/index.html 2>&1 | tee /tmp/yakolak-export.log
export_status=${PIPESTATUS[0]}
set -e
if [ "$export_status" -ne 0 ] || grep -E "SCRIPT ERROR|Parse Error|Failed to load script|ERROR:" /tmp/yakolak-export.log; then
  echo "Godot Web export contains errors."
  exit 1
fi

test -f web/index.html
test -f web/index.js
test -f web/index.wasm
test -f web/index.pck

echo "YAKOLAK 2.2.1 verified Web payload"
du -h web/index.wasm web/index.pck
