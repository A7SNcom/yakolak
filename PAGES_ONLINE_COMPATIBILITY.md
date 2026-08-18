# PAGES-015 — Online frontend / Cloudflare Worker / Turso compatibility window

Status: **IMPLEMENTATION + FAIL-CLOSED GATES LOCKED; LIVE ELIGIBILITY BLOCKED ONLY BY VERIFIED-MISSING EXTERNAL CREDENTIALS**

This task is an **online/backend gate only**. It never blocks the Three.js shell, presentation, asset loading, rendering, or local/offline gameplay. It gates only remote authoritative reads/mutations.

## Compatibility identity

Every online tuple is identified by all of these values; none may be inferred from “latest”:

| Dimension | Required identity |
| --- | --- |
| Frontend | immutable GitHub release tag + exact `pages-composite.tar` SHA-256 |
| Frontend compatibility | `threejs/online-compatibility.json` read from re-downloaded immutable archive bytes |
| Frontend deployment | exact PAGES-014 generation/runtime/content identity plus successful live-verifier evidence for the same source bytes |
| Worker | Cloudflare Worker **version ID** exposed by the version-metadata binding |
| Protocol | `yakolak-online-room@1` |
| Capabilities | `yakolak-online-room-capabilities-v1` + explicit capability-name set |
| Turso | `yakolak-pages005-room-probe@1` |
| Migration policy | `expand-contract-forward-only`; Turso data is never rolled backward |

`RELEASE_QUALIFICATION/ONLINE_FRONTEND_WINDOW.json` locks the candidate active+previous frontend window but explicitly grants no eligibility. `RELEASE_QUALIFICATION/ONLINE_COMPATIBILITY_MATRIX.json` defines the matrix. Verified rows live only as additive `backend_compatibility_verified` events in `RELEASE_QUALIFICATION/ledger.jsonl`; absence means **unverified**, never pending/assumed.

## Active + previous rollback window

Before online eligibility, all four pairings must be proven safe against the same forward-only Turso schema:

1. active frontend × active Worker
2. active frontend × previous Worker
3. previous frontend × active Worker
4. previous frontend × previous Worker

THREEJS-078/080/098/099 have no bootstrap exemption: they require complete qualification for the exact immutable archive key. A version leaves the rollback window only after successor pairings are proven and retention is explicitly moved.

Cloudflare rollback changes Worker code/configuration only. Turso rows/schema are never rolled backward.

## Expand / contract rule

1. **Expand** Turso additively; retained columns/tables/semantics stay usable by both Worker versions.
2. Deploy a Worker version accepting old + expanded shapes.
3. Keep active + previous Worker version IDs in the current deployment so exact Version Override probes can test both.
4. Qualify active + previous frontend against active + previous Worker.
5. Move the frontend/Worker window only after all four pairings pass.
6. **Contract** only after the previous window has drained and a later qualification proves no retained version depends on the old shape.

Destructive rename/drop/type reinterpretation is forbidden inside an ordinary rollback-window migration.

## Runtime fail-closed behavior

`web/app/session/online-compatibility.js` starts `unverified`. It must fetch `/health` and validate protocol, capability set, Turso schema and Worker identity before `assertMutationAllowed()` succeeds.

`createCanonicalOnlineSession()` performs that assertion **before** reserving a move id and before transport. Missing API origin, failed health, missing identity, protocol/capability/schema mismatch, or changed snapshot identity blocks only the online mutation. Local gameplay/presentation remain available.

The Worker exposes the same compatibility identity on `/health`, probe writes and probe snapshot reads, so a changed response closes the gate again.

## Immutable frontend window proof

`.github/workflows/pages-015-window-archive.yml` resolves both frontend entries from the locked window and processes them serially (`max-parallel: 1`). `scripts/pages015-archive-window-entry-v2.sh`:

- recovers the exact successful Pages Actions artifact and verifies its SHA-256;
- validates root SHA, candidate SHA, generation, runtime/protocol hash, content identity and the exact archived online-descriptor SHA;
- verifies the recorded PAGES-014 run **and job** succeeded and re-reads its job logs to match root/candidate/generation/runtime/content/live-manifest identities;
- reproduces the original `IMMUTABLE_FACTS.json` byte contract used by the first staged archive, including immutable identities known at staging time (`liveManifestSha256` and `pages014VerifierRunId`), while all later qualification decisions remain external in the ledger;
- never replaces an existing draft asset silently: every existing asset is re-downloaded and byte-compared;
- uses `PAGES_RELEASE_ADMIN_TOKEN` for release creation/promotion when available, while existing readable drafts may still be re-verified with the ordinary workflow token;
- requires the repository immutable-release Admin API to prove/enable immutability **before publication**;
- after publication, requires `isImmutable=true`, release/asset verification, exact SHA equality and a non-production restore;
- only then appends `archive_verified` and matching strong `deployment_generation_verified` to the additive ledger.

