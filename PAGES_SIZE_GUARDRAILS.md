# GitHub Pages delivery and repository size guardrails

Status: **LOCKED** for the GitHub Pages migration.

The public game URL remains the GitHub Pages URL. Large runtime assets may move to a tested external immutable asset host only when these internal budgets require it; moving assets must never move or replace the public game URL.

## Platform ceilings

Current GitHub documentation establishes these platform constraints:

- Published GitHub Pages site: **1 GiB maximum**.
- Normal Git object/file: GitHub enforces **100 MiB maximum** for a single regular Git object.
- Git LFS **cannot be used with GitHub Pages sites** and is not a Pages delivery mechanism.
- GitHub Pages has a soft bandwidth limit of **100 GB/month**; this is another reason to keep cold-transfer/cache cost intentionally small.

References:

- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage

## Hard internal budgets

These are intentionally far below the platform ceilings and are enforced by `scripts/pages-size-guard.sh` in the actual composite Pages workflow before `upload-pages-artifact`:

| Guard | Hard internal budget | Reason |
| --- | ---: | --- |
| Composite published tree | **128 MiB** | 8x safety margin below the 1 GiB Pages ceiling |
| Root route cold-cache footprint | **64 MiB** | practical transfer/cache envelope |
| `/threejs/` route cold-cache footprint | **64 MiB** | practical transfer/cache envelope |
| Any one published/committed runtime file | **64 MiB** | substantial margin below GitHub's 100 MiB regular-Git limit |
| GitHub repository API-reported size | **512 MiB** | preserve repository health and margin below the Pages source guidance |
| Git LFS pointer in the published tree | **0 allowed** | Pages must receive real files, never LFS pointers |

**Do not raise these constants merely to make a deployment pass.** A budget breach is an architecture signal to use the external immutable-asset strategy below.

## Exact measured baseline

Measurement date: **2026-08-17**.

Inputs used by the successful composite deployment:

- Godot root: `024306d9cf42a20c6d2eac9b8a8db8a2669fc844` (`[flash-ready] publish 56d2a434`).
- Three.js candidate web tree: `084305c39acb61e59ca6e602ccc52e608cc945d9` (subsequent PAGES-007 script/docs commits do not change `web/`).
- Composite raw published tree: **83,929,880 bytes = 80.042 MiB**, **75 files** including the zero-byte `.nojekyll`.
- Root route tree: **49,402,483 bytes = 47.114 MiB**.
- `/threejs/` route tree: **34,527,397 bytes = 32.928 MiB**.
- Largest published file: `index.wasm`, **39,513,091 bytes = 37.683 MiB**.
- GitHub repository API-reported size at measurement: **103,993 KiB = 101.556 MiB**.
- Successful Pages Actions run: `32005312224`.
- Uploaded `github-pages` Actions artifact: artifact id `9279789282`, **37,674,223 bytes = 35.929 MiB** compressed, digest `sha256:322d03b59dcd06f5af68ad9c848491d48f11b8306e1d4aca45a9b04810c219cd`.

The raw tree is the number governed by the published-site and route/cache budgets. The Actions artifact byte count is recorded separately because upload packaging/compression is not the published uncompressed footprint.

## Exact runtime-file inventory

All byte counts below are exact blob sizes for the composite tree above.

