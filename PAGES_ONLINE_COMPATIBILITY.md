# PAGES-015 — Online frontend / Cloudflare Worker / Turso compatibility window

Status: **DESIGN + FAIL-CLOSED GATES LOCKED; LIVE ELIGIBILITY AWAITS IMMUTABLE-RELEASE ADMIN PROOF AND PAGES-005 LIVE CREDENTIALS**

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
- keeps PAGES-014 qualification evidence outside immutable release assets, so `IMMUTABLE_FACTS.json` remains byte/source facts only and can reuse the already-staged active draft byte-for-byte;
- stages or reuses only an exact mutable draft and byte-compares every draft asset;
- requires the repository immutable-release Admin API to prove/enable immutability **before publication**;
- after publication, requires `isImmutable=true`, release/asset verification, exact SHA equality and a non-production restore;
- only then appends `archive_verified` and matching strong `deployment_generation_verified` to the additive ledger.

Immutable release assets are never edited or re-uploaded after publication.

## Worker/Turso live proof and automatic resume

PAGES-005 must complete an authenticated Cloudflare deploy with Turso secrets. Its workflow uses Wrangler structured NDJSON output for the exact deployment URL/version IDs, then keeps distinct active+previous Worker versions in the current deployment (100%/0%), proves both by exact Version Override, proves browser CORS + live Turso, and commits only proven `backend/cloudflare/API_ORIGIN.txt` + `WORKER_ROLLBACK_WINDOW.json`.

`.github/workflows/pages-015-online-compatibility.yml` automatically re-evaluates when the frontend window, ledger, API origin or Worker window changes. It exits cleanly without qualification while prerequisites are incomplete. Once both exact frontend keys have strong `archive_verified` + matching PAGES-014 `deployment_generation_verified` and PAGES-005 has a proven Worker window, it:

- re-probes both Worker versions by exact Version Override;
- re-downloads and verifies both immutable frontend archives and exact archived descriptor digests;
- proves browser CORS from the real GitHub Pages origin;
- proves live Turso write/read behavior;
- materializes and validates all four frontend×Worker pairings;
- appends `backend_compatibility_verified` for both exact immutable archive keys and runs the hardened complete-release verifier.

## Current external blockers

The implementation intentionally writes no backend eligibility event until both external boundaries are satisfied:

- GitHub must provide `PAGES_RELEASE_ADMIN_TOKEN` (repository Administration read/write) so immutable-release status can be proved/enabled and the two exact drafts can be published immutably.
- GitHub environment `cloudflare-backend` must provide `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` so PAGES-005 can create and prove the real Worker/Turso rollback window.

Missing credentials are treated as **not qualified**, never as a product/local-play failure and never as a guessed/pending qualification.
