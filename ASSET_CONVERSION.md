# YAKOLAK Three.js asset conversion contract

`THREEJS-016` defines one deterministic, offline maintenance path for canonical 3D sources. It does **not** change the source-of-truth order: `YAKOLAK_PORTABLE_KIT/assets/` remains canonical and is read-only input to conversion.

## Commands

- `npm run assets:convert` — convert only stale/missing STL targets to committed GLB outputs.
- `npm run assets:convert -- --only=model.piece-small` — convert one explicit logical target.
- `npm run assets:convert -- --force` — rebuild selected targets even when provenance says they are current.
- `npm run assets:check` — read-only verification that committed GLBs still match source hashes, converter version and recorded output hashes.

These commands are developer asset-maintenance operations. They are intentionally absent from `vercel.json`, `prebuild`, `postinstall`, and the normal shell build path. Ordinary JS/CSS edits must not trigger canonical model conversion.

## Inputs and outputs

The CLI derives the complete STL list from the definitive portable manifest and refuses plan drift. Current outputs are reserved under `web/assets/models/`:

- `board-and-lid.glb`
- `player-base.glb`
- `piece-small.glb`
- `piece-medium.glb`
- `piece-large.glb`
- `score-marker.glb`

The sibling `conversion-state.json` is generated with the outputs and must be committed whenever generated GLBs change. It records, per logical asset:

- canonical source path, byte size, SHA-256 and Git-blob SHA-1;
- exact converter ID/version and pinned Node major (`22.x`);
- output path, byte size and SHA-256;
- triangle count and connected-component count;
- explicit transform, normal and component-separation policies.

No timestamps enter the output or state, so identical inputs and converter version produce identical GLB bytes.

## Geometry invariants

The converter writes source float32 coordinates directly into glTF/GLB space. It never centers, scales, rotates, bakes camera offsets, or moves pivots. Runtime placement therefore remains owned by authoritative layout data, not hidden conversion transforms.

STL face normals are normalized and retained; a normal is computed from triangle winding only when the source normal is zero/invalid. Disconnected triangle components are kept as separately addressable nodes, ordered by the first source triangle they contain. This preserves stable object separation without inventing semantic ownership; later model-specific tasks map those components to names such as board/lid where the source geometry proves the mapping.

SVG, PNG and canonical data files are not conversion targets for this pipeline and are never rewritten.

## Atomicity and changed-only behavior

A target is skipped only when all of these still match the recorded state: source SHA-256, source Git-blob SHA-1, source byte size, converter ID/version/Node major, output path and output SHA-256. A changed source therefore rebuilds only its own GLB. Writes use a same-directory temporary file followed by rename so an interrupted conversion cannot leave a partially written committed asset.

`npm run assets:check` never repairs or rewrites anything; it fails on missing, stale or corrupted outputs so maintainers can deliberately run the conversion command and review the resulting binary/state diff.
