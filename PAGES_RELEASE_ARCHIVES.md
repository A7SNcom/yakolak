# PAGES-012 — Historical immutable exact-byte GitHub Release archive evidence

> **Retired execution path:** `.github/workflows/pages-012-immutable-release.yml` is now a read-only, manual-only historical placeholder. Do not use it to publish or retry releases. Current locked active+previous archive publication/verification must use `.github/workflows/pages-015-window-archive.yml` through the PAGES-015 Admin-gated path. Verified exact-byte restore/rollback remains in `.github/workflows/pages-012-rollback.yml`.

## Selected historical known-good pair

The original PAGES-012 archive design targeted the exact bytes from successful `YAKOLAK Composite Pages` run `32030598002`:

- Godot root source SHA: `fbc0d15c574a40c4a9f31c96d42c2f03b424bb39`
- Three.js candidate SHA: `6b125c04938330e1d6de4621e60a9f9e7757b556`
- successful Pages artifact ID: `9288731607`
- release tag: `pages-archive-2026-08-17-gfbc0d15-t6b125c04`

The exact prepared release-assets bundle was retained as Actions artifact `9291854729`. Its artifact ZIP SHA-256 is `ab23adcee5a8b2b5a4d743e014ba0689e8d3e4a9023957e92934de9dbebdb3c7`, and the promoted `pages-composite.tar` SHA-256 is `799befc38e6dd6a86851bb62337093a1c1c863da68015d08b94f8235677efa9a`.

The historical release workflow promoted the already-successful Pages `artifact.tar` byte-for-byte as `pages-composite.tar`; it did not rebuild or recompose the deployed site. The separate `godot-root.tar` and `threejs-candidate.tar` archives were deterministic component archives made only from those recovered deployed bytes.

## Historical publication invariant

The retired implementation required a mutable GitHub draft to be staged before publication and required repository release immutability to be independently proven before changing the draft to published.

A repository secret named `PAGES_RELEASE_ADMIN_TOKEN` was used by that historical implementation when Administration read/write was required. The current retired PAGES-012 workflow must never read that secret or mutate Releases.

The historical publication order was:

1. require `PAGES_RELEASE_ADMIN_TOKEN` before archive recovery or release mutation;
2. recover the retained prepared release-assets bundle and validate its artifact digest;
3. verify every archive SHA-256, immutable fact, source SHA, source run/artifact ID, and content-manifest digest;
4. create or validate the release as a mutable draft only;
5. attach exactly the eight final assets while the release was still a draft;
6. re-download every draft asset and compare it byte-for-byte with the prepared copy, then record additive `draft_staged` evidence;
7. prove repository release immutability through GitHub's Administration API;
8. publish the already-verified draft exactly once;
9. require GitHub to report `isImmutable=true` and verify the release attestation;
10. re-download every immutable asset, compare it byte-for-byte again, validate `ARCHIVE_SHA256SUMS`, and run GitHub asset verification;
11. prove a non-production restore from the immutable downloaded `pages-composite.tar`, then append `archive_verified` to the additive qualification ledger.

Those steps are retained here only to document the provenance and semantics of historical PAGES-012 evidence. **They are not an operational retry procedure.**

## Current operational path

Do not re-run the retired PAGES-012 publication workflow to test credentials or attempt publication. It is intentionally incapable of release or ledger mutation.

For the current PAGES-015 active+previous archive window:

- use `.github/workflows/pages-015-window-archive.yml` or the authoritative PAGES-015 orchestrator path;
- require `PAGES_RELEASE_ADMIN_TOKEN` before immutable publication;
- keep all archive/ledger mutation serialized by `pages-release-qualification-ledger`;
- never edit or re-upload a published immutable release;
- append later deployment-generation and backend-compatibility evidence only to `RELEASE_QUALIFICATION/ledger.jsonl`.

If the Administration credential is absent, current PAGES-015 archive state remains unqualified and publication is skipped. A staged draft is not archive qualification.

## Historical immutable release assets

The historical release design contained exactly:

- `pages-composite.tar` — the exact `artifact.tar` bytes from the successful Pages deployment source;
- `godot-root.tar` — deterministic archive of the exact deployed root files;
- `threejs-candidate.tar` — deterministic archive of the exact deployed `/threejs/` files, including the deployed public runtime config;
- `ARCHIVE_SHA256SUMS` — SHA-256 for the three deployable archives;
- `IMMUTABLE_FACTS.json` — release tag, release target/source SHAs, source run/artifact IDs, archive digests, and content-manifest digests;
- `GODOT_ROOT_FILES_SHA256` — per-file SHA-256 manifest for the root;
- `THREEJS_FILES_SHA256` — per-file SHA-256 manifest for `/threejs/`;
- `PAGES_COMPOSITE_FILES_SHA256` — per-file SHA-256 manifest for the full composite.

Published immutable release files are final and are never edited afterward.

## Additive qualification ledger

Later qualification lives only in `RELEASE_QUALIFICATION/ledger.jsonl`, keyed by immutable `releaseTag` + `assetSha256`.

- historical PAGES-012 runs may already have recorded factual `draft_staged` or `archive_verified` evidence for their historical archive keys;
- the retired PAGES-012 workflow cannot append new ledger events;
- current locked-window archive verification is owned by the PAGES-015 archive/orchestrator path;
- PAGES-014 appends `deployment_generation_verified`;
- PAGES-015 appends `backend_compatibility_verified` with the safe Worker/protocol/Turso tuple;
- THREEJS-098/099 must pass `scripts/verify-release-qualification.mjs` and the current-lock verifier for the exact current window before using an archive.

Missing evidence is represented by no event. There are no mutable `pending` placeholders inside immutable releases.

## Exact-byte rollback

`.github/workflows/pages-012-rollback.yml` remains the live PAGES-012 component. It accepts an immutable release tag and the `pages-composite.tar` asset. Before extraction or deployment it requires:

- `isImmutable=true`;
- GitHub release verification;
- GitHub verification of the downloaded archive, checksum manifest, and immutable facts;
- archive SHA-256 equality against both `ARCHIVE_SHA256SUMS` and `IMMUTABLE_FACTS.json`;
- full extracted-content digest equality.

The workflow checks out no source and performs no build for the restored bytes. With `deploy_pages=false`, it serves the restored files locally and performs an HTTP smoke test as a non-production/manual proof. With `deploy_pages=true`, the same already-verified extracted bytes are additionally gated by the current PAGES-015 active+previous compatibility window, strict release qualification and current Worker lock before public Pages deployment.
