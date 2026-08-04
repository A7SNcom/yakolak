#!/usr/bin/env python3
"""Convert the approved YAKOLAK STL files to Godot-friendly OBJ meshes.

No substitute geometry is generated. Every exported mesh comes directly from the
approved STL source files in YAKOLAK_PORTABLE_KIT.
"""
from __future__ import annotations

import math
import struct
from collections import defaultdict
from pathlib import Path
from typing import Iterable

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
            triangles: list[Triangle] = []
            offset = 84
            for _ in range(count):
                offset += 12  # stored normal; recomputed after axis conversion
                vertices = []
                for _vertex in range(3):
                    vertices.append(struct.unpack_from("<fff", data, offset))
                    offset += 12
                offset += 2
                triangles.append((vertices[0], vertices[1], vertices[2]))
            return triangles

    triangles = []
    current: list[Vec3] = []
    text = data.decode("utf-8", errors="ignore")
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("vertex "):
            values = line.split()
            current.append((float(values[1]), float(values[2]), float(values[3])))
            if len(current) == 3:
                triangles.append((current[0], current[1], current[2]))
                current = []
    if not triangles:
        raise RuntimeError(f"Could not parse STL: {path}")
    return triangles


def to_godot(vertex: Vec3) -> Vec3:
    # STL assets use Z-up. Godot uses Y-up. This rotation preserves handedness.
    x, y, z = vertex
    return (x, z, -y)


def key(vertex: Vec3) -> tuple[int, int, int]:
    return tuple(round(value * 1000.0) for value in vertex)  # 0.001-unit weld


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
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root == right_root:
            return
        if self.rank[left_root] < self.rank[right_root]:
            left_root, right_root = right_root, left_root
        self.parent[right_root] = left_root
        if self.rank[left_root] == self.rank[right_root]:
            self.rank[left_root] += 1


def connected_components(triangles: list[Triangle]) -> list[list[Triangle]]:
    uf = UnionFind(len(triangles))
    owners: dict[tuple[int, int, int], int] = {}
    converted = [tuple(to_godot(v) for v in triangle) for triangle in triangles]
    for index, triangle in enumerate(converted):
        for vertex in triangle:
            vertex_key = key(vertex)
            previous = owners.get(vertex_key)
            if previous is None:
                owners[vertex_key] = index
            else:
                uf.union(index, previous)
    groups: dict[int, list[Triangle]] = defaultdict(list)
    for index, triangle in enumerate(converted):
        groups[uf.find(index)].append(triangle)  # type: ignore[arg-type]
    return sorted(groups.values(), key=len, reverse=True)


def bounds(triangles: Iterable[Triangle]) -> tuple[Vec3, Vec3]:
    vertices = [vertex for triangle in triangles for vertex in triangle]
    mins = tuple(min(vertex[axis] for vertex in vertices) for axis in range(3))
    maxs = tuple(max(vertex[axis] for vertex in vertices) for axis in range(3))
    return mins, maxs  # type: ignore[return-value]


def recenter(triangles: list[Triangle]) -> list[Triangle]:
    mins, maxs = bounds(triangles)
    center_x = (mins[0] + maxs[0]) * 0.5
    center_z = (mins[2] + maxs[2]) * 0.5
    floor_y = mins[1]
    return [
        tuple((v[0] - center_x, v[1] - floor_y, v[2] - center_z) for v in triangle)
        for triangle in triangles
    ]  # type: ignore[return-value]


def normal(a: Vec3, b: Vec3, c: Vec3) -> Vec3:
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
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(f"# Approved YAKOLAK asset converted from {source_name}\n")
        handle.write(f"o {path.stem}\n")
        vertex_index = 1
        normal_index = 1
        faces: list[tuple[int, int, int, int]] = []
        for triangle in triangles:
            a, b, c = triangle
            n = normal(a, b, c)
            for vertex in triangle:
                handle.write(f"v {vertex[0]:.6f} {vertex[1]:.6f} {vertex[2]:.6f}\n")
            handle.write(f"vn {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}\n")
            faces.append((vertex_index, vertex_index + 1, vertex_index + 2, normal_index))
            vertex_index += 3
            normal_index += 1
        for first, second, third, face_normal in faces:
            handle.write(
                f"f {first}//{face_normal} {second}//{face_normal} {third}//{face_normal}\n"
            )
    mins, maxs = bounds(triangles)
    dimensions = tuple(maxs[i] - mins[i] for i in range(3))
    print(
        f"{path.name}: {len(triangles)} triangles, "
        f"dimensions=({dimensions[0]:.2f}, {dimensions[1]:.2f}, {dimensions[2]:.2f})"
    )


def convert_single(source: str, destination: str) -> None:
    path = MODELS / source
    triangles = [tuple(to_godot(v) for v in triangle) for triangle in parse_stl(path)]
    write_obj(OUT / destination, triangles, source)


def convert_board_and_lid() -> None:
    source = MODELS / "board-and-lid.stl"
    components = connected_components(parse_stl(source))
    meaningful = [component for component in components if len(component) >= 8]
    print(
        "board-and-lid.stl components:",
        ", ".join(str(len(component)) for component in meaningful[:8]),
    )
    if len(meaningful) < 2:
        raise RuntimeError("Approved board-and-lid STL did not contain two mesh shells")

    # The two dominant shells are the board and its lid. The board has the denser
    # gameplay surface and is the component with more triangles.
    board, lid = meaningful[0], meaningful[1]
    write_obj(OUT / "board.obj", board, source.name)
    write_obj(OUT / "lid.obj", lid, source.name)


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
