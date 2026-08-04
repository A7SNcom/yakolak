# Asset Manifest

All required transferable visual assets are included under `assets/`.

| Included path | Role |
|---|---|
| `assets/logos/YAKOLAK.svg` | official game logo |
| `assets/logos/MTKYF.svg` | official company logo |
| `assets/models/board-and-lid.stl` | central board and cloned intro lid |
| `assets/models/player-base.stl` | one player rest/base, instanced four times |
| `assets/models/piece-small.stl` | small piece, instanced 12 times |
| `assets/models/piece-medium.stl` | medium piece, instanced 12 times |
| `assets/models/piece-large.stl` | large piece, instanced 12 times |
| `assets/models/score-marker.stl` | persistent score points |
| `assets/table/table.svg` | table footprint; extrude to build table geometry |
| `assets/table/albedo.png` | table color texture |
| `assets/table/normal.png` | table normal texture |
| `assets/table/roughness.png` | table roughness texture |
| `assets/ui/loading-star.svg` | approved loading symbol |
| `assets/room/ROOM.md` | generated-room dimensions and construction |
| `assets/room/room-plan.svg` | simple top-view reference |
| `assets/manifest.json` | machine-readable list |

## Important notes

- The room is generated from planes/boxes; there is no missing room model.
- `board-and-lid.stl` is intentionally one mesh used for both roles.
- Preserve mesh centers and use the transforms in `WORLD.md`; file units may be normalized uniformly.
- White pieces may use subtle procedural marble veining. Do not depend on an external image URL.
- The original UI font is not part of the portable contract. Use any readable Arabic/Latin font; rules, geometry, and motion must not depend on typography.
- Audio is optional because no canonical audio sequence exists in the reviewed builds.
