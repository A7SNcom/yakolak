#!/usr/bin/env bash
set -euo pipefail

GODOT_VERSION="4.7.1"
GODOT_TAG="4.7.1-stable"
RELEASE="https://github.com/godotengine/godot-builds/releases/download/${GODOT_TAG}"

echo "Building YAKOLAK 3.2 — pixel-matched 2D to 3D intro"
python3 scripts/check_approved_baseline.py

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

rm -rf generated web .godot visual-review
mkdir -p generated web visual-review
python3 scripts/prepare_intro_assets.py
python3 scripts/prepare_table.py
python3 scripts/prepare_logo.py
for required in board_and_lid player_base piece_large piece_medium piece_small table; do
  test -s "generated/${required}.obj"
done
test -s generated/YAKOLAK_INVERTED.svg
sha256sum \
  YAKOLAK_PORTABLE_KIT/assets/models/board-and-lid.stl \
  YAKOLAK_PORTABLE_KIT/assets/models/player-base.stl \
  YAKOLAK_PORTABLE_KIT/assets/models/piece-large.stl \
  YAKOLAK_PORTABLE_KIT/assets/models/piece-medium.stl \
  YAKOLAK_PORTABLE_KIT/assets/models/piece-small.stl \
  YAKOLAK_PORTABLE_KIT/assets/table/table.svg \
  YAKOLAK_PORTABLE_KIT/assets/ui/loading-star.svg \
  YAKOLAK_PORTABLE_KIT/assets/logos/YAKOLAK.svg \
  generated/*.obj generated/YAKOLAK_INVERTED.svg

set -o pipefail
"$GODOT_BIN" --headless --editor --path . --quit-after 30 2>&1 | tee /tmp/yakolak32-import.log
if grep -E "SCRIPT ERROR|Parse Error|Failed to load script|Cannot open file|Could not parse|ERROR:" /tmp/yakolak32-import.log; then
  echo "Godot import or script validation failed."
  exit 1
fi

set +e
"$GODOT_BIN" --headless --path . --export-release "Web" web/index.html 2>&1 | tee /tmp/yakolak32-export.log
export_status=${PIPESTATUS[0]}
set -e
if [ "$export_status" -ne 0 ] || grep -E "SCRIPT ERROR|Parse Error|Failed to load script|ERROR:" /tmp/yakolak32-export.log; then
  echo "Godot Web export failed."
  exit 1
fi

test -s web/index.html
test -s web/index.js
test -s web/index.wasm
test -s web/index.pck
cp generated/YAKOLAK_INVERTED.svg web/yakolak-logo.svg
python3 scripts/apply_web_loader.py

grep -q "yakolak-v129-loading-star-style" web/index.html
grep -q "data-loader-source=\"v129-loading-star-motion\"" web/index.html
grep -q -- "--loading-background:#000000" web/index.html
grep -q -- "--loading-star:#ffffff" web/index.html
grep -q -- "--loading-shadow:#7182ff" web/index.html
grep -q -- "--cycle:820ms" web/index.html
grep -q "animation:bounce var(--cycle) infinite" web/index.html
grep -q "animation:turn var(--cycle) linear infinite" web/index.html
grep -q "animation:shadow var(--cycle) infinite" web/index.html
grep -q "translateY(36px) scale(1.17,.72)" web/index.html
grep -q "100%{transform:rotate(24deg)}" web/index.html
grep -q "yakolak-logo.svg" web/index.html
grep -q "yakolakLoaderHandoff='matched'" web/index.html
grep -q "logo-first-star-second" web/index.html
grep -q "pixel-matched-2d-to-3d-v3" scripts/pre_intro_star_to_table.gd
grep -q "YAKOLAK_PIXEL_MATCH_READY" scripts/pre_intro_star_to_table.gd
grep -q "StudioWallLogo" scripts/visual_polish.gd
if grep -q "translateX(" web/index.html || grep -q "rotate(-420deg)" web/index.html; then
  echo "Rejected invented horizontal star motion is still present."
  exit 1
fi
if grep -q "yakolakLoaderProgress" web/index.html; then
  echo "Rejected progress-bar loader is still present."
  exit 1
fi

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

python3 -m http.server 8000 --directory web >/tmp/yakolak32-server.log 2>&1 &
server_pid=$!
cleanup() {
  kill "$server_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sleep 1
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
  npx playwright test tests/pre_intro_smoke.spec.js --workers=1 --reporter=line
preintro_video="$(find test-results -type f -name video.webm | head -n 1)"
test -s "$preintro_video"
cp "$preintro_video" visual-review/preintro-motion.webm
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
  npx playwright test tests/intro_smoke.spec.js tests/gameplay_smoke.spec.js --workers=1 --reporter=line
cleanup
trap - EXIT

test -s visual-review/preintro-motion.webm
test -s web/preintro-01-black-loader-logo.png
test -s web/preintro-02-logo-to-wall-star-hold.png
test -s web/preintro-03-pixel-matched.png
test -s web/preintro-04-camera-orbit.png
test -s web/intro-mobile-motion.png
test -s web/intro-mobile-final.png
test -s web/intro-desktop-motion.png
test -s web/gameplay-mobile-selected.png
test -s web/gameplay-mobile-placed.png
echo "YAKOLAK 2.8 passed exact v129 bounce geometry with approved black/white palette"
echo "YAKOLAK 3.2 passed exact SVG pixel match, non-overlapping wall-logo handoff, and coordinated side-camera transition"
echo "YAKOLAK gameplay passed physical stone selection and legal board placement verification"
du -h web/index.wasm web/index.pck web/yakolak-logo.svg visual-review/preintro-motion.webm \
  web/preintro-01-black-loader-logo.png web/preintro-02-logo-to-wall-star-hold.png \
  web/preintro-03-pixel-matched.png web/preintro-04-camera-orbit.png \
  web/intro-mobile-motion.png web/intro-mobile-final.png web/intro-desktop-motion.png \
  web/gameplay-mobile-selected.png web/gameplay-mobile-placed.png
