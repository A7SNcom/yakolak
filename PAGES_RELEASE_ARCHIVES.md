# PAGES-012 — Immutable exact-byte GitHub Release archives

## Selected known-good pair

PAGES-012 archives the exact bytes from successful `YAKOLAK Composite Pages` run `32030598002`:

- Godot root source SHA: `fbc0d15c574a40c4a9f31c96d42c2f03b424bb39`
- Three.js candidate source SHA: `6b125c04938330e1d6de4621e60a9f9e7757b556`
- successful Pages artifact ID: `9288731607`
- release tag: `pages-archive-2026-08-17-gfbc0d15-t6b125c04`

The release workflow downloads that already-successful `github-pages` Actions artifact and promotes its inner `artifact.tar` byte-for-byte as `pages-composite.tar`. It does not rebuild or recompose the deployed site. The separate `godot-root.tar` and `threejs-candidate.tar` archives are deterministic component archives made only from those recovered deployed bytes.

## Publication invariant

No release mutation is allowed until the repository-level immutable-release setting is proved enabled through GitHub's immutable-releases Administration API. If the workflow cannot read that setting, it fails before creating a draft. A repository secret named `PAGES_RELEASE_ADMIN_TOKEN` may supply a fine-grained token with repository Administration read/write so the workflow can enable the setting when disabled and verify it afterward. The token is never put in a public artifact.

Publication order is strict:

1. prove release immutability is enabled;
2. recover and validate the exact successful Pages bytes;
3. create all archives, content manifests, `ARCHIVE_SHA256SUMS`, and immutable facts;
4. create a draft release;
5. upload every final asset while the release is still a draft;
6. publish;
7. require GitHub to report `isImmutable=true`;
8. run GitHub release verification and asset verification;
9. re-download every asset, compare it byte-for-byte with the local copy, and validate the archive SHA-256 manifest.

Nothing in the immutable assets contains a pending deployment-generation or backend-compatibility state.

## Immutable release assets

The release contains:

- `pages-composite.tar` — the exact `artifact.tar` bytes from the successful Pages deployment source;
- `godot-root.tar` — deterministic archive of the exact deployed root files;
- `threejs-candidate.tar` — deterministic archive of the exact deployed `/threejs/` files, including the deployed public runtime config;
- `ARCHIVE_SHA256SUMS` — SHA-256 for the three deployable archives;
- `IMMUTABLE_FACTS.json` — release tag, release target/source SHAs, source run/artifact IDs, archive digests, and content-manifest digests;
- per-file SHA-256 manifests for root, Three.js, and the full composite.

These files are final when the release is published and are never edited afterward.

## Additive qualification ledger

Later qualification lives only in `RELEASE_QUALIFICATION/ledger.jsonl`, keyed by immutable `releaseTag` + `assetSha256`.

- PAGES-012 appends `archive_verified`.
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
