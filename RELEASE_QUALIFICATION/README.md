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

## Writer ownership

PAGES-015 has one authoritative automatic-resume writer: `.github/workflows/pages-015-qualification-orchestrator.yml` on `main`, which serializes archive qualification, PAGES-005 bootstrap and final compatibility qualification through the version-controlled helpers.

Every workflow/job that can mutate the shared qualification ledger is serialized through the repository-wide `pages-release-qualification-ledger` concurrency group with `cancel-in-progress: false`. This includes the authoritative PAGES-015 orchestrator, the automatic PAGES-014 post-deploy generation writer, `.github/workflows/pages-015-window-archive.yml`, the manual compatibility fallback, both manual PAGES-005 live deploy fallbacks, and the historical PAGES-012 immutable-release writer. The shared lock prevents independent qualification paths from appending to `ledger.jsonl` concurrently.

`.github/workflows/pages-014-post-deploy-qualification.yml` on `main` may run automatically after a successful composite Pages deployment because it is the generation-evidence writer, but it takes the same qualification-ledger lock before it can append `deployment_generation_verified`.

`.github/workflows/pages-015-online-compatibility.yml` is a manual `workflow_dispatch` fallback only. It must not regain `push` or `schedule` triggers because a second automatic backend-compatibility writer would bypass the authoritative orchestrator path.

`.github/workflows/pages-015-window-archive.yml` may still run as its targeted/manual archive fallback, but it shares the same ledger lock as the orchestrator. Its active/previous matrix remains serial and must stay fail-closed before recovery/publication while the release Administration credential is absent.

`.github/workflows/pages-005-cloudflare-backend.yml` may verify backend contracts on pushes, but its live deploy job is manual-only and takes the same qualification-ledger lock before it can create/commit the proven API origin and Worker rollback window. Automatic PAGES-015 qualification must continue through the orchestrator.

The older `main` fallbacks `.github/workflows/pages-005-backend-bootstrap.yml`, `.github/workflows/pages-015-window-archives.yml`, and `.github/workflows/pages-015-qualify-online-window.yml` are manual `workflow_dispatch` fallbacks only and all use `pages-release-qualification-ledger`. They must not regain `push`, `workflow_run`, or `schedule` triggers.

`.github/workflows/pages-012-immutable-release.yml` is a historical release writer for a different archive key. It still supports explicit/manual execution and its historical source-change triggers, but workflow-file edits no longer self-trigger an immutable release run. When it writes `draft_staged` or `archive_verified`, it shares the same qualification-ledger lock as PAGES-015.

`tests/pages015_single_resume_path_contract.test.mjs` locks the feature-branch fallback contracts. The main PAGES-015 orchestrator additionally inspects the current `main` definitions directly and fails validation if PAGES-014 leaves the shared lock or any older main fallback regains an automatic trigger or leaves the shared lock.

## Complete qualification

THREEJS-098/099 may consume an archive only when `node scripts/verify-release-qualification.mjs <releaseTag> <assetSha256>` exits successfully. The verifier requires the strong archive, deployment-generation and backend-compatibility events for the exact key **and** proves the sibling frontend key in the locked active+previous window has its own strong archive/generation/backend rows from the same Worker/Turso evidence. The two backend rows must carry the same exact capability set, API origin, active+previous Worker IDs and four unique frontend×Worker pairings; a lone frontend row, mismatched sibling evidence, capability superset or non-exact Worker deployment identity is not complete qualification.
