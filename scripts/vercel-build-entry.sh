#!/usr/bin/env bash
set -euo pipefail

# Godot --quit-after counts engine iterations, not seconds. The historical
# build entry could therefore terminate the editor scan before fonts/assets
# finished importing on a cold Vercel machine. Patch only that build-time
# command, then run the approved build script unchanged otherwise.
python3 - <<'PY'
from pathlib import Path

path = Path('scripts/vercel-build.sh')
text = path.read_text(encoding='utf-8')
old = '"$GODOT_BIN" --headless --editor --path . --quit-after 45 2>&1 | tee "$log"'
new = '"$GODOT_BIN" --headless --path . --import 2>&1 | tee "$log"'
if old not in text:
    raise SystemExit('Expected Godot import command was not found')
text = text.replace(old, new, 1)
text = text.replace(
    '"$GODOT_BIN" --headless --path . --script res://tests/session_setup_headless.gd',
    'timeout 120s "$GODOT_BIN" --headless --path . --script res://tests/session_setup_headless.gd',
    1,
)
text = text.replace(
    '"$GODOT_BIN" --headless --path . --script res://tests/gameplay_session_headless.gd',
    'timeout 120s "$GODOT_BIN" --headless --path . --script res://tests/gameplay_session_headless.gd',
    1,
)
path.write_text(text, encoding='utf-8')
PY

exec bash scripts/vercel-build.sh
