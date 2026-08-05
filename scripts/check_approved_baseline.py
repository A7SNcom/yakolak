#!/usr/bin/env python3
"""Fail when the approved YAKOLAK loader/gameplay contract regresses."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED: dict[str, tuple[str, ...]] = {
    "scripts/apply_web_loader.py": (
        "data-loader-source=\"v130-loading-star-motion\"",
        "--loading-background:#000000",
        "--loading-star:#ffffff",
        "--loading-shadow:#d7d9de",
        "--cycle:820ms",
        "animation:bounce var(--cycle) infinite",
        "animation:turn var(--cycle) linear infinite",
        "animation:shadow var(--cycle) infinite",
        "translateY(36px) scale(1.17,.72)",
        "100%{transform:rotate(24deg)}",
        "transform:scale(1.30,1)",
        "yakolak-logo.svg",
        "loaderLogoMtkyf",
        "yakolak-upper-center-star-center-mtkyf-lower-center",
        "logos-fade-then-canonical-star",
        "table-svg-exact-path",
        "canonical-zero-degree-shared-contour",
        "yakolakLoaderHandoff='waiting'",
        "H('matched')",
    ),
    "scripts/pre_intro_refinement.gd": (
        "canonical-shared-svg",
        "direct-safe-framed",
        "Quaternion(Vector3.RIGHT, deg_to_rad(90.0))",
        "direct_position: Vector3 = start_position.lerp(end_position, t)",
        "camera.position = center + direct_direction * maxf(direct_offset.length(), safe_distance)",
        "camera.look_at(center, Vector3.UP)",
        "_apply_safe_optical_framing()",
        "SAFE_WIDTH_RATIO: float = 0.90",
        "pixel-matched-direct-safe-framing-v5",
    ),
    "tests/intro_smoke.spec.js": (
        "source: 'v130-loading-star-motion'",
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
        "canonical-shared-svg",
        "direct-safe-framed",
        "yakolakCameraMaxCoverage",
        "canonical-zero-degree-shared-contour",
        "loaderLogoMtkyf",
        "hidden-after-fade",
    ),
    "scripts/vercel-build.sh": (
        "npx playwright test tests/intro_smoke.spec.js",
        "YAKOLAK 3.4 passed exact v130 canonical star geometry",
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
        "camera.position = start_position.lerp(end_position, t)",
        "pixel-matched-2d-to-3d-v4",
        "direct-centered-lerp",
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

    print("YAKOLAK approved delayed logos, canonical teeth, safe direct camera motion, and gameplay contract preserved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