`RELEASE_QUALIFICATION/PAGES015_ARCHIVE_STATUS/*.json` is diagnostics only (`qualificationEvidence=false`). It distinguishes `exact-draft-verified` from `waiting-admin-to-create-draft`; a successful diagnostic job never confers release eligibility.

Immutable release assets are never edited or re-uploaded after publication.

## Current frontend archive state

Archive workflow run `32133400098` completed both active and previous jobs successfully in fail-closed waiting mode:

- **active** `pages-archive-2026-08-18-geeb3b8e1-t4e4e5dec` / `3bb476e2…`: the historical immutable-facts schema was restored and the existing draft now re-verifies byte-for-byte. It is not published because the immutable-release admin credential is absent.
- **previous** `pages-archive-2026-08-18-geeb3b8e1-t5cc89e05` / `6769843e…`: there is no reusable draft that the ordinary Actions token can create; release creation returned the expected integration-permission denial. The workflow records this as `waiting-admin-to-create-draft` rather than pretending a draft exists.

Neither diagnostic state is an `archive_verified` event. The strong release verifier ignores `draft_staged` and requires immutable publication + attestation + restore + matching PAGES-014 evidence.

## Worker/Turso live proof and automatic resume

PAGES-005 has one centralized implementation: `scripts/pages005-bootstrap-live.sh`. Both the default-branch bootstrap workflow and the `threejs-rebuild` workflow invoke this exact helper. It:

- validates local Worker/compatibility contracts and a Wrangler dry-run;
- deploys with a protected secrets file and parses Wrangler structured NDJSON for the exact Worker version and HTTPS target;
- waits for the bootstrap version identity to become live and proves a real Turso write/read round trip;
- uploads a distinct twin Worker version and deploys active/previous at 100%/0%;
- proves both exact versions by Cloudflare Version Override against live Turso;
- proves browser CORS from `https://a7sncom.github.io`;
- re-proves the exact version window immediately before publication and verifies the ordinary no-override health path resolves to the active version;
- only then commits `backend/cloudflare/API_ORIGIN.txt` and `WORKER_ROLLBACK_WINDOW.json`.

The default-branch credential probe is self-resuming and runs on explicit trigger plus a low-frequency schedule. It commits `CREDENTIAL_STATUS.json` only when semantic credential/lock state changes, so it does not create daily repository churn. When all four Cloudflare/Turso credentials appear and no Worker window is already locked, it dispatches the hardened PAGES-005 bootstrap. Any `CREDENTIAL_STATUS.json` change also retriggers the PAGES-015 archive workflow, so an added release-admin credential is consumed automatically.

`.github/workflows/pages-015-online-compatibility.yml` automatically re-evaluates when the frontend window, ledger, API origin or Worker window changes. It exits cleanly without qualification while prerequisites are incomplete. Once both exact frontend keys have strong `archive_verified` + matching PAGES-014 `deployment_generation_verified` and PAGES-005 has a proven Worker window, it:

- re-probes both Worker versions by exact Version Override;
- re-downloads and verifies both immutable frontend archives and exact archived descriptor digests;
- proves browser CORS from the real GitHub Pages origin;
- proves live Turso write/read behavior;
- materializes and validates all four frontend×Worker pairings;
- appends `backend_compatibility_verified` for both exact immutable archive keys and runs the hardened complete-release verifier.

## Verified external blocker evidence

The latest default-branch credential probe wrote boolean-only evidence to `backend/cloudflare/CREDENTIAL_STATUS.json` from Actions run `32132444756`; it stores **no secret values** and is explicitly not qualification evidence.

All five required credentials are currently absent:

- `CLOUDFLARE_API_TOKEN`: absent
- `CLOUDFLARE_ACCOUNT_ID`: absent
- `TURSO_DATABASE_URL`: absent
- `TURSO_AUTH_TOKEN`: absent
- `PAGES_RELEASE_ADMIN_TOKEN`: absent

Therefore `cloudflareBootstrapReady=false`, `workerRollbackWindowLocked=false`, no backend bootstrap is dispatched, no previous release draft can be created with sufficient release permissions, immutable publication cannot proceed, and no eligibility event may be written. `API_ORIGIN.txt` and `WORKER_ROLLBACK_WINDOW.json` do not exist.

`PAGES_RELEASE_ADMIN_TOKEN` must be capable of the repository operations exercised by the archive helper: reading the source Actions evidence, creating/reading release assets, and reading/enabling the immutable-release repository setting. Do not weaken those checks merely to make the task appear complete.

Missing credentials are treated as **not qualified**, never as a product/local-play failure and never as a guessed/pending qualification.
