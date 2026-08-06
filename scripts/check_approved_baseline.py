#!/usr/bin/env python3
"""Fail when the approved governed YAKOLAK intro contract regresses."""
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
        "animation-play-state:paused",
        "translateY(36px) scale(1.17,.72)",
        "100%{transform:rotate(24deg)}",
        "transform:scale(1.30,1)",
        "path:not(.cls-1){fill:#000!important}",
        ".cls-1{fill:#fff!important}",
        "minimumLoaderMs=2600",
        "motionWarmupMs=260",
        "motionSettleMs=220",
        "minimum-gated-v1",
        "settleMotion",
        "white-to-material-crossfade",
        "canonical-zero-degree-shared-contour",
    ),
    "scripts/pre_intro_star_to_table.gd": (
        "MIN_MATCH_HOLD_MS: float = 260.0",
        "MIN_CLOSED_BOX_DROP_MS: float = 1200.0",
        "MIN_CLOSED_BOX_LANDED_HOLD_MS: float = 420.0",
        "MAX_TIMELINE_STEP_MS: float = 50.0",
        "governed_elapsed_ms",
        "ClosedBoxDropRoot",
        "node.reparent(closed_box_root, true)",
        "box-closed-descending",
        "box-closed-landed",
        "closed-rigid-body-drop",
        "present-during-drop-exit-only",
        "pixel-matched-governed-closed-box-v5",
    ),
    "scripts/pre_intro_refinement.gd": (
        "canonical-shared-svg",
        "direct-slow-safe-framed",
        "CAMERA_MOVE_MS: float = 1250.0",
        "pixel-matched-direct-slow-safe-framing-v7",
        "governed_elapsed_ms",
        "_apply_safe_optical_framing()",
    ),
    "tests/intro_smoke.spec.js": (
        "source: 'v130-loading-star-motion'",
        "bounceDuration: '0.82s'",
        "turnDuration: '0.82s'",
        "shadowDuration: '0.82s'",
        "hasInventedHorizontalMotion: false",
        "document.body.dataset.yakolakDuration)).toBe('5730')",
    ),
    "tests/pre_intro_smoke.spec.js": (
        "yakolakMatchErrorPx",
        "minimum-gated-v1",
        "box-closed-descending",
        "closed-rigid-body-drop",
        "present-during-drop-exit-only",
        "window.__yakolakPreIntroPhases",
        "settling','rested",
    ),
    "scripts/vercel-build.sh": (
        "npx playwright test tests/intro_smoke.spec.js",
        "YAKOLAK 3.6 passed governed loader and closed rigid box",
    ),
}

FORBIDDEN: dict[str, tuple[str, ...]] = {
    "scripts/apply_web_loader.py": (
        "translateX(",
        "rotate(-420deg)",
        "yakolakLoaderProgress",
        "loaderLogoMtkyf path{fill:#fff!important}",
    ),
    "scripts/pre_intro_star_to_table.gd": (
        "soft-staggered-fade",
        "node.transparency = 1.0",
        "BOX_START_SCALE",
        "box_final_poses",
    ),
    "scripts/pre_intro_refinement.gd": (
        "direction.normalized().slerp",
        "camera.position = start_position.lerp(end_position, t)",
        "pixel-matched-direct-slow-safe-framing-v6",
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
    print("YAKOLAK approved minimum-gated scene flow, professional star settle, closed rigid box drop, lid exit-only, and gameplay contract preserved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
