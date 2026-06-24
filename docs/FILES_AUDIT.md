# FILES AUDIT

Branch: الفرع-النظيف-والمرتب

Status: cleaner structure with separated docs folders.
Runtime is not changed yet.

## Runtime keep

- index.html
- app.js
- version.json
- src/app-prod-stage1.js

## Docs keep

- README.md
- docs/YAKOLAK_PROJECT_RULES.md
- docs/FILES_AUDIT.md
- docs/reference/room.md
- docs/reference/table.md
- docs/plans/asset-organization.md
- docs/logs/organization-log.md

## Folders

- assets/models/game
- assets/models/table
- assets/textures/table
- assets/textures/pieces
- archive/golden
- archive/experiments
- archive/old-builds
- archive/legacy-assets
- preview
- docs/reference
- docs/plans
- docs/logs

## Removed from this branch

- empty-room.html
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
