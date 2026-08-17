# THREEJS-025 — Minimal lighting contract and measured mobile cost

Status: **LOCKED for later visual tasks unless a later task explicitly re-measures and proves a cheaper/equivalent result.**

## Authority

The runtime lighting starts from `approved-contract.json -> materials.lightingReferenceOnly.normalizedRatios`:

- hemisphere: `0.62`
- key: `1.15`
- fill: `0.28`
- rim: `0.38`

These are visual ratios only. No Godot light intensity/unit is copied into the Three.js runtime.

The frozen THREEJS-001 Production screenshots are the visual comparison source:

- `production-320x568.png` — SHA-256 `4518eaf4416416cf23200813c78628c46f38b260ad4010d4903c62be0bfbdf37`
- `production-390x844.png` — SHA-256 `a46f7180068b13c62eef158c5eb4b5b898a7c27f8e72d8c4716542e352923561`
- `production-1440x900.png` — SHA-256 `dba7b25c571b49c609594fcbcdbd0aa423a084ca11f91ef405a42e193ae9baab`

Those frozen captures are dark entry/loading references (roughly 94–98% near-black pixels), while the definitive material/room contract requires a near-white neutral room. Therefore THREEJS-025 uses the screenshots' **foreground contrast character**, not their absolute black-background luminance, as the tuning signal. Absolute scene lightness remains owned by the canonical neutral palette.

## Locked neutral rig

The smallest accepted neutral rig is exactly three lights:

1. one `HemisphereLight`, with the portable fill ratio folded into it;
2. one `DirectionalLight` key;
3. one `DirectionalLight` rim.

Normalized to the key and tuned against the frozen baseline contrast, the current Three.js intensities are:

- hemisphere + fill: `1.0173913043478262`
- key: `1.3`
- rim: `0.42956521739130443`

The common baseline-tuned scale is `1.3`. Shadows are **off** and `scene.environment`/environment maps are **absent** in this task. Adding either belongs to THREEJS-026 and must be measured against the numbers below before being kept.

Turn emphasis is a separate presentation layer. It adds **zero lights**, does not mutate neutral-light intensity, and uses the canonical non-color cues `seat-ring` + `turn-label`.

## Baseline contrast verification

Successful Chromium run: GitHub Actions `31994592220`, commit `1901e48b1fb2402470a05f2283cd81114f9c6b02`.

Frozen-baseline foreground/content standard deviation:

- 320×568: `0.14796026700784404`
- 390×844: `0.1623135111304554`
- 1440×900: `0.0886900106989366`

Derived accepted contrast envelope: `0.13316424030705964 .. 0.2840486444782969`.

The neutral Three.js candidate measured:

- content mean luminance: `0.4543579691432724`
- content standard deviation: `0.19992487820908872`
- black clipping fraction: `0`
- white clipping fraction: `0`

This is inside the baseline-derived contrast envelope without reproducing the old dark entry background.

## All canonical cameras

All **16/16** canonical camera poses were rendered against all four canonical player materials in the successful run.

Across the complete camera set:

- minimum sampled material luminance: `0.16794666666666666`
- maximum sampled material luminance: `0.8033396078431372`
- minimum RGB pair distance between any two canonical player materials: `0.20248361793608763`

The camera verifier requires every pose to stay away from black/white clipping and retain a pairwise color distance above its readability floor. All 16 passed.

## Representative mobile cost before shadows / environment maps

Measurement profile used by the dedicated lighting probe:

- viewport: `390×844`
- device scale factor: `2`
- reduced motion: on
- Chromium / ANGLE SwiftShader in GitHub Actions
- 20 warm-up renders followed by **80 synchronized measured frames** (`gl.finish()` per frame)

Successful run `31994592220` measured:

| Metric | THREEJS-025 neutral rig |
|---|---:|
| Median synchronized frame | `0.10000000000582077 ms` |
| p95 synchronized frame | `0.4000000000014552 ms` |
| Max synchronized frame | `3.1999999999970896 ms` |
| Draw calls | `4` |
| Triangles | `2880` |
| Shader programs | `1` |
| Geometries | `1` |
| Renderer-reported textures | `1` |
| User/material texture maps | `0` |
| Neutral lights | `3` |
| Shadows | `false` |
| Environment map | `false` |

`renderer.info.memory.textures = 1` is recorded rather than hidden, but the probe separately inspects the player materials and proves **zero user/material texture maps** and no scene environment map. Later tasks must compare the same user-owned resources and render/GPU metrics rather than assuming the renderer's internal texture count is application content.

These timings are a deterministic CI comparison probe, not a claim about physical-phone GPU milliseconds. Their purpose is to give THREEJS-026 a before/after guardrail on the same renderer/profile.

## Guardrails for THREEJS-026 and later polish

- Do not add a fourth neutral light merely to improve one camera; all 16 are currently readable.
- Do not fold turn emphasis into neutral-light intensity or add a per-turn light.
- Do not add an environment map without an explicit before/after measurement against this file.
- Shadows/contact depth must justify their measured portrait-mobile cost; remove them if the visual value does not justify the increase.
- Do not relax the independent THREEJS-017 transfer/GPU/startup budgets.
- The open `SRC-012` table/game contact contradiction is unaffected; lighting must not hide or resolve it through spatial offsets.
