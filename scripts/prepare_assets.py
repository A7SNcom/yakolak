#!/usr/bin/env python3
"""Convert the approved YAKOLAK STL files to Godot-friendly OBJ meshes.

No substitute geometry is generated. The approved board-and-lid STL is one
complete multi-shell model that is instantiated twice by the intro: once as the
board and once as the temporary lid.
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


def convert_single(source: str, destination: str) -> None:
    path = MODELS / source
    triangles = [tuple(to_godot(v) for v in triangle) for triangle in parse_stl(path)]
    write_obj(OUT / destination, triangles, source)


def convert_board_and_lid() -> None:
    source = MODELS / "board-and-lid.stl"
    components = [item for item in connected_components(parse_stl(source)) if len(item) >= 8]
    complete_model = [triangle for component in components for triangle in component]
    print(
        f"board-and-lid.stl complete model: {len(components)} shells, "
        f"{len(complete_model)} triangles"
    )
    if len(components) != 29:
        raise RuntimeError(
            f"Approved board/lid asset changed unexpectedly: expected 29 shells, got {len(components)}"
        )
    write_obj(OUT / "board.obj", complete_model, source.name)
    write_obj(OUT / "lid.obj", complete_model, source.name)


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
