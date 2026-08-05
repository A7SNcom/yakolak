#!/usr/bin/env python3
"""Fail when the approved YAKOLAK 2.8 visual contract is accidentally changed."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED: dict[str, tuple[str, ...]] = {
    "scripts/apply_web_loader.py": (
        "data-loader-source=\"v129-loading-star-motion\"",
        "--loading-background:#ffffff",
        "--loading-star:#3f3f3f",
        "--cycle:820ms",
        "animation:bounce var(--cycle) infinite",
        "animation:turn var(--cycle) linear infinite",
        "animation:shadow var(--cycle) infinite",
        "translateY(36px) scale(1.17,.72)",
        "100%{transform:rotate(24deg)}",
        "transform:scale(1.28,1)",
    ),
    "tests/intro_smoke.spec.js": (
        "source: 'v129-loading-star-motion'",
        "bounceDuration: '0.82s'",
        "turnDuration: '0.82s'",
        "shadowDuration: '0.82s'",
        "hasInventedHorizontalMotion: false",
        "document.body.dataset.yakolakTable === 'approved-star-svg'",
        "document.body.dataset.yakolakTableLevel === 'true'",
        "document.body.dataset.yakolakCamera === 'level-centered'",
        "document.body.dataset.yakolakBases)).toBe('4')",
        "document.body.dataset.yakolakPieces)).toBe('36')",
        "document.body.dataset.yakolakBaseColor)).toBe('161616')",
        "document.body.dataset.yakolakDuration)).toBe('5730')",
    ),
    "scripts/vercel-build.sh": (
        "npx playwright test tests/intro_smoke.spec.js",
        "YAKOLAK 2.8 passed exact v129 loader and unchanged camera/table verification",
    ),
}

FORBIDDEN: dict[str, tuple[str, ...]] = {
    "scripts/apply_web_loader.py": (
        "translateX(",
        "rotate(-420deg)",
        "yakolakLoaderProgress",
    ),
}


def main() -> int:
    failures: list[str] = []

    for relative_path, tokens in REQUIRED.items():
        path = ROOT / relative_path
        if not path.is_file():
            failures.append(f"missing required file: {relative_path}")
            continue
        text = path.read_text(encoding="utf-8")
        for token in tokens:
            if token not in text:
                failures.append(f"{relative_path}: missing approved token {token!r}")

    for relative_path, tokens in FORBIDDEN.items():
        path = ROOT / relative_path
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for token in tokens:
            if token in text:
                failures.append(f"{relative_path}: forbidden regressive token {token!r}")

    if failures:
        print("YAKOLAK 2.8 APPROVED BASELINE REGRESSION DETECTED")
        for failure in failures:
            print(f"- {failure}")
        print("Restore approved/yakolak-2.8-v129-loader or obtain explicit approval for a new baseline.")
        return 1

    print("YAKOLAK 2.8 approved baseline preserved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
