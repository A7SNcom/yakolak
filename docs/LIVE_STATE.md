# Yakolak Live State

## Live source of truth

```txt
index.html -> app.js -> app-hejaz-v043.js
```

This is the currently approved live user experience.

## What must stay unchanged

```txt
app-hejaz-v043.js
9.stl
3.stl
p.stl
l.stl
m.stl
s.stl
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
Load STL files from repository root
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
1. Keep app-hejaz-v043.js untouched.
2. Create a new app candidate file, for example app-hejaz-v044.js.
3. Test visually.
4. Only after approval, change app.js to point to the new candidate.
5. Keep the previous approved app file in place as rollback.
```
