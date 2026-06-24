# FILES AUDIT

Branch: الفرع-النظيف-والمرتب

Status: cleaned non-runtime files and created standard folders.
Runtime is not changed yet.

## Keep

- index.html
- app.js
- version.json
- README.md
- src/app-prod-stage1.js
- docs/YAKOLAK_PROJECT_RULES.md

## Created folders

- assets/models/game
- assets/models/table
- assets/textures/table
- assets/textures/pieces
- archive/golden
- archive/experiments
- archive/old-builds
- archive/legacy-assets
- preview

## Created routes

- preview/empty-room.html

## Removed from this branch

- empty-room.html
- src/app-live.js
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
