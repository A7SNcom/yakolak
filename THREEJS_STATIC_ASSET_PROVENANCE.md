# THREEJS-028 — Static asset provenance lock

Status: **LOCKED** for the current `threejs-rebuild` Pages candidate.

This contract covers packaged fonts, semantic icons/logos, static-asset identity, URL resolution, licensing/provenance admission, and duplicate runtime trees. It intentionally adds **no new runtime asset**.

## 1. Font decision: keep the zero-font-file baseline

PAGES-010 established the deployed Three.js baseline: the browser requested no packaged `woff`, `woff2`, `ttf`, or `otf` files; the candidate declared no `@font-face`; and the UI uses the named/system fallback stack in `web/styles/app.css` (`Inter`, `ui-sans-serif`, `system-ui`, platform fallbacks, `sans-serif`). THREEJS-028 treats that state as intentional, not as a missing migration asset.

Historical font files under repository-root `assets/fonts/` are **not** part of `web/` and are not Pages runtime assets. The portable-kit manifest explicitly excludes `fonts`.

`assets/fonts/THMANYAH_SOURCE.md` preserves a historical Thmanyah Sans source and pinned upstream identity, but the current repository provenance record does not establish an explicit shipping-license grant for the Pages candidate. PAGES-010 also provides no visual/product requirement that justifies adding those bytes. Therefore **Thmanyah Sans is not introduced**.

A self-hosted font may be admitted later only when all of the following are true in the same change:

1. a concrete visual/product need is documented;
2. redistribution/web-embedding license provenance is recorded and reviewed;
3. the exact file has stable content identity;
4. every URL uses the PAGES-003 base resolver;
5. PAGES-010 delivery verification, PAGES-007 size/transfer budgets, and the PAGES-009 public-artifact allowlist are updated for the new file type before it ships.

Mutable font CDNs are not an alternative.

## 2. Current semantic logo/icon inventory

The portable-kit manifest is the canonical source record. The runtime manifest carries the same source Git-blob SHA and byte length, and emits an immutable `?v=<git-blob-sha>` URL.

| Logical asset | Semantic role | Canonical source | Git blob SHA | Bytes | License / provenance class |
|---|---|---|---|---:|---|
| `game.logo` | YAKOLAK product mark | `YAKOLAK_PORTABLE_KIT/assets/logos/YAKOLAK.svg` | `ee3703615cd42c4979a0001f1261014f108c6956` | 5,736 | Project/portable-kit asset; not a third-party dependency in `THIRD_PARTY_NOTICES.md` |
| `company.logo` | MTKYF company mark | `YAKOLAK_PORTABLE_KIT/assets/logos/MTKYF.svg` | `98b4ef63d06cbeb045d72895e6252143a5fce0a4` | 8,652 | Project/portable-kit asset; not a third-party dependency in `THIRD_PARTY_NOTICES.md` |
| `ui.loading-star` | Loading-state symbol | `YAKOLAK_PORTABLE_KIT/assets/ui/loading-star.svg` | `fb9b40a07c184a5c8aefb8c138ccd2c9f98c3eeb` | 643 | Project/portable-kit asset; not a third-party dependency in `THIRD_PARTY_NOTICES.md` |

Historical Lucide SVGs remain outside the Pages candidate:

| Historical asset | Git blob SHA | License | Pages status |
|---|---|---|---|
| `assets/icons/lucide/ellipsis.svg` | `393465307c789361fc48b6367c4140bafa5c73e7` | Lucide Icons v1.27.0, ISC; recorded in the SVG/`THIRD_PARTY_NOTICES.md` | Excluded / not requested |
| `assets/icons/lucide/x.svg` | `782d651e9622a57456daec05503916a784ea1c89` | Lucide Icons v1.27.0, ISC; recorded in the SVG/`THIRD_PARTY_NOTICES.md` | Excluded / not requested |

No historical icon is copied into `web/` merely because it exists in the repository.

## 3. Stable identity and PAGES-003 URL rule

`web/app/assets/asset-manifest.js` is the runtime admission point for portable assets:

- source identity is the canonical Git blob SHA plus byte length;
- runtime identity is `git:<blob-sha>` / `git-blob-sha1:<blob-sha>`;
- `runtimeAssetUrl()` resolves through PAGES-003 `resolveAppUrl()` and appends the immutable content identity;
- no runtime asset URL may be hard-coded to a repository-root path or mutable CDN.

Derived runtime payloads (for example GLBs) keep their own exact runtime identity while preserving their canonical-source relationship.

## 4. One source tree, one generated delivery tree

`YAKOLAK_PORTABLE_KIT/assets/` is the canonical portable source tree. `scripts/prepare-threejs-runtime-assets.mjs` materializes `web/runtime-assets/` as the verified delivery copy; `tests/threejs_asset_runtime_copies_contract.test.mjs` proves the bytes and Git-blob identities match.

THREEJS-028 removes the stale partial `web/assets/kit/` migration copy and the orphan `web/yakolak-logo.svg` duplicate. They were not runtime consumers and must not return. Derived files under `web/assets/models/` remain valid derived runtime payloads, not a second canonical tree.

## 5. Admission gate for any future static asset

Before a new static asset can enter the Pages candidate it must have: a semantic owner/role, authoritative source, license/provenance classification, exact byte identity, a PAGES-003-resolved URL, no mutable CDN dependency, and no duplicate migration/final copy.

If the change introduces a **new public runtime file extension**, it must also update all three real delivery gates in the same change:

- **PAGES-010:** packaged/live delivery verification for that extension;
- **PAGES-007:** `scripts/pages-size-guard.sh` and the applicable transfer/size budget evidence;
- **PAGES-009:** `scripts/pages-public-artifact-scan.sh` / public-artifact allowlist contract.

THREEJS-028 introduces no new runtime asset and no new runtime file extension, so those three extension sets remain unchanged.
