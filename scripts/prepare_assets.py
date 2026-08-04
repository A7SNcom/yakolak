#!/usr/bin/env python3
"""Convert approved YAKOLAK STL assets to Godot-friendly OBJ meshes.

No substitute geometry is generated. The board/lid STL is an assembly containing
many disconnected shells, so its shells are spatially grouped into the two
original assemblies before export.
"""
from __future__ import annotations

import math
import statistics
import struct
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "YAKOLAK_PORTABLE_KIT" / "assets" / "models"
OUT = ROOT / "generated"

Vec3 = tuple[float, float, float]
Triangle = tuple[Vec3, Vec3, Vec3]


@dataclass(frozen=True)
class ComponentInfo:
    triangles: list[Triangle]
    center: Vec3
    dimensions: Vec3


def parse_stl(path: Path) -> list[Triangle]:
    data = path.read_bytes()
    if len(data) >= 84:
        count = struct.unpack_from("<I", data, 80)[0]
        if 84 + count * 50 == len(data):
            triangles: list[Triangle] = []
            offset = 84
            for _ in range(count):
                offset += 12
                vertices: list[Vec3] = []
                for _vertex in range(3):
                    vertices.append(struct.unpack_from("<fff", data, offset))
                    offset += 12
                offset += 2
                triangles.append((vertices[0], vertices[1], vertices[2]))
            return triangles

    triangles = []
    current: list[Vec3] = []
    for raw in data.decode("utf-8", errors="ignore").splitlines():
        values = raw.strip().split()
        if values[:1] == ["vertex"] and len(values) >= 4:
            current.append((float(values[1]), float(values[2]), float(values[3])))
            if len(current) == 3:
                triangles.append((current[0], current[1], current[2]))
                current = []
    if not triangles:
        raise RuntimeError(f"Could not parse STL: {path}")
    return triangles


def to_godot(vertex: Vec3) -> Vec3:
    x, y, z = vertex
    return (x, z, -y)


def weld_key(vertex: Vec3) -> tuple[int, int, int]:
    return tuple(round(value * 1000.0) for value in vertex)


class UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, item: int) -> int:
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, left: int, right: int) -> None:
        left = self.find(left)
        right = self.find(right)
        if left == right:
            return
        if self.rank[left] < self.rank[right]:
            left, right = right, left
        self.parent[right] = left
        if self.rank[left] == self.rank[right]:
            self.rank[left] += 1


def connected_components(source_triangles: list[Triangle]) -> list[list[Triangle]]:
    triangles = [tuple(to_godot(v) for v in triangle) for triangle in source_triangles]
    uf = UnionFind(len(triangles))
    owners: dict[tuple[int, int, int], int] = {}
    for index, triangle in enumerate(triangles):
        for vertex in triangle:
            vertex_key = weld_key(vertex)
            if vertex_key in owners:
                uf.union(index, owners[vertex_key])
            else:
                owners[vertex_key] = index
    groups: dict[int, list[Triangle]] = defaultdict(list)
    for index, triangle in enumerate(triangles):
        groups[uf.find(index)].append(triangle)  # type: ignore[arg-type]
    return sorted(groups.values(), key=len, reverse=True)


def bounds(triangles: Iterable[Triangle]) -> tuple[Vec3, Vec3]:
    vertices = [vertex for triangle in triangles for vertex in triangle]
    mins = tuple(min(vertex[axis] for vertex in vertices) for axis in range(3))
    maxs = tuple(max(vertex[axis] for vertex in vertices) for axis in range(3))
    return mins, maxs  # type: ignore[return-value]


def component_info(triangles: list[Triangle]) -> ComponentInfo:
    mins, maxs = bounds(triangles)
    center = tuple((mins[i] + maxs[i]) * 0.5 for i in range(3))
    dimensions = tuple(maxs[i] - mins[i] for i in range(3))
    return ComponentInfo(triangles, center, dimensions)  # type: ignore[arg-type]


def recenter(triangles: list[Triangle]) -> list[Triangle]:
    mins, maxs = bounds(triangles)
    shift = ((mins[0] + maxs[0]) * 0.5, mins[1], (mins[2] + maxs[2]) * 0.5)
    return [
        tuple((v[0] - shift[0], v[1] - shift[1], v[2] - shift[2]) for v in triangle)
        for triangle in triangles
    ]  # type: ignore[return-value]


def face_normal(a: Vec3, b: Vec3, c: Vec3) -> Vec3:
    ab = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    ac = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    cross = (
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
    )
    length = math.sqrt(sum(value * value for value in cross)) or 1.0
    return tuple(value / length for value in cross)  # type: ignore[return-value]


