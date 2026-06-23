# Yakolak Project Structure

## Root files

```txt
index.html
```

GitHub Pages entry page. It prepares the DOM, importmap, cache-control tags, version check, and imports `app.js`.

```txt
app.js
```

Tiny live boot file. It points to the approved live app file.

```txt
app-hejaz-v043.js
```

Current approved live app. It loads models from `assets/models/`.

```txt
version.json
```

Loader/version check file. Build is intentionally frozen for now to avoid refresh-loop risk.

```txt
README.md
```

Human overview of the current live project.

## Assets folder

```txt
assets/models/9.stl
assets/models/3.stl
assets/models/p.stl
assets/models/l.stl
assets/models/m.stl
assets/models/s.stl
```

All STL model files are now grouped in `assets/models/`. The live app uses `MODEL_DIR='./assets/models/'` and loads models through `modelPath()`.

## Documentation folder

```txt
docs/LIVE_STATE.md
```

Current approved live state.

```txt
docs/PROJECT_STRUCTURE.md
```

Repository organization and file purpose.

```txt
docs/CURRENT_GOLDEN_STATE.md
```

Golden geometry and positioning rules.

```txt
docs/AI_AGENT_HANDOFF.md
```

Rules for future AI agents or developers.

```txt
docs/COLOR_MODE_V037.md
```

Historical color-control documentation. Useful as reference only, not the current live route.

## Archive folder

```txt
archive/golden-v036-p-gap-11.json
archive/golden-v036-p-gap-11.js
```

Golden historical reference.

## Legacy app files

Some old app files may remain in root for safety and rollback history. They are not the current live route unless `app.js` points to them.

## Current structure

```txt
/
├─ index.html
├─ app.js
├─ app-hejaz-v043.js
├─ version.json
├─ README.md
├─ assets/
│  └─ models/
│     ├─ 9.stl
│     ├─ 3.stl
│     ├─ p.stl
│     ├─ l.stl
│     ├─ m.stl
│     └─ s.stl
├─ docs/
└─ archive/
```
