# THREEJS-026 — Measured mobile-safe contact grounding result

Status: **accepted** on `threejs-rebuild` after rebasing the cold comparator onto the current six-GLB startup graph.

The authoritative pre-effect comparator remains `CURRENT_POST_GLB_BASELINE` in `THREEJS_PERFORMANCE_BUDGETS.md`. No hard ceiling or production cutover target was raised for this work. PAGES-011 warm-cache evidence was not used as the cold baseline.

## Controlled comparison

Both measurements used the exact fixed representative mobile cold profile: 390×844 viewport, deviceScaleFactor 2, renderer DPR cap 1.5, CPU throttle 4×, 150 ms latency, 1600 kbps download, 750 kbps upload, cache disabled, reduced motion enabled, Playwright 1.55.0 / Chromium 140.0.7339.16 on SwiftShader.

Pre-effect Pages identity:

- Three.js candidate: `71f8398e735f6d2f3a40f70b28773ff19ca6d570`
- deployment generation: `sha256:da19ae11e3df476c66e2ae7d23a74ecc78740acfef969c601021dea51ce8eada`
- measurement run: `32231586141`

Measured post-effect Pages identity:

- Three.js candidate: `b2ead11b752a55477ebfe11ce65e1b0d5e4bfc8e`
- deployment generation: `sha256:c4ce95efbc0a85c9f5eeb4b75d01f0870eac74e4bd3412429ce055a8cf097bf4`
- content identity: `dae9d72f397982dbc550858b8a6dcf301c050af01ec59f5dc97860a1cdaea033`
- measurement run: `32233254521`
- evidence artifact: `threejs026-final-post-grounding-32233254521` / artifact `9358024618`

Between the pre/post candidate SHAs, repository history contains unrelated workflow/docs/tests/release-state commits from parallel Pages work, but GitHub's commit comparison shows the **only changed file under `web/` is `web/app/scene/preview-scene.js`**. Required/optional asset bodies and decoded six-GLB geometry remained byte-identical. This makes the runtime before/after comparison controlled to the grounding presentation change while keeping the same fixed profile.

After the successful measurement, a final temporary Pages probe republished candidate `a9eb831999dbf8a60f846bc958d96fbb010bda63` as generation `sha256:43205bc9758fe3feadacd824e490256188665bf029cfb271439dfff9887adee8`. GitHub comparison from the measured `b2ead11b...` candidate to `a9eb831...` shows **no changes under `web/` at all**: only temporary workflows, Pages qualification state, and the measurement script changed. Therefore the live Three.js runtime being served after that publication is byte-equivalent to the measured grounding runtime for this presentation decision.

## Before / after

| Metric | CURRENT_POST_GLB_BASELINE | Contact grounding | Delta |
| --- | ---: | ---: | ---: |
| Required manifest body | 4,607,929 B | 4,607,929 B | 0 B |
| Startup encoded transfer | 1,565,701 B | 1,566,177 B | **+476 B** |
| Required decoded GLB geometry | 4,542,792 B | 4,542,792 B | 0 B |
| Critical-assets-ready | 9,451.2 ms | 9,574.8 ms | +123.6 ms |
| First interactive | 9,500.9 ms | 9,622.9 ms | +122.0 ms |
| First visible frame | 9,613.4 ms | 9,746.0 ms | +132.6 ms |
| Startup hitch | 112.5 ms | 123.1 ms | **+10.6 ms** |
| Draw calls | 2 | 3 | **+1** |
| Triangles | 8,192 | 8,216 | **+24** |
| GPU geometries | 2 | 3 | **+1** |
| GPU textures | 1 | 1 | 0 |
| GPU programs | 1 | 2 | **+1** |

The post-effect measurement passed every enforced regression ceiling without changing any limit. The existing production cutover gap remains the optional three-table-texture RGBA8 footprint (`50,331,648 B` vs target `16,777,216 B`); THREEJS-026 did not relax or hide it.

## Accepted presentation cue

The retained cue is one low-opacity `CircleGeometry` ellipse (`24` segments) under the preview hero:

- opacity `0.14`
- no fourth light (`extraLightCount: 0`)
- `shadowMap: false`
- no render target
- no texture
- one registry-owned transient geometry
- one registry-owned material variant

THREEJS-025's neutral rig remains exactly three lights: one `HemisphereLight` plus two `DirectionalLight`s. No shadow map, render target, environment map, or additional neutral light is allocated. Shadow-map/render-target/material/shader lifecycle ownership remains with THREEJS-027.

The captured 390×844 mobile frame shows a visible soft contact ellipse directly beneath the hero. It materially removes the floating-object read while remaining visually subordinate to the object and ring. Given the measured +476 encoded bytes, +1 draw call, +24 triangles and +10.6 ms startup-hitch delta, the visual value is strong enough to retain the cue; a heavier shadow technique is not justified here.

## Dispose / recreate proof

Post-effect ready registry counts were `88` total / `59` GPU objects, including `48` geometries and `1` material variant. Direct shell disposal reduced **all tracked counts to zero**, including geometry, material, texture, render-target, shadow-map, shader-variant and material-variant residuals. A second cache-disabled cold reload recreated the exact same `88` / `59` registry counts and renderer counts (`3` geometries, `1` texture, `2` programs), with zero lifecycle delta, zero disposal errors and zero page errors.

Therefore the grounding cue is retained and THREEJS-026 does **not** add real-time shadows. Any later actual shadow map/render target/shader/material variant must remain owned and measured under THREEJS-027.