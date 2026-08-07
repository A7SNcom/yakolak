#!/usr/bin/env bash
set -euo pipefail

GODOT_VERSION="4.7.1"
GODOT_TAG="4.7.1-stable"
RELEASE="https://github.com/godotengine/godot-builds/releases/download/${GODOT_TAG}"

echo "Building YAKOLAK 3.7 — approved smooth intro with compact match setup"
python3 scripts/check_approved_baseline.py
node --check api/rooms.js
node tests/online_rules.test.mjs

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
test -s YAKOLAK_PORTABLE_KIT/assets/logos/MTKYF.svg
sha256sum \
  YAKOLAK_PORTABLE_KIT/assets/models/board-and-lid.stl \
  YAKOLAK_PORTABLE_KIT/assets/models/player-base.stl \
  YAKOLAK_PORTABLE_KIT/assets/models/piece-large.stl \
  YAKOLAK_PORTABLE_KIT/assets/models/piece-medium.stl \
  YAKOLAK_PORTABLE_KIT/assets/models/piece-small.stl \
  YAKOLAK_PORTABLE_KIT/assets/table/table.svg \
  YAKOLAK_PORTABLE_KIT/assets/ui/loading-star.svg \
  YAKOLAK_PORTABLE_KIT/assets/logos/YAKOLAK.svg \
  YAKOLAK_PORTABLE_KIT/assets/logos/MTKYF.svg \
  generated/*.obj generated/YAKOLAK_INVERTED.svg

godot_source_error() {
  grep -Eq "SCRIPT ERROR|Parse Error|Failed to load script|Cannot open file|Could not parse" "$1"
}

godot_crashed() {
  grep -Eq "handle_crash|Program crashed|signal 11|Segmentation fault|Aborted" "$1"
}

run_godot_import() {
  local attempt log status
  for attempt in 1 2; do
    log="/tmp/yakolak35-import-${attempt}.log"
    set +e
    set -o pipefail
    "$GODOT_BIN" --headless --editor --path . --quit-after 45 2>&1 | tee "$log"
    status=${PIPESTATUS[0]}
    set -e
    if godot_source_error "$log"; then
      echo "Godot import found a real project or script error."
      return 1
    fi
    if [ "$status" -eq 0 ] && ! godot_crashed "$log"; then
      return 0
    fi
    echo "Godot import hit a transient engine failure; retrying once after a short settle."
    sleep 3
  done
  echo "Godot import failed after two attempts."
  return 1
}

run_godot_export() {
  local attempt log status
  for attempt in 1 2; do
    log="/tmp/yakolak35-export-${attempt}.log"
    rm -rf web
    mkdir -p web
    set +e
    set -o pipefail
    "$GODOT_BIN" --headless --path . --export-release "Web" web/index.html 2>&1 | tee "$log"
    status=${PIPESTATUS[0]}
    set -e
    if godot_source_error "$log"; then
      echo "Godot Web export found a real project or script error."
      return 1
    fi
    if [ "$status" -eq 0 ] && ! godot_crashed "$log" && test -s web/index.html; then
      return 0
    fi
    echo "Godot export hit a transient engine failure; retrying once with the completed import cache."
    sleep 3
  done
  echo "Godot Web export failed after two attempts."
  return 1
}

run_godot_import
"$GODOT_BIN" --headless --path . --script res://tests/session_setup_headless.gd
"$GODOT_BIN" --headless --path . --script res://tests/gameplay_session_headless.gd
run_godot_export

test -s web/index.html
test -s web/index.js
test -s web/index.wasm
test -s web/index.pck
cp generated/YAKOLAK_INVERTED.svg web/yakolak-logo.svg
python3 scripts/apply_web_loader.py

grep -q "yakolak-v130-loading-star-style" web/index.html
grep -q "data-loader-source=\"v130-loading-star-motion\"" web/index.html
grep -q -- "--loading-background:#000000" web/index.html
grep -q -- "--loading-star:#ffffff" web/index.html
grep -q -- "--loading-shadow:#d7d9de" web/index.html
grep -q -- "--cycle:820ms" web/index.html
grep -q "animation:bounce var(--cycle) infinite" web/index.html
grep -q "animation:turn var(--cycle) linear infinite" web/index.html
grep -q "animation:shadow var(--cycle) infinite" web/index.html
grep -q "translateY(36px) scale(1.17,.72)" web/index.html
grep -q "100%{transform:rotate(24deg)}" web/index.html
grep -q "transform:scale(1.30,1)" web/index.html
grep -q "yakolak-logo.svg" web/index.html
grep -q "loaderLogoMtkyf" web/index.html
grep -q "path:not(.cls-1){fill:#000!important}" web/index.html
grep -q "original-black-white" web/index.html
grep -q "white-to-material-crossfade" web/index.html
grep -q "materialBridgeDuration=1200" web/index.html
grep -q "minimumLoaderMs=2600" web/index.html
grep -q "motionWarmupMs=260" web/index.html
grep -q "motionSettleMs=220" web/index.html
grep -q "minimum-gated-v1" web/index.html
grep -q "H('matched')" web/index.html
grep -q "logos-fade-then-canonical-star" web/index.html
grep -q "canonical-zero-degree-shared-contour" web/index.html
grep -q "pixel-matched-governed-closed-box-v5" scripts/pre_intro_star_to_table.gd
grep -q "white-emission-to-material" scripts/pre_intro_star_to_table.gd
grep -q "closed-rigid-body-drop" scripts/pre_intro_star_to_table.gd
grep -q "ClosedBoxDropRoot" scripts/pre_intro_star_to_table.gd
grep -q "node.reparent(closed_box_root, true)" scripts/pre_intro_star_to_table.gd
grep -q "present-during-drop-exit-only" scripts/pre_intro_star_to_table.gd
grep -q "governed_elapsed_ms" scripts/pre_intro_refinement.gd
grep -q "pixel-matched-direct-slow-safe-framing-v7" scripts/pre_intro_refinement.gd
grep -q "canonical-shared-svg" scripts/pre_intro_refinement.gd
grep -q "direct-slow-safe-framed" scripts/pre_intro_refinement.gd
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
if grep -q "loaderLogoMtkyf path{fill:#fff!important}" web/index.html; then
  echo "Rejected flattened MTKYF palette is still present."
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

python3 -m http.server 8000 --directory web >/tmp/yakolak35-server.log 2>&1 &
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
test -s web/setup-ios-short-viewport.png
test -s web/gameplay-mobile-selected.png
test -s web/gameplay-mobile-placed.png
echo "YAKOLAK 3.7 passed the approved loader and closed-box intro sequence"
echo "YAKOLAK 3.6 passed governed loader and closed rigid box"
echo "YAKOLAK 3.7 passed the compact player setup and authoritative online rules"
echo "YAKOLAK gameplay passed physical stone selection and legal board placement verification"
du -h web/index.wasm web/index.pck web/yakolak-logo.svg visual-review/preintro-motion.webm \
  web/preintro-01-black-loader-logo.png web/preintro-02-logo-to-wall-star-hold.png \
  web/preintro-03-pixel-matched.png web/preintro-04-camera-orbit.png \
  web/intro-mobile-motion.png web/intro-mobile-final.png web/intro-desktop-motion.png \
  web/gameplay-mobile-selected.png web/gameplay-mobile-placed.png
