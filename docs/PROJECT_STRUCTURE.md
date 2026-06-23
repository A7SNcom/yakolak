# Yakolak Project Structure

## Current clean structure

```txt
/
├─ index.html
├─ app.js
├─ version.json
├─ README.md
├─ src/
│  ├─ app-live.js
│  └─ assets/
│     └─ models/
│        ├─ 9.stl
│        ├─ 3.stl
│        ├─ p.stl
│        ├─ l.stl
│        ├─ m.stl
│        └─ s.stl
├─ docs/
├─ archive/
└─ legacy/
   └─ apps/
      ├─ app-colors-v037.js
      └─ app-clean-v026.js
```

## Root files

```txt
index.html
```

GitHub Pages entry page.

```txt
app.js
```

Small boot file only. It imports `src/app-live.js`.

```txt
version.json
```

Version check file. Build is intentionally frozen for now to avoid refresh-loop risk.

```txt
README.md
```

Simple human overview.

## Source folder

```txt
src/app-live.js
```

Current approved live app.

```txt
src/assets/models/
```

Live STL model files used by `src/app-live.js`.

## Documentation folder

```txt
docs/LIVE_STATE.md
docs/PROJECT_STRUCTURE.md
docs/CURRENT_GOLDEN_STATE.md
docs/AI_AGENT_HANDOFF.md
docs/COLOR_MODE_V037.md
```

## Archive folder

```txt
archive/golden-v036-p-gap-11.json
archive/golden-v036-p-gap-11.js
```

Golden historical references.

## Legacy folder

```txt
legacy/apps/app-colors-v037.js
legacy/apps/app-clean-v026.js
```

Old app versions kept only for reference and rollback study. They are not used by the live site.

## Rule for future work

```txt
Active code goes in src/
Live model assets stay next to the live app under src/assets/models/
Documentation goes in docs/
Old non-live app files go in legacy/
Golden references go in archive/
Root stays clean
```
