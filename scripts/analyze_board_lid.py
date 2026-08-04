#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from prepare_assets import bounds, connected_components, parse_stl, remove_duplicate_faces

SOURCE = Path(__file__).resolve().parents[1] / "YAKOLAK_PORTABLE_KIT" / "assets" / "models" / "board-and-lid.stl"


def main() -> None:
    components = [component for component in connected_components(parse_stl(SOURCE)) if len(component) >= 8]
    print("BOARD_LID_COMPONENT_AUDIT_BEGIN")
    for index, component in enumerate(components):
        cleaned = remove_duplicate_faces(component)
        mins, maxs = bounds(cleaned)
        dims = tuple(maxs[axis] - mins[axis] for axis in range(3))
        center = tuple((mins[axis] + maxs[axis]) * 0.5 for axis in range(3))
        print(
            f"component={index:02d} source_triangles={len(component)} cleaned_triangles={len(cleaned)} "
            f"min=({mins[0]:.3f},{mins[1]:.3f},{mins[2]:.3f}) "
            f"max=({maxs[0]:.3f},{maxs[1]:.3f},{maxs[2]:.3f}) "
            f"dims=({dims[0]:.3f},{dims[1]:.3f},{dims[2]:.3f}) "
            f"center=({center[0]:.3f},{center[1]:.3f},{center[2]:.3f})"
        )
    print("BOARD_LID_COMPONENT_AUDIT_END")


if __name__ == "__main__":
    main()
