# PAGES-015 exact Pages source recovery

This file documents recovery evidence only. It does **not** confer release or backend eligibility.

## Why recovery exists

The original successful GitHub Pages artifacts for the locked PAGES-015 active and previous frontend window expired from Actions retention:

- active original run `32110008705`, artifact `9314508471`
- previous original run `32108243496`, artifact `9313917543`

PAGES-015 must still qualify the exact historical bytes. Rebuilding something merely equivalent is forbidden.

## Exact-byte recovery contract

`actions/upload-pages-artifact@v4` created the original `artifact.tar` from the composed Pages directory. During the PAGES-015 investigation, the still-available exact local copies were used only to extract a compact historical tar-layout oracle: entry order, type, mode, mtime, size and `runner/runner` tar ownership. Those text manifests are version controlled at:

- `PAGES015_TAR_LAYOUT/active.json`
- `PAGES015_TAR_LAYOUT/previous.json`

The actual file bytes are **not** reconstructed from that metadata. They are taken from the already-locked immutable Git source SHAs:

- Godot root `eeb3b8e15ded95c4343aed303f781b533c2e13a0`
- active Three.js candidate `4e4e5dec72ee71a06940c6db561dde8d24abd2d0`
- previous Three.js candidate `5cc89e05653b6461ed6a41332f374eaadb360945`

`scripts/pages015-recover-expired-source.sh` re-runs the exact Pages composition/runtime-config/deployment-manifest contract, checks the locked generation/runtime/content identities, then emits the GNU tar header stream from the historical layout. The result is accepted **only** when the final tar SHA-256 equals the original locked Pages artifact digest.

## Proven recovery

GitHub Actions run `32136096713` independently reconstructed both expired sources and required exact SHA equality before uploading preserved artifacts with 90-day retention:

| Role | Recovered Actions artifact | Exact `artifact.tar` SHA-256 |
| --- | ---: | --- |
| active | `9324028185` | `3bb476e2ee76f372b9b945d160f6f1e9faad865eaacd9baef2b1384bd434fa5f` |
| previous | `9324029202` | `6769843ee45a807cffe8af8c8450e0afd7d08c45270e66512f1ad52462dfb560` |

`PAGES015_RECOVERED_SOURCES.json` records those artifact IDs, Actions ZIP digests, original run/artifact identities and layout digests. Its `qualificationEvidence` field is `false`.

## Durable resolution order

`scripts/pages015-resolve-exact-pages-source.sh` uses this fail-closed order:

1. original Pages artifact, if still retained and its tar SHA matches;
2. preserved recovered Actions artifact, after artifact metadata, ZIP digest, provenance and tar SHA all match;
3. deterministic reconstruction from locked Git SHAs + historical tar layout, accepted only on the same original tar SHA.

If an earlier available source exists but fails its expected digest, resolution stops instead of silently falling through to another source.

`scripts/pages015-install-source-recovery-gh-shim.sh` bridges the historical immutable archive helper to this resolver only for the original Pages artifact listing/download calls. All release creation, immutable-release Administration API, release verification, asset attestation and ledger operations continue to use the real GitHub CLI unchanged.

Archive diagnostic run `32136510727` proved the bridge works after the original Actions artifacts expired: active again reached `exact-draft-verified`, while previous cleanly reached `waiting-admin-to-create-draft`. No strong qualification event was written.

## Eligibility boundary

Recovered exact source bytes are inputs to archive publication; they are **not** an immutable release themselves and cannot satisfy `archive_verified`, `deployment_generation_verified`, or `backend_compatibility_verified`.

The immutable frontend release still requires the Admin-controlled publication/attestation/restore proof, and final PAGES-015 eligibility still requires the live Cloudflare Worker/Turso/browser-CORS compatibility window.
