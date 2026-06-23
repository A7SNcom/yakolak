# Yakolak Live State

## Live source of truth

```txt
index.html -> app.js -> src/app-live.js
```

This is the currently approved live user experience.

## What must stay unchanged visually

```txt
src/app-live.js
src/assets/models/9.stl
src/assets/models/3.stl
src/assets/models/p.stl
src/assets/models/l.stl
src/assets/models/m.stl
src/assets/models/s.stl
```

The current page is already good for final browsing. Cleanup work must not change visuals, model positions, intro behavior, materials, or loading behavior unless explicitly requested.

## Current live constants

```txt
D  = 48
R3 = 135
PR = 85
PG = 11
```

Meaning:

```txt
D  = stone distance
R3 = outer 3.stl radius
PR = p.stl row radius
PG = p.stl piece gap
```

## Current live app responsibilities

```txt
Load Three.js and addons through importmap
Load STL files from src/assets/models/
Load marble texture from external URL
Create scene, camera, renderer, lights, and orbit controls
Build board and outer bases
Build p.stl instances
Generate intro spill arrangement
Animate intro
Snap final state to approved static layout
Provide replay button
Hide old settings panel
```

## Important note

The live app internal version string is not the same as README historical versions. The actual route decides the truth.

## Safe future workflow

```txt
1. Keep src/app-live.js stable unless a new visual state is approved.
2. Create a new app candidate under src/, for example src/app-next.js.
3. Test visually.
4. Only after approval, change app.js to point to the new candidate.
5. Keep the previous approved app file available for rollback.
```
