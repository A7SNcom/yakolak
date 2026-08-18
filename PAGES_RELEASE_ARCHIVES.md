# PAGES-012 — Immutable exact-byte GitHub Release archives

## Selected known-good pair

PAGES-012 archives the exact bytes from successful `YAKOLAK Composite Pages` run `32030598002`:

- Godot root source SHA: `fbc0d15c574a40c4a9f31c96d42c2f03b424bb39`
- Three.js candidate source SHA: `6b125c04938330e1d6de4621e60a9f9e7757b556`
- successful Pages artifact ID: `9288731607`
- release tag: `pages-archive-2026-08-17-gfbc0d15-t6b125c04`

The exact prepared release-assets bundle is retained as Actions artifact `9291854729`. Its artifact ZIP SHA-256 is `ab23adcee5a8b2b5a4d743e014ba0689e8d3e4a9023957e92934de9dbebdb3c7`, and the promoted `pages-composite.tar` SHA-256 is `799befc38e6dd6a86851bb62337093a1c1c863da68015d08b94f8235677efa9a`.

The release workflow promotes the already-successful Pages `artifact.tar` byte-for-byte as `pages-composite.tar`. It does not rebuild or recompose the deployed site. The separate `godot-root.tar` and `threejs-candidate.tar` archives are deterministic component archives made only from those recovered deployed bytes.

## Publication invariant

A mutable GitHub draft may be staged before the repository-level immutable-release setting can be read, because a draft is not a published immutable release. Publication is still fail-closed: the workflow must independently prove repository release immutability is enabled before changing the draft to published.

A repository secret named `PAGES_RELEASE_ADMIN_TOKEN` may supply a fine-grained token with repository Administration read/write so the workflow can enable the setting when disabled and verify it afterward. The token is never put in a public artifact.

Publication order is strict:

1. recover the retained prepared release-assets bundle and validate its artifact digest;
2. verify every archive SHA-256, immutable fact, source SHA, source run/artifact ID, and content-manifest digest;
3. create or validate the release as a mutable draft only;
4. attach exactly the eight final assets while the release is still a draft;
5. re-download every draft asset and compare it byte-for-byte with the prepared copy, then record additive `draft_staged` evidence;
6. prove repository release immutability is enabled through GitHub's Administration API;
7. publish the already-verified draft exactly once;
8. require GitHub to report `isImmutable=true` and verify the release attestation;
9. re-download every immutable asset, compare it byte-for-byte again, validate `ARCHIVE_SHA256SUMS`, and run GitHub asset verification;
10. prove a non-production restore from the immutable downloaded `pages-composite.tar`, then append `archive_verified` to the additive qualification ledger.

If step 6 cannot prove immutability, the exact-byte draft remains unpublished and no `archive_verified` event is written. Nothing in the immutable assets contains a pending deployment-generation or backend-compatibility state.

## Immutable release assets

The release contains exactly:

- `pages-composite.tar` — the exact `artifact.tar` bytes from the successful Pages deployment source;
- `godot-root.tar` — deterministic archive of the exact deployed root files;
- `threejs-candidate.tar` — deterministic archive of the exact deployed `/threejs/` files, including the deployed public runtime config;
- `ARCHIVE_SHA256SUMS` — SHA-256 for the three deployable archives;
- `IMMUTABLE_FACTS.json` — release tag, release target/source SHAs, source run/artifact IDs, archive digests, and content-manifest digests;
- `GODOT_ROOT_FILES_SHA256` — per-file SHA-256 manifest for the root;
- `THREEJS_FILES_SHA256` — per-file SHA-256 manifest for `/threejs/`;
- `PAGES_COMPOSITE_FILES_SHA256` — per-file SHA-256 manifest for the full composite.

These files are final when the release is published and are never edited afterward.

## Additive qualification ledger

Later qualification lives only in `RELEASE_QUALIFICATION/ledger.jsonl`, keyed by immutable `releaseTag` + `assetSha256`.

- PAGES-012 may append factual `draft_staged` evidence while the release is still unpublished; this is not a qualification state and is never treated as sufficient for rollback/cutover.
- PAGES-012 appends `archive_verified` only after immutable publication, GitHub release/asset verification, SHA verification, and non-production restore proof all succeed.
- PAGES-014 appends `deployment_generation_verified`.
- PAGES-015 appends `backend_compatibility_verified` with the safe Worker/protocol/Turso tuple.
- THREEJS-098/099 must pass `scripts/verify-release-qualification.mjs` for the exact key before using the archive.

Missing evidence is represented by no event. There are no mutable `pending` placeholders inside the release.

## Exact-byte rollback

`.github/workflows/pages-012-rollback.yml` accepts an immutable release tag and the `pages-composite.tar` asset. Before extraction or deployment it requires:

- `isImmutable=true`;
- GitHub release verification;
- GitHub verification of the downloaded archive, checksum manifest, and immutable facts;
- archive SHA-256 equality against both `ARCHIVE_SHA256SUMS` and `IMMUTABLE_FACTS.json`;
- full extracted-content digest equality.

The workflow checks out no source and performs no build. With `deploy_pages=false`, it serves the restored files locally and performs an HTTP smoke test as a non-production/manual proof. With `deploy_pages=true`, the same already-verified extracted bytes are passed directly to the Pages upload/deploy actions.
