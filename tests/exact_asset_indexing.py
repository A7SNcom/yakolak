"""Verify sharing normals preserves every exported triangle and flat normal."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import prepare_intro_assets as assets

for source, output, pivot in (
    ('board-and-lid.stl', 'board_and_lid.obj', 'center'),
    ('player-base.stl', 'player_base.obj', 'center'),
    ('piece-large.stl', 'piece_large.obj', 'bottom_z'),
    ('piece-medium.stl', 'piece_medium.obj', 'bottom_z'),
    ('piece-small.stl', 'piece_small.obj', 'bottom_z'),
    ('score-marker.stl', 'score_marker.obj', 'center'),
):
    triangles, _ = assets.normalize_pivot(assets.clean_faces(assets.parse_stl(assets.MODELS / source)), pivot)
    vertices, normals, faces = [], [], []
    for line in (assets.OUT / output).read_text().splitlines():
        parts = line.split()
        if parts and parts[0] == 'v': vertices.append(tuple(map(float, parts[1:])))
        if parts and parts[0] == 'vn': normals.append(tuple(map(float, parts[1:])))
        if parts and parts[0] == 'f': faces.append([tuple(map(int, item.split('//'))) for item in parts[1:]])
    assert len(faces) == len(triangles), output
    for triangle, face in zip(triangles, faces):
        expected_normal = tuple(round(x, 6) for x in assets.face_normal(*triangle))
        for vertex, (v, n) in zip(triangle, face):
            assert vertices[v-1] == tuple(round(x, 6) for x in vertex), output
            assert normals[n-1] == expected_normal, output
    print(f'YAKOLAK_EXACT_ASSET_OK {output} triangles={len(faces)} normals={len(normals)}')
