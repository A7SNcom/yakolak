# THREEJS-017 — Download, startup, decode and GPU budgets

Status: **locked before visual polish** on `threejs-rebuild`.

This document records the measured pre-polish baseline and the guardrails that later asset, lighting, shadow, cache and cutover tasks must respect. These limits are presentation/delivery constraints only; they never own gameplay authority.

PAGES-004 note: GitHub Pages is now the static frontend target. Vercel Preview/verification observations recorded by THREEJS-017 remain dated historical evidence only; they do not define the current preview lane, verification owner, backend runtime, or cutover contract. Current delivery decisions follow `PAGES_MIGRATION_CONTRACT.md`, and online backend access is separated through `API_ORIGIN`.

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

GitHub Actions run `31974482208`, commit `6eee44e0996df83d564e73f4bcf59b239500bc43` revalidated the current candidate after THREEJS-016:

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
| Boot module starts | 11,689.5 ms |
| Boot-critical ready | 12,120.2 ms |
| All critical assets ready | 78,338.2 ms |
| First interactive shell | 78,381.7 ms |
| First visible WebGL frame | 78,508.8 ms |
| Current placeholder draw calls | 2 |
| Current placeholder triangles | 8,192 |
| Current GPU geometry objects | 2 |
| Current GPU textures | 1 |
| Current shader programs | 2 |

`bootStart` is measured from navigation start, not process start. Because `boot.js` has static imports, the mark occurs only after the browser has downloaded/evaluated the entry module graph; that module-loading delay is intentionally visible rather than subtracted away.

### What the baseline means

The current placeholder frame is cheap. The dominant problem is the pre-render asset path: the browser transfers about 13.14 MB of required portable assets and decodes the required STL files to about 18.88 MB of BufferGeometry before exposing the shell. The optional three 2048×2048 table maps would consume 48 MiB if decoded as RGBA8, so they remain presentation-only and must never become a blocking startup dependency.

THREEJS-016 has committed deterministic GLB maintenance outputs, but they are not yet in the startup request graph: current browser verification still requests the canonical runtime STL copies. The baseline therefore measures the actual current load path rather than counting repository files the browser does not request. Revalidation after THREEJS-016 produced zero payload/decode/GPU delta; timing differences from the prior baseline were only hosted-runner jitter.

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

Deterministic transfer/decode ceilings and the throttled browser timing/GPU ceilings are repository/GitHub Actions verification gates using the fixed mobile profile. They are not tied to a Vercel deployment lifecycle.

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
- `THREEJS-097` caching/headers: may improve repeat visits but cannot be used to disguise an oversized cold load; cold-cache gates remain authoritative for these budgets. Delivery/header decisions must follow the Pages-era contract rather than historical Vercel behavior.
- `THREEJS-098/099`: must enforce the cutover targets on the accepted final Pages candidate before explicit cutover.

## Measurement rules

1. Do not compare timing numbers from a different viewport/network/CPU profile as if they were equivalent.
2. Cold-cache startup is the guardrail. Warm-cache wins are useful but do not replace it.
3. `PerformanceResourceTiming.encodedBodySize` is used for browser startup transfer; manifest source byte sizes are separately verified for deterministic payload accounting.
4. Required STL decoded geometry counts actual loaded BufferGeometry attribute/index backing arrays without double-counting shared ArrayBuffers.
5. Optional PNG decode cost is an RGBA8 footprint estimate (`width × height × 4`) and is intentionally independent of compressed PNG file size.
6. Renderer frame counters come from the single renderer owner (`renderer.info`); rendering/UI code may not create a second renderer to evade the counters.
7. A later optimization may lower a ceiling. Raising a ceiling requires an explicit migration decision, rationale and a new measured baseline; it must never be an automatic response to a failing gate.

## Historical/current verification interpretation

