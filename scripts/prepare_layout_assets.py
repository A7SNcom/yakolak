#!/usr/bin/env python3
"""Convert the approved base and piece STL files for the 2.4 layout audit.

The source mesh shape and scale are preserved. CAD drawing offsets are removed
only to create a predictable pivot: horizontal center at X/Y and bottom at Z=0.
No axis conversion, simplification, or substitute geometry is applied. Exact
duplicate and degenerate faces are removed. The authoritative -90 degree X
rotations are applied later in Godot.
"""
from __future__ import annotations

import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "YAKOLAK_PORTABLE_KIT" / "assets" / "models"
OUT = ROOT / "generated"

Vec3 = tuple[float, float, float]
Triangle = tuple[Vec3, Vec3, Vec3]


def parse_stl(path: Path) -> list[Triangle]:
    data = path.read_bytes()
    if len(data) >= 84:
        count = struct.unpack_from("<I", data, 80)[0]
        if 84 + count * 50 == len(data):
            result: list[Triangle] = []
            offset = 84
            for _ in range(count):
                offset += 12
                vertices: list[Vec3] = []
                for _vertex in range(3):
                    vertices.append(struct.unpack_from("<fff", data, offset))
                    offset += 12
                offset += 2
                result.append((vertices[0], vertices[1], vertices[2]))
            return result

    result = []
    current: list[Vec3] = []
    for raw in data.decode("utf-8", errors="ignore").splitlines():
        values = raw.strip().split()
        if values[:1] == ["vertex"] and len(values) >= 4:
            current.append((float(values[1]), float(values[2]), float(values[3])))
            if len(current) == 3:
                result.append((current[0], current[1], current[2]))
                current = []
    if not result:
        raise RuntimeError(f"Could not parse approved STL: {path}")
    return result


def face_normal(a: Vec3, b: Vec3, c: Vec3) -> Vec3:
    ab = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    ac = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    cross = (
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
    )
    length = math.sqrt(sum(value * value for value in cross))
    if length <= 1e-12:
        return (0.0, 0.0, 1.0)
    return tuple(value / length for value in cross)  # type: ignore[return-value]


def clean_faces(triangles: list[Triangle]) -> list[Triangle]:
    clean: list[Triangle] = []
    seen: set[tuple[tuple[float, float, float], ...]] = set()
    for triangle in triangles:
        keys = tuple(tuple(round(value, 6) for value in vertex) for vertex in triangle)
        if len(set(keys)) != 3:
            continue
        key = tuple(sorted(keys))
        if key in seen:
            continue
        seen.add(key)
        clean.append(triangle)
    return clean


def bounds(triangles: list[Triangle]) -> tuple[Vec3, Vec3]:
    vertices = [vertex for triangle in triangles for vertex in triangle]
    mins = tuple(min(vertex[axis] for vertex in vertices) for axis in range(3))
    maxs = tuple(max(vertex[axis] for vertex in vertices) for axis in range(3))
    return mins, maxs  # type: ignore[return-value]


def normalize_pivot(triangles: list[Triangle]) -> tuple[list[Triangle], Vec3]:
    mins, maxs = bounds(triangles)
    shift: Vec3 = (
        (mins[0] + maxs[0]) * 0.5,
        (mins[1] + maxs[1]) * 0.5,
        mins[2],
    )
    normalized: list[Triangle] = []
    for triangle in triangles:
        normalized.append(tuple(
            (vertex[0] - shift[0], vertex[1] - shift[1], vertex[2] - shift[2])
            for vertex in triangle
        ))  # type: ignore[arg-type]
    return normalized, shift


def write_obj(source_name: str, destination_name: str) -> None:
    source = MODELS / source_name
    original = parse_stl(source)
    cleaned = clean_faces(original)
    if not cleaned:
        raise RuntimeError(f"Approved asset became empty: {source_name}")
    triangles, pivot_shift = normalize_pivot(cleaned)

    vertices: list[Vec3] = []
    vertex_index: dict[Vec3, int] = {}
    faces: list[tuple[tuple[int, int, int], Vec3]] = []
    for triangle in triangles:
        indices: list[int] = []
        for vertex in triangle:
            key: Vec3 = tuple(round(value, 6) for value in vertex)  # type: ignore[assignment]
            if key not in vertex_index:
                vertex_index[key] = len(vertices) + 1
                vertices.append(key)
            indices.append(vertex_index[key])
        faces.append(((indices[0], indices[1], indices[2]), face_normal(*triangle)))

    destination = OUT / destination_name
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(f"# Approved YAKOLAK source: {source_name}\n")
        handle.write("# Shape and scale preserved; CAD drawing offset removed for bottom-center pivot.\n")
        handle.write(f"o {destination.stem}\n")
        for x, y, z in vertices:
            handle.write(f"v {x:.6f} {y:.6f} {z:.6f}\n")
        for nx, ny, nz in (entry[1] for entry in faces):
            handle.write(f"vn {nx:.6f} {ny:.6f} {nz:.6f}\n")
        for normal_index, (indices, _normal) in enumerate(faces, start=1):
            handle.write(
                f"f {indices[0]}//{normal_index} {indices[1]}//{normal_index} "
                f"{indices[2]}//{normal_index}\n"
            )

    mins, maxs = bounds(triangles)
    print(
        f"{destination_name}: {len(original)}->{len(triangles)} triangles; "
        f"pivot_shift=({pivot_shift[0]:.3f},{pivot_shift[1]:.3f},{pivot_shift[2]:.3f}); "
        f"normalized_bounds=({mins[0]:.3f},{mins[1]:.3f},{mins[2]:.3f}).."
        f"({maxs[0]:.3f},{maxs[1]:.3f},{maxs[2]:.3f})"
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write_obj("player-base.stl", "player_base.obj")
    write_obj("piece-large.stl", "piece_large.obj")
    write_obj("piece-medium.stl", "piece_medium.obj")
    write_obj("piece-small.stl", "piece_small.obj")
    print("YAKOLAK_24_APPROVED_LAYOUT_ASSETS_READY")


if __name__ == "__main__":
    main()
