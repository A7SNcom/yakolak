#!/usr/bin/env python3
"""Fail when the approved YAKOLAK loader/gameplay contract regresses."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED: dict[str, tuple[str, ...]] = {
    "scripts/apply_web_loader.py": (
        "data-loader-source=\"v129-loading-star-motion\"",
        "--loading-background:#000000",
        "--loading-star:#ffffff",
        "--loading-shadow:#c8ccd3",
        "--cycle:820ms",
        "animation:bounce var(--cycle) infinite",
        "animation:turn var(--cycle) linear infinite",
        "animation:shadow var(--cycle) infinite",
        "translateY(36px) scale(1.17,.72)",
        "100%{transform:rotate(24deg)}",
        "transform:scale(1.28,1)",
        "yakolak-logo.svg",
        "loaderLogoMtkyf",
        "balanced-logos-fade-then-star",
        "yakolakLoaderHandoff='waiting'",
        "H('matched')",
    ),
    "scripts/pre_intro_refinement.gd": (
        "svg-native-unmirrored",
        "direct-centered-lerp",
        "Quaternion(Vector3.RIGHT, deg_to_rad(90.0))",
        "camera.position = start_position.lerp(end_position, t)",
        "camera.look_at(center, Vector3.UP)",
        "pixel-matched-2d-to-3d-v4",
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
    "tests/pre_intro_smoke.spec.js": (
        "yakolakMatchErrorPx",
        "YAKOLAK_PREINTRO_PHASE camera-orbit",
        "svg-native-unmirrored",
        "direct-centered-lerp",
        "loaderLogoMtkyf",
        "hidden-after-fade",
    ),
    "scripts/vercel-build.sh": (
        "npx playwright test tests/intro_smoke.spec.js",
        "YAKOLAK 2.8 passed exact v129 bounce geometry",
    ),
}

FORBIDDEN: dict[str, tuple[str, ...]] = {
    "scripts/apply_web_loader.py": (
        "translateX(",
        "rotate(-420deg)",
        "yakolakLoaderProgress",
        "--loading-shadow:#7182ff",
    ),
    "scripts/pre_intro_refinement.gd": (
        "direction.normalized().slerp",
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
        print("YAKOLAK APPROVED CONTRACT REGRESSION DETECTED")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("YAKOLAK approved loader, exact shape orientation, direct camera motion, and gameplay contract preserved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
