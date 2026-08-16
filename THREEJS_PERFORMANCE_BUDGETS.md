# THREEJS-017 — Download, startup, decode and GPU budgets

Status: **locked before visual polish** on `threejs-rebuild`.

This document records the measured pre-polish baseline and the guardrails that later asset, lighting, shadow, cache and cutover tasks must respect. These limits are presentation/delivery constraints only; they never own gameplay authority.

## Fixed representative mobile profile

All comparable startup timing measurements use the same cold profile:

- viewport: `390 × 844`
- device scale factor: `2`
- renderer DPR cap: `1.5` (therefore the measured drawing buffer is `585 × 1266`)
- CPU throttling: `4×`
- latency: `150 ms`
- download: `1600 kbps`
- upload: `750 kbps`
- browser cache disabled
- headless Chromium / SwiftShader in GitHub Actions
- reduced motion enabled so animation does not add timing noise

The canonical values live in `web/app/perf/performance-budgets.js`; the browser probe lives in `scripts/measure-threejs-performance.mjs`.

## Measured baseline — 2026-08-16

GitHub Actions run `31973050538`, commit `d64c95507e3e9e09ca7d14482388c56c68d7b464` measured:

| Metric | Baseline |
| --- | ---: |
| Boot-critical asset body | 23,780 B |
| Scene-critical asset body | 13,115,613 B |
| Required asset body total | 13,139,393 B / 12.531 MiB |
| Optional asset body total | 14,483,721 B / 13.813 MiB |
| All manifest asset bodies | 27,623,114 B / 26.343 MiB |
| Startup encoded bytes through first interactive | 15,313,804 B / 14.604 MiB |
| Required decoded STL geometry | 18,880,704 B / 18.006 MiB |
| Optional decoded table textures (RGBA8 estimate) | 50,331,648 B / 48.000 MiB |
| Boot module starts | 11,676.3 ms |
| Boot-critical ready | 12,105.8 ms |
| All critical assets ready | 78,393.8 ms |
| First interactive shell | 78,444.1 ms |
| First visible WebGL frame | 78,578.9 ms |
| Current placeholder draw calls | 2 |
| Current placeholder triangles | 8,192 |
| Current GPU geometry objects | 2 |
| Current GPU textures | 1 |
| Current shader programs | 2 |

`bootStart` is measured from navigation start, not process start. Because `boot.js` has static imports, the mark occurs only after the browser has downloaded/evaluated the entry module graph; that module-loading delay is intentionally visible rather than subtracted away.

### What the baseline means

The current placeholder frame is cheap. The dominant problem is the pre-render asset path: the browser transfers about 13.14 MB of required portable assets and decodes the required STL files to about 18.88 MB of BufferGeometry before exposing the shell. The optional three 2048×2048 table maps would consume 48 MiB if decoded as RGBA8, so they remain presentation-only and must never become a blocking startup dependency.

This is a deliberately honest baseline, not an acceptance claim. `THREEJS-018` through `THREEJS-021` are expected to improve the asset path while preserving canonical geometry/layout semantics.

## Enforced regression ceilings now

These are hard gates. Later tasks may reduce them but must not raise them merely to make a regression pass.

| Metric | Hard ceiling |
| --- | ---: |
| Required asset body | 13,500,000 B |
| Optional asset body | 14,600,000 B |
| All asset bodies | 28,000,000 B |
| Startup encoded bytes | 16,000,000 B |
| Required decoded geometry | 19,000,000 B |
| Optional decoded texture RGBA8 | 50,331,648 B |
| Critical-assets-ready | 90,000 ms |
| First interactive | 90,000 ms |
| First visible frame | 90,500 ms |
| Draw calls | 64 |
| Triangles | 1,000,000 |
| GPU geometries | 16 |
| GPU textures | 8 |
| GPU programs | 12 |

Deterministic transfer/decode ceilings run in Vercel's normal verification gate. The throttled browser timing/GPU ceilings run in GitHub Actions with the fixed mobile profile.

## Production cutover targets

These are stronger than the temporary regression ceilings and must be met before `THREEJS-098/099` can treat the rewrite as release-ready:

| Metric | Cutover target |
| --- | ---: |
| Required asset body | ≤ 8,000,000 B |
| Startup encoded bytes | ≤ 9,000,000 B |
| Required decoded geometry | ≤ 16,000,000 B |
| Optional decoded texture RGBA8 | ≤ 16,777,216 B |
| Critical-assets-ready | ≤ 50,000 ms |
| First interactive | ≤ 50,000 ms |
| First visible frame | ≤ 50,500 ms |
| Draw calls | ≤ 64 |
| Triangles | ≤ 900,000 |

The timing targets intentionally use the same slow mobile profile. They are not desktop/LAN targets.

## Ownership for later tasks

- `THREEJS-018` board/lid: may reduce transfer/geometry cost, must remain within geometry/triangle budgets and may not hide spatial offsets.
- `THREEJS-019` bases: must share geometry; four instances must not multiply downloaded geometry or create per-seat geometry copies.
- `THREEJS-020` pieces: 36 pieces must use shared geometry/material resources; stable logical identities must not require 36 geometry uploads.
- `THREEJS-021` table/score: optional texture maps must remain non-blocking; downscaling/compression should drive decoded texture cost toward the cutover target.
- `THREEJS-025/026` lighting/shadows: must stay inside draw-call/program/triangle ceilings; visual polish cannot silently add an unbounded pass count.
- `THREEJS-097` caching/headers: may improve repeat visits but cannot be used to disguise an oversized cold load; cold-cache gates remain authoritative for these budgets.
- `THREEJS-098/099`: must enforce the cutover targets on the final candidate before Production cutover.

## Measurement rules

1. Do not compare timing numbers from a different viewport/network/CPU profile as if they were equivalent.
2. Cold-cache startup is the guardrail. Warm-cache wins are useful but do not replace it.
3. `PerformanceResourceTiming.encodedBodySize` is used for browser startup transfer; manifest source byte sizes are separately verified for deterministic payload accounting.
4. Required STL decoded geometry counts actual loaded BufferGeometry attribute/index backing arrays without double-counting shared ArrayBuffers.
5. Optional PNG decode cost is an RGBA8 footprint estimate (`width × height × 4`) and is intentionally independent of compressed PNG file size.
6. Renderer frame counters come from the single renderer owner (`renderer.info`); rendering/UI code may not create a second renderer to evade the counters.
7. A later optimization may lower a ceiling. Raising a ceiling requires an explicit migration decision, rationale and a new measured baseline; it must never be an automatic response to a failing gate.
