#!/usr/bin/env python3
"""Build or verify the store-launch asset and license-evidence inventory.

This is a local, read-only source audit. It does not decide ownership, inspect
store packages, contact license holders, download assets, or change the game.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
REGISTER = ROOT / "docs/research/store-launch/asset-register.json"
EVIDENCE = ROOT / "docs/research/store-launch/code-evidence.json"
ASSET_ROOTS = (
    "assets",
    "YAKOLAK_PORTABLE_KIT/assets",
    "ui/vendor",
    "web",
)
INCLUDED_SUFFIXES = {
    ".csv", ".css", ".gltf", ".html", ".jpeg", ".jpg", ".js", ".json",
    ".mjs", ".mp3", ".obj", ".ogg", ".otf", ".pck", ".png", ".stl",
    ".svg", ".ttf", ".txt", ".wav", ".wasm", ".webp",
}
SOURCE_SUFFIXES = {
    ".cfg", ".css", ".gd", ".html", ".js", ".json", ".md", ".mjs",
    ".py", ".sh", ".svg", ".tscn", ".tres",
}
SOURCE_ROOTS = ("scripts", "scenes", "ui", "tests", "web", "YAKOLAK_PORTABLE_KIT")
SOURCE_FILES = ("project.godot", "export_presets.cfg")
AUDITOR_PATH = "scripts/audit_store_asset_register.py"


def tracked_paths() -> list[str]:
    raw = subprocess.run(
        ["git", "ls-files", "-z", "--", *ASSET_ROOTS],
        cwd=ROOT,
        check=True,
        capture_output=True,
    ).stdout
    return [path.decode("utf-8") for path in raw.split(b"\0") if path]


def search_paths() -> list[str]:
    raw = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    ).stdout
    results: list[str] = []
    for part in raw.split(b"\0"):
        if not part:
            continue
        path = part.decode("utf-8")
        if path == AUDITOR_PATH:
            continue
        suffix = PurePosixPath(path).suffix.lower()
        if suffix not in SOURCE_SUFFIXES:
            continue
        if path in SOURCE_FILES or path.startswith(tuple(f"{p}/" for p in SOURCE_ROOTS)):
            results.append(path)
    return results


def category_for(path: str) -> str:
    suffix = PurePosixPath(path).suffix.lower()
    if PurePosixPath(path).name in {"TRYSTERO-LICENSES.txt", "LIQUEFY-LICENSE.txt"}:
        return "license_notice"
    if path.endswith("THMANYAH_SOURCE.md"):
        return "source_provenance_note"
    if suffix in {".ttf", ".otf"}:
        return "font"
    if suffix in {".mp3"}:
        return "audio"
    if suffix in {".png", ".svg"}:
        return "image_or_logo"
    if suffix in {".stl", ".obj"}:
        return "3d_model"
    if suffix in {".csv", ".json"}:
        return "design_or_layout_data"
    if "liquefy-core" in path or "online-trystero-" in path:
        return "third_party_browser_library"
    if suffix in {".wasm", ".pck"} or path.endswith("/index.js") or ".worklet.js" in path:
        return "godot_web_export_payload"
    if path.startswith("web/"):
        return "web_export_component"
    return "project_asset"


def evidence_for(path: str) -> list[str]:
    if "thmanyahsans-" in path.lower() or path.endswith("web/setup-font.otf"):
        return ["assets/fonts/THMANYAH_SOURCE.md", "S37"]
    if "online-trystero-" in path:
        return ["web/TRYSTERO-LICENSES.txt"]
    if "liquefy-core" in path:
        return ["ui/vendor/LIQUEFY-LICENSE.txt"]
    if path.startswith("YAKOLAK_PORTABLE_KIT/assets/"):
        return ["YAKOLAK_PORTABLE_KIT/README.md", "YAKOLAK_PORTABLE_KIT/assets/manifest.json"]
    return []


def disposition_for(path: str) -> tuple[str, str, list[str]]:
    """Return scope, rights state, and concrete follow-up without guessing."""
    if path.startswith("YAKOLAK_PORTABLE_KIT/assets/"):
        return (
            "historical_reference; exclude from a mobile bundle unless deliberately reused",
            "owner_and_source_unverified",
            ["If reused, document creator/source, grant, modifications, and exact files included."],
        )
    if path.endswith("THMANYAH_SOURCE.md"):
        return (
            "source_provenance_evidence",
            "official_source_link_recorded; not a redistribution grant",
            ["Keep a dated copy of the applicable license terms and tie each distributed font variant to that grant."],
        )
    if "thmanyahsans-" in path.lower() or path.endswith("web/setup-font.otf"):
        return (
            "current_game_or_web_asset; mobile inclusion depends on selected route",
            "conditional_terms_review_required",
            ["Confirm the current license covers every bundled variant and source copy; preserve required attribution and resolve the public raw web copy/build mirror."],
        )
    if path.endswith("assets/fonts/song.mp3"):
        return (
            "current_game_audio_asset",
            "music_rights_unverified",
            ["Record the track title, creator, source, license or written permission, and mobile synchronization/distribution rights."],
        )
    if path.endswith("assets/fonts/DejaVuSans.ttf"):
        return (
            "current_game_font_asset",
            "font_license_evidence_missing_from_repository",
            ["Record the exact upstream version and its redistribution/notice terms, then ship the required notice."],
        )
    if path.startswith("assets/icons/"):
        return (
            "current_game_ui_asset",
            "icon_source_and_license_unverified",
            ["Confirm whether each SVG is an unmodified third-party icon or project artwork and include the applicable license notice."],
        )
    if path in {"web/TRYSTERO-LICENSES.txt", "web/vendor/LIQUEFY-LICENSE.txt", "ui/vendor/LIQUEFY-LICENSE.txt"}:
        return (
            "license_evidence_for_current_web_tree",
            "notice_present; mobile_package_not_built",
            ["Copy the license notice that matches the exact bundled code into the selected mobile package and verify it is readable in-app."],
        )
    if "online-trystero-" in path or "liquefy-core" in path:
        return (
            "third_party_browser_dependency; wrapper route only",
            "matching_web_notice_present; mobile_package_not_built",
            ["Pin the shipped version and include its complete matching notices in the final mobile bundle."],
        )
    if path.startswith("web/") and category_for(path) == "godot_web_export_payload":
        return (
            "generated_current_web_export; not a native mobile build",
            "engine_and_embedded_asset_notices_require_review",
            ["For a mobile package, collect notices from the exact Godot/export version and audit embedded game assets separately."],
        )
    if path.startswith("web/") and PurePosixPath(path).name == "surface-preview.html":
        return (
            "QA_surface; do not include in store bundle without a product need",
            "project_code; no separate third_party_grant_assessed",
            ["Keep QA-only surfaces out of the production package unless they become an intended player feature."],
        )
    if path.startswith("web/"):
        return (
            "current_pages_web_export; mobile inclusion not selected",
            "project_code_or_export_metadata; mobile_package_not_built",
            ["When staging the selected route, include only required production files and audit all external assets and notices."],
        )
    return (
        "source_asset; mobile inclusion depends on selected route",
        "owner_and_source_unverified",
        ["Record creator/source, grant, modifications, and exact files included before store submission."],
    )


def source_contents(paths: list[str]) -> list[tuple[str, bytes]]:
    results: list[tuple[str, bytes]] = []
    for candidate in paths:
        try:
            content = (ROOT / candidate).read_bytes()
        except OSError:
            continue
        if b"\0" not in content and len(content) <= 4_000_000:
            results.append((candidate, content))
    return results


def references_for(path: str, sources: list[tuple[str, bytes]]) -> list[str]:
    name = PurePosixPath(path).name.encode("utf-8")
    relative = path.encode("utf-8")
    matches: list[str] = []
    for candidate, content in sources:
        if candidate == path:
            continue
        if name in content or relative in content:
            matches.append(candidate)
    return matches


def build_register() -> dict:
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    sources = source_contents(search_paths())
    files: list[dict] = []
    for path in tracked_paths():
        file = ROOT / path
        if file.suffix.lower() not in INCLUDED_SUFFIXES and not path.endswith(
            ("THMANYAH_SOURCE.md", "TRYSTERO-LICENSES.txt", "LIQUEFY-LICENSE.txt")
        ):
            continue
        data = file.read_bytes()
        scope, rights_state, actions = disposition_for(path)
        files.append(
            {
                "path": path,
                "category": category_for(path),
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "scope": scope,
                "rights_state": rights_state,
                "evidence_paths": evidence_for(path),
                "source_references": references_for(path, sources),
                "next_actions": actions,
            }
        )
    files.sort(key=lambda item: item["path"])
    paths_by_digest: dict[str, list[str]] = {}
    for item in files:
        paths_by_digest.setdefault(item["sha256"], []).append(item["path"])
    duplicate_groups = [
        {"sha256": digest, "paths": paths}
        for digest, paths in sorted(paths_by_digest.items())
        if len(paths) > 1
    ]
    for item in files:
        item["identical_content_paths"] = [
            path for path in paths_by_digest[item["sha256"]] if path != item["path"]
        ]
    counts = Counter(item["rights_state"] for item in files)
    return {
        "schema_version": 1,
        "artifact_type": "store_launch_asset_rights_register",
        "as_of": evidence["as_of"],
        "repository": evidence["repository"],
        "source_snapshot_commit": evidence["baseline_commit"],
        "scope": "Tracked media, historical design references, third-party browser bundles/notices, and generated current Web export components in the audited source snapshot.",
        "mobile_package_exists": False,
        "interpretation": "Hashes and source references are reproducible inventory evidence only. They do not prove ownership, permission, app-store compliance, or that a file is included in a future mobile package. No rights state is treated as cleared.",
        "counts_by_rights_state": dict(sorted(counts.items())),
        "identical_file_groups": duplicate_groups,
        "files": files,
    }


def encoded(register: dict) -> str:
    return json.dumps(register, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="write the current inventory JSON")
    mode.add_argument("--check", action="store_true", help="fail if the checked-in inventory is stale")
    args = parser.parse_args()
    current = encoded(build_register())
    if args.write:
        REGISTER.write_text(current, encoding="utf-8")
        print(f"Wrote {REGISTER.relative_to(ROOT)}")
        return 0
    existing = REGISTER.read_text(encoding="utf-8") if REGISTER.exists() else ""
    if existing != current:
        print("Asset register is missing or stale; run with --write after reviewing changes.", file=sys.stderr)
        return 1
    print("Asset register matches tracked source bytes and audit rules.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
