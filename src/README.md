# Source Structure

Runtime route:

```txt
index.html -> src/core/app.js -> src/app-prod-stage1.js
```

Prepared folders:

```txt
core/       app boot and shared runtime setup
scene/      room, table, board, pieces creation
loaders/    STL, OBJ, and texture loading helpers
animation/  intro and replay animation logic
utils/      small shared helpers
config/     stable constants and path references
```

Current live file remains:

```txt
src/app-prod-stage1.js
```

Rule: do not split the live file until each extracted part is tested.
