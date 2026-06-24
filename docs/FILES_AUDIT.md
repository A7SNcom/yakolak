# FILES AUDIT

Branch: الفرع-النظيف-والمرتب

Status: root cleaned and legacy boot archived.
Runtime route updated.

## Root keep

- index.html
- version.json
- README.md

## Runtime route

- index.html
- src/core/app.js
- src/app-prod-stage1.js

## Source folders

- src/core
- src/scene
- src/loaders
- src/animation
- src/utils
- src/config
- src/README.md

## Docs keep

- docs/YAKOLAK_PROJECT_RULES.md
- docs/FILES_AUDIT.md
- docs/reference/project-structure.md
- docs/reference/room.md
- docs/reference/table.md
- docs/plans/asset-organization.md
- docs/logs/organization-log.md

## Asset folders

- assets/README.md
- assets/models/game
- assets/models/table
- assets/textures/table
- assets/textures/pieces

## Archive folders

- archive/README.md
- archive/golden
- archive/experiments
- archive/experiments/info.txt
- archive/old-builds
- archive/old-builds/NOTES.md
- archive/old-builds/room-boot-v049.js
- archive/legacy-assets

## Preview folders

- preview/NOTES.md

## Removed from root or active folders

- app.js
- room-boot-v049.js
- empty-room.html
- preview/empty-room.html
- src/app-live.js
- docs/ROOM_NOTES.md
- docs/TABLE_NOTES.md
- assets/models/p.stl
- assets/models/background.webp
- assets/models/big-back.webp
- assets/models/Asset 1big.svg
- assets/models/aaaaaaaaa.svg

## Still active in current runtime

- assets/models/9.stl
- assets/models/3.stl
- assets/models/l.stl
- assets/models/m.stl
- assets/models/s.stl
- assets/models/table OBJ
- assets/models/table texture maps

## Next safe step

Move active assets only after updating src/app-prod-stage1.js paths in the same tested step.