def write_obj(path: Path, triangles: list[Triangle], source_name: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    triangles = recenter(triangles)

    vertices: list[Vec3] = []
    vertex_indices: dict[tuple[float, float, float], int] = {}
    faces: list[tuple[tuple[int, int, int], Vec3]] = []
    for triangle in triangles:
        indices = []
        for vertex in triangle:
            vertex_key = tuple(round(value, 6) for value in vertex)
            if vertex_key not in vertex_indices:
                vertex_indices[vertex_key] = len(vertices) + 1
                vertices.append(vertex)
            indices.append(vertex_indices[vertex_key])
        faces.append(((indices[0], indices[1], indices[2]), face_normal(*triangle)))

    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(f"# Approved YAKOLAK asset converted from {source_name}\n")
        handle.write(f"o {path.stem}\n")
        for vertex in vertices:
            handle.write(f"v {vertex[0]:.6f} {vertex[1]:.6f} {vertex[2]:.6f}\n")
        for normal in (entry[1] for entry in faces):
            handle.write(f"vn {normal[0]:.6f} {normal[1]:.6f} {normal[2]:.6f}\n")
        for normal_index, (indices, _normal) in enumerate(faces, start=1):
            handle.write(
                f"f {indices[0]}//{normal_index} {indices[1]}//{normal_index} "
                f"{indices[2]}//{normal_index}\n"
            )

    mins, maxs = bounds(triangles)
    dimensions = tuple(maxs[i] - mins[i] for i in range(3))
    print(
        f"{path.name}: {len(triangles)} triangles, {len(vertices)} welded vertices, "
        f"dimensions=({dimensions[0]:.2f}, {dimensions[1]:.2f}, {dimensions[2]:.2f})"
    )


def best_spatial_split(components: list[ComponentInfo]) -> tuple[list[ComponentInfo], list[ComponentInfo]]:
    best: tuple[float, int, int] | None = None
    for axis in range(3):
        ordered = sorted(range(len(components)), key=lambda i: components[i].center[axis])
        typical_extent = statistics.median(max(components[i].dimensions[axis], 0.1) for i in ordered)
        for split_at in range(1, len(ordered)):
            left_index = ordered[split_at - 1]
            right_index = ordered[split_at]
            gap = components[right_index].center[axis] - components[left_index].center[axis]
            left_count = split_at
            right_count = len(ordered) - split_at
            if left_count < 2 or right_count < 2:
                continue
            balance = min(left_count, right_count) / max(left_count, right_count)
            score = (gap / typical_extent) * (0.65 + 0.35 * balance)
            if best is None or score > best[0]:
                best = (score, axis, split_at)
    if best is None:
        raise RuntimeError("Could not split board/lid assembly")

    score, axis, split_at = best
    ordered_components = sorted(components, key=lambda entry: entry.center[axis])
    left = ordered_components[:split_at]
    right = ordered_components[split_at:]
    print(
        f"board/lid assembly split: axis={axis}, score={score:.2f}, "
        f"shells={len(left)}+{len(right)}"
    )
    return left, right


def merge_components(components: list[ComponentInfo]) -> list[Triangle]:
    return [triangle for component in components for triangle in component.triangles]


def convert_single(source: str, destination: str) -> None:
    path = MODELS / source
    triangles = [tuple(to_godot(v) for v in triangle) for triangle in parse_stl(path)]
    write_obj(OUT / destination, triangles, source)


def convert_board_and_lid() -> None:
    source = MODELS / "board-and-lid.stl"
    raw_components = connected_components(parse_stl(source))
    components = [component_info(item) for item in raw_components if len(item) >= 8]
    print(f"board-and-lid.stl meaningful shells: {len(components)}")
    for index, item in enumerate(components):
        print(
            f"  shell {index:02d}: triangles={len(item.triangles)}, "
            f"center=({item.center[0]:.1f},{item.center[1]:.1f},{item.center[2]:.1f}), "
            f"size=({item.dimensions[0]:.1f},{item.dimensions[1]:.1f},{item.dimensions[2]:.1f})"
        )
    if len(components) < 4:
        raise RuntimeError("Approved board/lid asset contains too few shells")

    first, second = best_spatial_split(components)
    first_triangles = merge_components(first)
    second_triangles = merge_components(second)

    # The board carries the denser gameplay surface. If triangle totals tie,
    # the assembly with more disconnected shells is the board.
    first_weight = (len(first_triangles), len(first))
    second_weight = (len(second_triangles), len(second))
    if first_weight >= second_weight:
        board_triangles, lid_triangles = first_triangles, second_triangles
    else:
        board_triangles, lid_triangles = second_triangles, first_triangles

    write_obj(OUT / "board.obj", board_triangles, source.name)
    write_obj(OUT / "lid.obj", lid_triangles, source.name)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    convert_board_and_lid()
    convert_single("player-base.stl", "player_base.obj")
    convert_single("piece-small.stl", "piece_small.obj")
    convert_single("piece-medium.stl", "piece_medium.obj")
    convert_single("piece-large.stl", "piece_large.obj")
    convert_single("score-marker.stl", "score_marker.obj")
    print("Approved STL conversion complete")


if __name__ == "__main__":
    main()
