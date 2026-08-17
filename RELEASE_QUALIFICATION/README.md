# RELEASE_QUALIFICATION

This directory is the version-controlled, append-only qualification ledger for immutable GitHub Release archives.

## Key

Every qualification event that applies to an archive is keyed by both:

- `releaseTag`
- `assetSha256`

The immutable release asset is never edited to carry later evidence.

## Events

`ledger.jsonl` is append-only JSON Lines. Existing evidence lines must not be rewritten or deleted.

PAGES-012 appends `archive_verified` only after all of these are true:

- repository release immutability was verified before publication;
- the release was published and GitHub reports `isImmutable=true`;
- GitHub release verification succeeds;
- the local and re-downloaded release asset passes GitHub asset verification;
- the recorded SHA-256 matches;
- a non-production restore from the immutable `pages-composite.tar` succeeds without rebuilding.

PAGES-014 appends `deployment_generation_verified` for the same `releaseTag` + `assetSha256`, with its verified generation evidence.

PAGES-015 appends `backend_compatibility_verified` for the same key, with the verified safe Worker/protocol/Turso tuple.

Do not write pending placeholders for deployment-generation or backend-compatibility state. Absence of a later evidence event means it has not yet been qualified.

## Complete qualification

THREEJS-098/099 may consume an archive only when `node scripts/verify-release-qualification.mjs <releaseTag> <assetSha256>` exits successfully. The verifier requires all three events for the exact same key and validates the PAGES-014 and PAGES-015 evidence shapes.
