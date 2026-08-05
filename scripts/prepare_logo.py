#!/usr/bin/env python3
"""Build one high-contrast YAKOLAK logo used by both the DOM loader and Godot wall."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "YAKOLAK_PORTABLE_KIT" / "assets" / "logos" / "YAKOLAK.svg"
OUTPUT = ROOT / "generated" / "YAKOLAK_INVERTED.svg"


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    replacement = (
        "<defs><style>"
        "path,polygon{fill:#fff;}"
        ".cls-1{fill:#05070a;}"
        "</style></defs>"
    )
    result, count = re.subn(
        r"<defs><style>.*?</style></defs>",
        replacement,
        source,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        raise RuntimeError("Could not locate the YAKOLAK logo color definitions")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(result, encoding="utf-8", newline="\n")
    print("YAKOLAK_INVERTED_LOGO_READY source=YAKOLAK.svg colors=white-on-near-black")


if __name__ == "__main__":
    main()
