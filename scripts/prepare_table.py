#!/usr/bin/env python3
"""Create the approved YAKOLAK star tabletop from the exact table.svg footprint."""
from __future__ import annotations

import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "YAKOLAK_PORTABLE_KIT" / "assets" / "table" / "table.svg"
OUTPUT = ROOT / "generated" / "table.obj"
TARGET_SPAN = 16.5
THICKNESS = 0.8

Point = tuple[float, float]
Triangle = tuple[int, int, int]


def signed_area(points: list[Point]) -> float:
    return 0.5 * sum(
        points[i][0] * points[(i + 1) % len(points)][1]
        - points[(i + 1) % len(points)][0] * points[i][1]
        for i in range(len(points))
    )


def cross(a: Point, b: Point, c: Point) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def point_in_triangle(point: Point, a: Point, b: Point, c: Point) -> bool:
    first = cross(a, b, point)
    second = cross(b, c, point)
    third = cross(c, a, point)
    has_negative = first < -1e-9 or second < -1e-9 or third < -1e-9
    has_positive = first > 1e-9 or second > 1e-9 or third > 1e-9
    return not (has_negative and has_positive)


def triangulate(points: list[Point]) -> list[Triangle]:
    if signed_area(points) < 0.0:
        points.reverse()
    remaining = list(range(len(points)))
    triangles: list[Triangle] = []
    guard = 0
    while len(remaining) > 3:
        guard += 1
        if guard > len(points) * len(points):
            raise RuntimeError("Could not triangulate approved star table footprint")
        clipped = False
        for offset, current in enumerate(remaining):
            previous = remaining[offset - 1]
            following = remaining[(offset + 1) % len(remaining)]
            a, b, c = points[previous], points[current], points[following]
            if cross(a, b, c) <= 1e-9:
                continue
            if any(
                point_in_triangle(points[index], a, b, c)
                for index in remaining
                if index not in (previous, current, following)
            ):
                continue
            triangles.append((previous, current, following))
            del remaining[offset]
            clipped = True
            break
        if not clipped:
            raise RuntimeError("Approved star table footprint contains an invalid polygon")
    triangles.append((remaining[0], remaining[1], remaining[2]))
    return triangles


def parse_svg() -> list[Point]:
    text = SOURCE.read_text(encoding="utf-8")
    path_match = re.search(r'<path\s+d="([^"]+)"', text)
    matrix_match = re.search(r'transform="matrix\(([^)]+)\)"', text)
    if not path_match or not matrix_match:
        raise RuntimeError("Approved table SVG path or transform was not found")

    source_points = [
        (float(x), float(y))
        for x, y in re.findall(r'(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)', path_match.group(1))
    ]
    if len(source_points) > 1 and source_points[0] == source_points[-1]:
        source_points.pop()
    if len(source_points) < 3:
        raise RuntimeError("Approved table SVG contains too few points")

    matrix = [float(value) for value in re.split(r'[ ,]+', matrix_match.group(1).strip())]
    if len(matrix) != 6:
        raise RuntimeError("Approved table SVG matrix is invalid")
    a, b, c, d, e, f = matrix
    transformed = [(a * x + c * y + e, b * x + d * y + f) for x, y in source_points]

    min_x = min(point[0] for point in transformed)
    max_x = max(point[0] for point in transformed)
    min_y = min(point[1] for point in transformed)
    max_y = max(point[1] for point in transformed)
    center_x = (min_x + max_x) * 0.5
    center_y = (min_y + max_y) * 0.5
    scale = TARGET_SPAN / max(max_x - min_x, max_y - min_y)
    points = [((x - center_x) * scale, (y - center_y) * scale) for x, y in transformed]
    if signed_area(points) < 0.0:
        points.reverse()
    return points


def side_normal(a: Point, b: Point) -> tuple[float, float, float]:
    dx = b[0] - a[0]
    dz = b[1] - a[1]
    length = math.hypot(dx, dz)
    if length <= 1e-9:
        raise RuntimeError("Approved star table contains a zero-length edge")
    # For a counter-clockwise XZ polygon, (dz, 0, -dx) points outward.
    return dz / length, 0.0, -dx / length


def write_obj(points: list[Point]) -> None:
    top_triangles = triangulate(points)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    count = len(points)
    with OUTPUT.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("# Approved YAKOLAK star table extruded from exact table.svg\n")
        handle.write("# Explicit flat normals prevent the top from shading like a curved shell.\n")
        handle.write("o approved_star_table\n")
        handle.write("s off\n")
        for x, z in points:
            handle.write(f"v {x:.6f} 0.000000 {z:.6f}\n")
        for x, z in points:
            handle.write(f"v {x:.6f} {THICKNESS:.6f} {z:.6f}\n")

        # Normal indices: 1 top, 2 bottom, 3..(count+2) one outward normal per side.
        handle.write("vn 0.000000 1.000000 0.000000\n")
        handle.write("vn 0.000000 -1.000000 0.000000\n")
        for index in range(count):
            following = (index + 1) % count
            nx, ny, nz = side_normal(points[index], points[following])
            handle.write(f"vn {nx:.6f} {ny:.6f} {nz:.6f}\n")

        for a, b, c in top_triangles:
            handle.write(
                f"f {a + count + 1}//1 {c + count + 1}//1 {b + count + 1}//1\n"
            )
            handle.write(f"f {a + 1}//2 {b + 1}//2 {c + 1}//2\n")

        for index in range(count):
            following = (index + 1) % count
            bottom_a = index + 1
            bottom_b = following + 1
            top_a = index + count + 1
            top_b = following + count + 1
            normal_index = index + 3
            handle.write(
                f"f {bottom_a}//{normal_index} {top_b}//{normal_index} {bottom_b}//{normal_index}\n"
            )
            handle.write(
                f"f {bottom_a}//{normal_index} {top_a}//{normal_index} {top_b}//{normal_index}\n"
            )

    print(
        f"table.obj: {len(points)} approved points, "
        f"{len(top_triangles) * 2 + len(points) * 2} triangles, "
        f"{len(points) + 2} explicit flat normals, "
        f"span={TARGET_SPAN}, thickness={THICKNESS}"
    )


def main() -> None:
    write_obj(parse_svg())


if __name__ == "__main__":
    main()
