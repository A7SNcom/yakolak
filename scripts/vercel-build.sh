#!/usr/bin/env bash
set -euo pipefail

GODOT_VERSION="4.7.1"
GODOT_TAG="4.7.1-stable"
RELEASE="https://github.com/godotengine/godot-builds/releases/download/${GODOT_TAG}"

echo "Building YAKOLAK 2.3.0 intro from approved original assets"

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

# Convert only the approved STL files; placeholder geometry is forbidden.
rm -rf generated
mkdir -p generated
cp YAKOLAK_PORTABLE_KIT/assets/layout/intro-scatter.csv generated/intro_scatter.txt
python3 scripts/prepare_assets.py
for required in board lid player_base piece_small piece_medium piece_large score_marker; do
  test -s "generated/${required}.obj"
done
test -s generated/intro_scatter.txt

# Godot imports CSV files as translation tables. Point the runtime script to the
# byte-identical TXT copy so the authoritative 36 transforms remain readable.
python3 - <<'PY'
from pathlib import Path
path = Path('scripts/intro.gd')
text = path.read_text(encoding='utf-8')
old = 'var csv_path := ASSET_ROOT + "/layout/intro-scatter.csv"'
new = 'var csv_path := GENERATED_ROOT + "/intro_scatter.txt"'
if old not in text and new not in text:
    raise SystemExit('intro scatter path was not found')
path.write_text(text.replace(old, new), encoding='utf-8')

source = Path('YAKOLAK_PORTABLE_KIT/assets/layout/intro-scatter.csv').read_bytes()
runtime = Path('generated/intro_scatter.txt').read_bytes()
if source != runtime:
    raise SystemExit('runtime intro scatter copy differs from approved source')
print('Exact 36-piece intro scatter data verified')
PY

sha256sum YAKOLAK_PORTABLE_KIT/assets/models/*.stl generated/*.obj

set -o pipefail
"$GODOT_BIN" --headless --editor --path . --quit-after 30 2>&1 | tee /tmp/yakolak-import.log
if grep -E "SCRIPT ERROR|Parse Error|Failed to load script|Cannot open file|Could not parse" /tmp/yakolak-import.log; then
  echo "Godot import or script validation failed."
  exit 1
fi

rm -rf web
mkdir -p web
set +e
"$GODOT_BIN" --headless --path . --export-release "Web" web/index.html 2>&1 | tee /tmp/yakolak-export.log
export_status=${PIPESTATUS[0]}
set -e
if [ "$export_status" -ne 0 ] || grep -E "SCRIPT ERROR|Parse Error|Failed to load script|ERROR:" /tmp/yakolak-export.log; then
  echo "Godot Web export failed."
  exit 1
fi

test -s web/index.html
test -s web/index.js
test -s web/index.wasm
test -s web/index.pck

# A build is accepted only after the real intro completes inside Chromium.
echo "Installing Chromium verification runner"
npm install --no-save --no-package-lock --no-audit --no-fund @playwright/test@1.55.0
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx playwright install chromium

rm -rf /tmp/playwright-libs /tmp/playwright-debs
mkdir -p /tmp/playwright-libs /tmp/playwright-debs
curl --fail --location --retry 4 \
  "https://archive.ubuntu.com/ubuntu/pool/main/n/nspr/libnspr4_4.35-0ubuntu0.20.04.1_amd64.deb" \
  --output /tmp/playwright-debs/libnspr4.deb
curl --fail --location --retry 4 \
  "https://archive.ubuntu.com/ubuntu/pool/main/n/nss/libnss3_3.98-0ubuntu0.20.04.2_amd64.deb" \
  --output /tmp/playwright-debs/libnss3.deb
for deb in /tmp/playwright-debs/*.deb; do
  work="$(mktemp -d)"
  (cd "$work" && ar x "$deb")
  data_archive="$(find "$work" -maxdepth 1 -type f -name 'data.tar.*' | head -n 1)"
  test -n "$data_archive"
  tar -xf "$data_archive" -C /tmp/playwright-libs
  rm -rf "$work"
done
export LD_LIBRARY_PATH="/tmp/playwright-libs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"

CHROMIUM_BIN="$(find "$HOME/.cache/ms-playwright" -type f \( -name chrome -o -name headless_shell \) | head -n 1)"
test -x "$CHROMIUM_BIN"
if ldd "$CHROMIUM_BIN" | grep -q "not found"; then
  ldd "$CHROMIUM_BIN" | grep "not found"
  exit 1
fi

python3 -m http.server 8000 --directory web >/tmp/yakolak-web-server.log 2>&1 &
server_pid=$!
cleanup() {
  kill "$server_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sleep 1
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
  npx playwright test tests/intro_smoke.spec.js --workers=1 --reporter=line
cleanup
trap - EXIT

echo "YAKOLAK 2.3.0 intro passed real Chromium verification"
du -h web/index.wasm web/index.pck
