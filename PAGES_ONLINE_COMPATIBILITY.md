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

`.github/workflows/pages-015-window-archive.yml` remains a targeted/manual archive diagnostic and fallback. `scripts/pages015-archive-window-entry-v2.sh`:

- recovers the exact successful Pages Actions artifact and verifies its SHA-256;
- validates root SHA, candidate SHA, generation, runtime/protocol hash, content identity and exact archived online-descriptor SHA;
- revalidates the recorded PAGES-014 run and job against their logs;
- reproduces the original `IMMUTABLE_FACTS.json` byte contract used by the first staged archive, including `liveManifestSha256` and `pages014VerifierRunId` in their historical order;
- never silently replaces an existing draft asset: every existing asset is re-downloaded and byte-compared;
- uses `PAGES_RELEASE_ADMIN_TOKEN` for release creation/promotion when available;
- proves/enables repository immutable releases **before publication**;
- after publication, requires `isImmutable=true`, release/asset verification, exact SHA equality and a non-production restore;
- only then appends `archive_verified` and matching strong `deployment_generation_verified` to the additive ledger.

`tests/pages015_archive_facts_contract.test.mjs` locks the historical immutable-facts field order and forbids later qualification state from leaking into immutable release assets.

`RELEASE_QUALIFICATION/PAGES015_ARCHIVE_STATUS/*.json` is diagnostics only (`qualificationEvidence=false`). Archive run `32133606554` established the current exact wait states:

- **active** `pages-archive-2026-08-18-geeb3b8e1-t4e4e5dec` / `3bb476e2…`: `stageState=exact-draft-verified`; the existing draft re-verifies byte-for-byte and is not published because the admin credential is absent.
- **previous** `pages-archive-2026-08-18-geeb3b8e1-t5cc89e05` / `6769843e…`: `stageState=waiting-admin-to-create-draft`; there is no reusable draft and the ordinary Actions integration cannot create the release.

Neither state is an `archive_verified` event. The strict verifier ignores `draft_staged` and diagnostics.

## Worker/Turso live proof

PAGES-005 has one centralized implementation: `scripts/pages005-bootstrap-live.sh`. It:

- validates Worker/compatibility contracts and a Wrangler dry-run;
- deploys with a protected secrets file and parses Wrangler structured NDJSON for exact Worker version and HTTPS target;
- waits for exact version metadata and proves a live Turso write/read round trip;
- uploads a distinct twin Worker and deploys active/previous at 100%/0%;
- proves both exact versions by Cloudflare Version Override against live Turso;
- proves browser CORS from `https://a7sncom.github.io`;
- re-proves the exact window immediately before locking it and verifies the ordinary no-override path resolves to active;
- only then commits `backend/cloudflare/API_ORIGIN.txt` and `WORKER_ROLLBACK_WINDOW.json`.

## One direct automatic-resume path

The authoritative automatic-resume path is now `.github/workflows/pages-015-qualification-orchestrator.yml` on `main`, invoking `scripts/pages015-orchestrate-qualification.sh`. It runs from the explicit credential trigger, manual dispatch, or one low-frequency daily schedule. It does **not** depend on nested workflow dispatch.

Each run checks the five required credentials without storing values and writes only the non-qualification readiness receipt `RELEASE_QUALIFICATION/PAGES015_ORCHESTRATOR_STATUS.json` when semantic state changes. If credentials permit, the same run proceeds directly and serially:

1. With `PAGES_RELEASE_ADMIN_TOKEN`, strongly qualify active then previous immutable frontend archives.
2. With all four Cloudflare/Turso credentials, run `pages005-bootstrap-live.sh` if a proven Worker rollback window is not already locked.
3. Once both strong frontend archive keys and the Worker window exist, run `scripts/pages015-finalize-live-window.sh`.
4. The finalizer re-proves both Worker versions, live Turso, real browser CORS, both immutable archive downloads/attestations/descriptor digests, materializes all four frontend×Worker pairings, appends `backend_compatibility_verified` for both exact keys, and runs the strict release verifier.

The earlier nested credential-probe/supervisor experiments were retired after GitHub returned `422` for nested workflow dispatch. They are not part of the production qualification path.

## Verified current blocker evidence

Direct orchestrator run `32134849795` completed successfully and recorded `phase=waiting-external-prerequisites` with no secret values and no qualification claim. Its current facts are:

- `PAGES_RELEASE_ADMIN_TOKEN`: absent
- `CLOUDFLARE_API_TOKEN`: absent
- `CLOUDFLARE_ACCOUNT_ID`: absent
- `TURSO_DATABASE_URL`: absent
- `TURSO_AUTH_TOKEN`: absent
- active strong archive qualification: false
- previous strong archive qualification: false
- Worker rollback window locked: false
- complete PAGES-015 qualification: false

Therefore no live backend bootstrap can occur, the previous release cannot yet be created/published immutably, and no `backend_compatibility_verified` event may be written. `API_ORIGIN.txt` and `WORKER_ROLLBACK_WINDOW.json` remain absent.

`PAGES_RELEASE_ADMIN_TOKEN` must be capable of reading the source Actions evidence, creating/reading release assets, and reading/enabling the immutable-release repository setting. The four backend credentials must be valid for the selected Cloudflare account and live Turso datastore. Do not weaken these checks merely to make the task appear complete.

Missing credentials are treated as **not qualified**, never as a product/local-play failure and never as a guessed/pending qualification.