- GitHub Actions run `31974482208` passed the full desktop/mobile shell verification and every THREEJS-017 regression ceiling on runtime commit `6eee44e0996df83d564e73f4bcf59b239500bc43`.
- The Vercel Preview recorded for that same runtime commit passed the then-current deterministic contract and remained non-Production. After PAGES-004 this is **historical evidence only**; it is not the canonical preview/deployment path and does not constrain backend hosting.
- Future equivalent verification must evaluate the GitHub Pages candidate and, where online behavior is involved, the selected `API_ORIGIN` boundary.
- This documentation amendment changes no runtime asset, module, renderer or budget value; it changes only deployment/verification ownership semantics.

See `PAGES_MIGRATION_CONTRACT.md` for deployment precedence.

## CURRENT_POST_GLB_BASELINE — THREEJS-026 — 2026-08-19

This is the authoritative cold comparator for THREEJS-026 contact-depth/shadow work. It rebases performance evidence onto the **current six-GLB startup request graph**; the THREEJS-017 STL numbers above remain historical evidence and must not be used as though the startup payload/decode graph were unchanged.

The measurement used the fixed representative mobile cold profile above, Playwright `1.55.0` / Chromium `140.0.7339.16` (build `1187`), browser cache disabled, and exact live GitHub Pages identity:

- Three.js candidate: `71f8398e735f6d2f3a40f70b28773ff19ca6d570`
- deployment generation: `sha256:da19ae11e3df476c66e2ae7d23a74ecc78740acfef969c601021dea51ce8eada`
- Godot root: `f6e94859095cec0a80e71321265e98a9ea68b347`
- public runtime/protocol hash: `9e2da127e26b3bb337633ad7d6901bd74304c4d4f49086f07d34508e8d9fd84b`
- Pages content identity: `c5a0a3ccef1639023fdf08fef6ef7a1d68cb8b5076085a8cec5e26da434747fe`
- GitHub Actions measurement run: `32231586141`

| Metric | CURRENT_POST_GLB_BASELINE |
| --- | ---: |
| Required manifest body | 4,607,929 B |
| Startup encoded transfer through first interactive | **1,565,701 B** |
| Required decoded GLB geometry | **4,542,792 B** |
| Critical-assets-ready | **9,451.2 ms** |
| First interactive | **9,500.9 ms** |
| First visible frame | **9,613.4 ms** |
| Startup hitch (`firstVisibleFrame - firstInteractive`) | **112.5 ms** |
| Draw calls | **2** |
| Triangles | **8,192** |
| GPU geometries | **2** |
| GPU textures | **1** |
| GPU programs | **1** |

The six required GLBs decoded to: board/lid `2,573,088 B`, player base `1,933,632 B`, small piece `5,016 B`, medium piece `10,080 B`, large piece `10,080 B`, score marker `10,896 B`.

### Dispose/recreate resource proof

The same measurement directly disposed the ready shell, then recreated it through a second cache-disabled cold reload while pinning the same Pages candidate identity.

| Resource count | Before dispose | After dispose | After recreate |
| --- | ---: | ---: | ---: |
| Registry total | 86 | **0** | 86 |
| Registry GPU objects | 57 | **0** | 57 |
| Registry geometries | 47 | **0** | 47 |
| Registry materials | 9 | **0** | 9 |
| Registry textures | 0 | **0** | 0 |
| Registry render targets | 0 | **0** | 0 |
| Registry shadow maps | 0 | **0** | 0 |
| Shader variants | 0 | **0** | 0 |
| Material variants | 0 | **0** | 0 |
| Renderer GPU geometries | 2 | n/a | 2 |
| Renderer GPU textures | 1 | n/a | 1 |
| Renderer GPU programs | 1 | n/a | 1 |

Dispose residuals were all zero, recreate deltas were all zero, and no disposal/page errors were emitted. The current enforced regression ceilings passed without modification. The existing production cutover targets remain unchanged; the optional three-table-texture RGBA8 footprint is still `50,331,648 B`, so its stronger `16,777,216 B` cutover target remains an existing gap rather than being relaxed.

PAGES-011 warm-cache evidence remains useful **cache evidence only**. It is not this cold baseline and must not replace it for THREEJS-026 before/after comparisons.
