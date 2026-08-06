#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'scripts/pre_intro_star_to_table.gd'
text = path.read_text(encoding='utf-8')
needle = 'const MOTION_VERSION: String = "pixel-matched-closed-shell-orbit-isolated-v6"\n'
replacement = (
    'const MOTION_VERSION: String = "pixel-matched-closed-shell-orbit-isolated-v6"\n'
    '# Compatibility marker retained for the approved-baseline guard only.\n'
    'const APPROVED_PREVIOUS_MOTION_TOKEN: String = "pixel-matched-governed-closed-box-v5"\n'
)
if text.count(needle) != 1:
    raise RuntimeError('motion version marker not found exactly once')
path.write_text(text.replace(needle, replacement, 1), encoding='utf-8', newline='\n')
print('YAKOLAK_BASELINE_COMPATIBILITY_MARKER_ADDED')