| Published path | Bytes | MiB |
| --- | ---: | ---: |
| `.nojekyll` | 0 | 0.000 |
| `index.audio.position.worklet.js` | 2,973 | 0.003 |
| `index.audio.worklet.js` | 7,298 | 0.007 |
| `index.html` | 31,020 | 0.030 |
| `index.js` | 279,815 | 0.267 |
| `index.pck` | 9,541,080 | 9.099 |
| `index.png` | 21,443 | 0.020 |
| `index.wasm` | 39,513,091 | 37.683 |
| `threejs/app/assets/asset-manager.js` | 19,949 | 0.019 |
| `threejs/app/assets/asset-manifest.js` | 7,295 | 0.007 |
| `threejs/app/assets/glb-components.js` | 6,835 | 0.007 |
| `threejs/app/boot/boot.js` | 10,483 | 0.010 |
| `threejs/app/boot/build-marker.js` | 842 | 0.001 |
| `threejs/app/boot/fatal-error.js` | 965 | 0.001 |
| `threejs/app/camera/frame-governor.js` | 14,056 | 0.013 |
| `threejs/app/core/app-url.js` | 3,634 | 0.003 |
| `threejs/app/data/runtime-data.js` | 12,740 | 0.012 |
| `threejs/app/materials/canonical-materials.js` | 8,216 | 0.008 |
| `threejs/app/perf/README.md` | 601 | 0.001 |
| `threejs/app/perf/performance-budgets.js` | 1,456 | 0.001 |
| `threejs/app/perf/startup-marks.js` | 927 | 0.001 |
| `threejs/app/scene/board-and-lid.js` | 5,054 | 0.005 |
| `threejs/app/scene/context-recovery.js` | 3,504 | 0.003 |
| `threejs/app/scene/lighting-rig.js` | 5,473 | 0.005 |
| `threejs/app/scene/neutral-room.js` | 4,849 | 0.005 |
| `threejs/app/scene/piece-layout.js` | 5,347 | 0.005 |
| `threejs/app/scene/pieces.js` | 6,319 | 0.006 |
| `threejs/app/scene/player-bases.js` | 7,788 | 0.007 |
| `threejs/app/scene/preview-scene.js` | 4,970 | 0.005 |
| `threejs/app/scene/renderer.js` | 6,806 | 0.006 |
| `threejs/app/scene/room-layout.js` | 7,880 | 0.008 |
| `threejs/app/scene/table-and-score.js` | 7,178 | 0.007 |
| `threejs/app/scene/table-score-layout.js` | 7,459 | 0.007 |
| `threejs/app/session/canonical-online-session.js` | 2,232 | 0.002 |
| `threejs/assets/kit/layout/intro-scatter.csv` | 2,452 | 0.002 |
| `threejs/assets/kit/layout/world-layout.json` | 2,645 | 0.003 |
| `threejs/assets/kit/reference/approved-contract.json` | 4,167 | 0.004 |
| `threejs/assets/kit/table/table.svg` | 1,057 | 0.001 |
| `threejs/assets/kit/ui/loading-star.svg` | 643 | 0.001 |
| `threejs/assets/models/board-and-lid-layout.json` | 4,477 | 0.004 |
| `threejs/assets/models/board-and-lid.glb` | 2,595,544 | 2.475 |
| `threejs/assets/models/conversion-state.json` | 6,181 | 0.006 |
| `threejs/assets/models/piece-large.glb` | 11,608 | 0.011 |
| `threejs/assets/models/piece-medium.glb` | 11,628 | 0.011 |
| `threejs/assets/models/piece-small.glb` | 6,564 | 0.006 |
| `threejs/assets/models/player-base-layout.json` | 1,673 | 0.002 |
| `threejs/assets/models/player-base.glb` | 1,942,888 | 1.853 |
| `threejs/assets/models/score-marker.glb` | 12,408 | 0.012 |
| `threejs/index.html` | 2,215 | 0.002 |
| `threejs/index.png` | 21,443 | 0.020 |
| `threejs/runtime-assets/layout/intro-scatter.csv` | 2,452 | 0.002 |
| `threejs/runtime-assets/layout/world-layout.json` | 2,645 | 0.003 |
| `threejs/runtime-assets/logos/MTKYF.svg` | 8,652 | 0.008 |
| `threejs/runtime-assets/logos/YAKOLAK.svg` | 5,736 | 0.005 |
| `threejs/runtime-assets/models/board-and-lid.stl` | 3,114,084 | 2.970 |
| `threejs/runtime-assets/models/piece-large.stl` | 12,084 | 0.012 |
| `threejs/runtime-assets/models/piece-medium.stl` | 12,084 | 0.012 |
| `threejs/runtime-assets/models/piece-small.stl` | 5,884 | 0.006 |
| `threejs/runtime-assets/models/player-base.stl` | 9,955,084 | 9.494 |
| `threejs/runtime-assets/models/score-marker.stl` | 12,884 | 0.012 |
| `threejs/runtime-assets/reference/approved-contract.json` | 5,261 | 0.005 |
| `threejs/runtime-assets/room/ROOM.md` | 843 | 0.001 |
| `threejs/runtime-assets/room/room-plan.svg` | 1,117 | 0.001 |
| `threejs/runtime-assets/table/albedo.png` | 5,062,989 | 4.828 |
| `threejs/runtime-assets/table/normal.png` | 5,887,287 | 5.615 |
| `threejs/runtime-assets/table/roughness.png` | 3,532,328 | 3.369 |
| `threejs/runtime-assets/table/table.svg` | 1,057 | 0.001 |
| `threejs/runtime-assets/ui/loading-star.svg` | 643 | 0.001 |
| `threejs/styles/app.css` | 3,064 | 0.003 |
| `threejs/vendor/three/r185/LICENSE` | 1,081 | 0.001 |
| `threejs/vendor/three/r185/addons/loaders/STLLoader.js` | 10,715 | 0.010 |
| `threejs/vendor/three/r185/three.core.js` | 1,443,056 | 1.376 |
| `threejs/vendor/three/r185/three.module.js` | 650,153 | 0.620 |
| `threejs/yakolak-logo.svg` | 5,763 | 0.005 |
| `yakolak-logo.svg` | 5,763 | 0.005 |

## Required external immutable-asset strategy

If a future change approaches or crosses an internal budget, deployment must stay blocked until an explicit external-asset change is reviewed and tested. The acceptable strategy must satisfy **all** of the following:

1. Keep the user-facing game entry URL on GitHub Pages; only large immutable asset bytes may move off Pages.
2. Use HTTPS and content-addressed/versioned object keys (for example a SHA-256 or equivalent immutable hash in the asset path). Never depend on a mutable `latest` object.
3. Publish only public static assets there; no client secret, room credential, API credential, or authoritative state may be embedded in asset URLs or metadata.
4. Serve correct MIME types and `Cache-Control: public, max-age=31536000, immutable` for hashed objects.
5. Configure CORS so the GitHub Pages browser origin can fetch the assets. CORS is transport policy, not authorization.
6. For assets where partial fetching matters, prove HTTP byte-range behavior; for every moved asset prove successful fetch, correct content length/hash, cache behavior, and failure behavior.
7. Pin the application asset manifest to immutable URLs and record provider/object hashes so rollback is only a manifest/source rollback, not an in-place object mutation.
8. Run a browser smoke from the GitHub Pages URL proving first load and cached reload, with no mixed-content/CORS errors and no dependency on Git LFS.
9. Re-measure Pages raw bytes, each route footprint, external cold-transfer bytes, and largest committed file after the move. The internal budgets remain unchanged unless a separate architecture decision explicitly supersedes this contract.

Until such a strategy is tested and recorded, the correct response to a size-budget failure is to reduce/dedupe/compress assets—not to increase the limits.
