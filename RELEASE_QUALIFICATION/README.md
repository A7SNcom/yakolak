# RELEASE_QUALIFICATION

This directory is the version-controlled, append-only qualification ledger for immutable GitHub Release archives.

## Key

Every qualification event that applies to an archive is keyed by both:

- `releaseTag`
- `assetSha256`

The immutable release asset is never edited to carry later evidence.

## Events

`ledger.jsonl` is append-only JSON Lines. Existing evidence lines must not be rewritten or deleted.

`archive_verified` means all of these are true for the exact release key:

- repository release immutability was verified before publication;
- the release was published and GitHub reports `isImmutable=true`;
- GitHub release verification succeeds;
- the local and re-downloaded release asset passes GitHub asset verification;
- the recorded SHA-256 matches;
- a non-production restore from the immutable `pages-composite.tar` succeeds without rebuilding.

Historical PAGES-012 archives may already carry that evidence in the ledger. New locked active+previous archive publication/verification for PAGES-015 must flow through the Admin-gated PAGES-015 archive path; the historical PAGES-012 release workflow is retired and cannot append new evidence.

PAGES-014 appends `deployment_generation_verified` for the same `releaseTag` + `assetSha256`, with its verified generation evidence.

PAGES-015 appends `backend_compatibility_verified` for the same key, with the verified safe Worker/protocol/Turso tuple. Each backend row also records `workerLockEvidenceSha256`, the exact `finalEvidenceSha256` of the PAGES-005 Worker rollback lock that was proven before append.

Do not write pending placeholders for deployment-generation or backend-compatibility state. Absence of a later evidence event means it has not yet been qualified.

## Writer ownership

PAGES-015 has one authoritative automatic-resume writer: `.github/workflows/pages-015-qualification-orchestrator.yml` on `main`, which serializes archive qualification, PAGES-005 bootstrap and final compatibility qualification through the version-controlled helpers.

Every workflow/job that can mutate the shared qualification ledger is serialized through the repository-wide `pages-release-qualification-ledger` concurrency group with `cancel-in-progress: false`. This includes the authoritative PAGES-015 orchestrator, the automatic PAGES-014 post-deploy generation writer, `.github/workflows/pages-015-window-archive.yml`, the manual compatibility fallback, and both manual PAGES-005 live deploy fallbacks. The shared lock prevents independent qualification paths from appending to `ledger.jsonl` concurrently.

`.github/workflows/pages-014-post-deploy-qualification.yml` on `main` may run automatically after a successful composite Pages deployment because it is the generation-evidence writer, but it takes the same qualification-ledger lock before it can append `deployment_generation_verified`.

`.github/workflows/pages-015-online-compatibility.yml` is a manual `workflow_dispatch` fallback only. It must not regain `push` or `schedule` triggers because a second automatic backend-compatibility writer would bypass the authoritative orchestrator path. It validates the exact current Worker lock before early completion and again after append before any ledger commit.

`.github/workflows/pages-015-window-archive.yml` may still run as its targeted/manual archive fallback, but it shares the same ledger lock as the orchestrator. Its active/previous matrix remains serial and must stay fail-closed before recovery/publication while the release Administration credential is absent.

`.github/workflows/pages-005-cloudflare-backend.yml` may verify backend contracts on pushes, but its live deploy job is manual-only and takes the same qualification-ledger lock before it can create/commit the proven API origin and Worker rollback window. Automatic PAGES-015 qualification must continue through the orchestrator.

The older `main` backend/qualification fallbacks `.github/workflows/pages-005-backend-bootstrap.yml` and `.github/workflows/pages-015-qualify-online-window.yml` remain manual `workflow_dispatch` fallbacks only and use `pages-release-qualification-ledger`. The old main archive fallback `.github/workflows/pages-015-window-archives.yml` is now a read-only retired placeholder, and `scripts/pages015-archive-source.sh` is a fail-closed retired helper. Neither may regain release mutation or qualification-ledger write capability; archive work must flow through the orchestrator/Admin-gated v2 path.

`.github/workflows/pages-012-immutable-release.yml` is now a historical read-only placeholder. It is `workflow_dispatch` only, has `contents: read`, and must never regain `PAGES_RELEASE_ADMIN_TOKEN`, `gh release`, `git push`, or qualification-ledger mutation. Its old publication implementation remains only in Git history as historical evidence. Use `.github/workflows/pages-015-window-archive.yml` for the locked active+previous archive window and `.github/workflows/pages-012-rollback.yml` only for verified restore/rollback operations.

`tests/pages015_single_resume_path_contract.test.mjs` locks the feature-branch fallback contracts, including the retired PAGES-012 release writer. The main PAGES-015 orchestrator additionally inspects the current `main` definitions directly and fails validation if PAGES-014 leaves the shared lock, a retired main archive path regains mutation capability, or an older main fallback regains an automatic trigger or leaves the shared lock.

## Complete qualification

THREEJS-098/099 may consume an archive only when both of these commands exit successfully for the current repository state:

- `node scripts/verify-release-qualification.mjs <releaseTag> <assetSha256>`
- `node scripts/verify-pages015-current-lock-qualification.mjs`

The strict release verifier requires the strong archive, deployment-generation and backend-compatibility events for the exact key **and** proves the sibling frontend key in the locked active+previous window has its own strong archive/generation/backend rows from the same Worker/Turso evidence. The two backend rows must carry the same exact capability set, API origin, active+previous Worker IDs and four unique frontend×Worker pairings; a lone frontend row, mismatched sibling evidence, capability superset or non-exact Worker deployment identity is not complete qualification.

The current-lock verifier then binds those rows to the **current** PAGES-005 rollback lock, including its exact `finalEvidenceSha256`. A new Worker version, changed API/protocol/capability/Turso identity, or even a newly generated PAGES-005 evidence digest for the same nominal tuple invalidates the early-exit path until active+previous are freshly qualified against that current lock.

## Rollback eligibility

`.github/workflows/pages-012-rollback.yml` preserves the online/backend gate boundary:

- `deploy_pages=false` remains a non-production exact-byte restore proof and does not require live backend qualification.
- `deploy_pages=true` is a public online mutation and therefore requires the requested immutable `releaseTag` + `assetSha256` to be one of the **current** active/previous frontend keys, requires the strict release verifier, and requires the current-lock verifier.
- Public rollback re-runs those current-window/current-lock checks before artifact upload and again immediately before `deploy-pages`, while the workflow holds `pages-release-qualification-ledger`; the deploy job also takes `yakolak-pages-composite`.

This means presentation/local restore remains usable without PAGES-005, while public online rollback cannot silently revive an archive qualified against an obsolete Worker/Turso window.
