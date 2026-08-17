# PAGES-010 — Actual deployed GitHub Pages file and cache behavior

Status: **VERIFIED**

Date: 2026-08-17

Target: `https://a7sncom.github.io/yakolak/threejs/`

This report records the behavior observed from the real composite GitHub Pages artifact. It is evidence for PAGES-011 and THREEJS-097; it is not a request for custom Pages headers, rewrites, or MIME overrides.

## Evidence and sequencing

- Composite Pages run `32030598002` deployed the real root-Godot + `/threejs/` artifact successfully.
- Its post-deploy HTTP smoke passed for the root, `/threejs/`, and `/threejs/runtime-config.json` with Three.js candidate `6b125c04938330e1d6de4621e60a9f9e7757b556`.
- Stable file/header measurements came from PAGES-010 live probe run `32030777642` immediately after that deployment.
- Follow-up import/cache/404 measurements came from run `32030874003`.
- A probe that began before the composite deploy was available saw `404` for both `/threejs/` and `runtime-config.json`. Therefore verification must be sequenced after a successful Pages deployment and may poll for readiness; a branch push alone is not proof that the public artifact is live.

## Actual runtime formats

The current runtime-ready manifest resolves to these payload extensions:

`csv, glb, json, md, png, svg`

Current image formats are exactly `png` and `svg`. The runtime manifest references no audio format. The web source declares no packaged font file (`woff`, `woff2`, `ttf`, `otf`) and no `@font-face`; CSS uses named/system fallback fonts only, so there is no font asset request to test today.

## Stable deployed GET/HEAD and MIME observations

All rows below returned `GET 200` and `HEAD 200`.

| Deployed resource | Content-Type | Cache-Control | Last-Modified | Accept-Ranges |
| --- | --- | --- | --- | --- |
| `/threejs/` index HTML | `text/html; charset=utf-8` | `max-age=600` | `Mon, 17 Aug 2026 12:36:12 GMT` | `bytes` |
| `app/boot/boot.js` | `application/javascript; charset=utf-8` | `max-age=600` | same | `bytes` |
| `styles/app.css` | `text/css; charset=utf-8` | `max-age=600` | same | `bytes` |
| `runtime-config.json` | `application/json; charset=utf-8` | `max-age=600` | same | `bytes` |
| all six deployed `.glb` model payloads | `model/gltf-binary` | `max-age=600` | same | `bytes` |
| `runtime-assets/logos/YAKOLAK.svg` | `image/svg+xml` | `max-age=600` | same | `bytes` |
| `runtime-assets/table/table.svg` | `image/svg+xml` | `max-age=600` | same | `bytes` |
| `runtime-assets/table/albedo.png` | `image/png` | `max-age=600` | same | `bytes` |
| `runtime-assets/layout/world-layout.json` | `application/json; charset=utf-8` | `max-age=600` | same | `bytes` |
| `runtime-assets/layout/intro-scatter.csv` | `text/csv; charset=utf-8` | `max-age=600` | same | `bytes` |
| `runtime-assets/room/ROOM.md` | `text/markdown; charset=utf-8` | `max-age=600` | same | `bytes` |

The six actual GLB payloads verified were `board-and-lid.glb`, `player-base.glb`, `piece-small.glb`, `piece-medium.glb`, `piece-large.glb`, and `score-marker.glb`. GET and HEAD content lengths matched for every measured resource.

GitHub Pages also supplied an `ETag` for every successful measured resource. The representative module had:

- `Cache-Control: max-age=600`
- `ETag: "6a83003c-28f3"`
- `Last-Modified: Mon, 17 Aug 2026 12:36:12 GMT`
- `If-None-Match` revalidation -> `304`
- `If-Modified-Since` revalidation -> `304`

These are observations, not a repository-controlled header contract. Client/cache logic must tolerate validators changing or being absent on a future Pages response.

## Imports and refresh behavior

- `20` distinct local/import-map module targets discovered from the current `web/app` module graph resolved in source and returned deployed HTTP `200` under `/threejs/`.
- Adding a harmless query string to `app/boot/boot.js` returned `200` with bytes identical to the unqueried module.
- Adding a URL fragment returned the same bytes; fragments are client-side and are not sent to the HTTP server, so a hash must never be treated as a cache-busting mechanism.
- Runtime manifest payloads already use content-addressed query values such as `?v=<git-blob-sha>`; PAGES-011 should treat that as the explicit immutable-identity mechanism rather than assuming Pages can be given immutable custom response headers.

## 404 behavior

A deliberately missing JavaScript path returned:

- `GET 404`
- `HEAD 404`
- `Content-Type: text/html; charset=utf-8`
- no observed `Cache-Control`
- an `ETag` was present
- no observed `Last-Modified`

There is no SPA rewrite contract. Missing paths must remain missing; runtime code must not depend on Pages rewriting them to an index document.

## Byte-range behavior

The current runtime asset loader does **not** request HTTP byte ranges. It calls ordinary `fetch(asset.runtime.url, { credentials: 'same-origin', cache: 'default' })` and consumes the full response stream before integrity verification and decode.

`glb-components.js` contains a helper named `requireRange`, but that helper only validates offsets and lengths inside the already-downloaded `Uint8Array`; it is not an HTTP `Range` request.

Although successful Pages responses currently advertise `Accept-Ranges: bytes`, PAGES-010 intentionally issued no synthetic byte-range matrix because no current YAKOLAK loader requests one. Do not depend on byte-range support unless a future real loader introduces that requirement and it is tested then.

## Contract carried into PAGES-011 / THREEJS-097

1. Preserve the observed correct Pages MIME delivery; do not introduce or require custom MIME overrides.
2. Do not require custom `Cache-Control` values. The measured service value is `max-age=600`, including for unversioned HTML/module/CSS/runtime-config and content-addressed assets.
3. Treat `ETag` and `Last-Modified` as useful observed validators, not immutable API contracts.
4. Content-address runtime payload URLs with the existing Git blob query key. A URL fragment is not a refresh mechanism.
5. Keep relative/import-map URLs valid under the `/yakolak/threejs/` subpath; do not assume root-relative deployment.
6. Preserve real `404` behavior; do not depend on rewrites GitHub Pages does not provide.
7. Do not add HTTP Range assumptions while the real loader performs full GETs.
8. Post-deploy verification must wait for the successful Pages deployment/readiness signal before judging the public path.
