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

- resolves the exact historical Pages tar through `scripts/pages015-resolve-exact-pages-source.sh`;
- prefers the original successful Pages Actions artifact when still retained;
- otherwise accepts the preserved recovered Actions artifact only after artifact metadata, ZIP digest, recovery provenance and exact tar SHA all match;
- if that preserved artifact later expires, reconstructs from the locked Godot/Three.js Git SHAs plus the version-controlled historical tar-layout oracle and accepts the result **only** when the final tar SHA-256 equals the original locked Pages digest;
- validates root SHA, candidate SHA, generation, runtime/protocol hash, content identity and exact archived online-descriptor SHA;
- revalidates the recorded PAGES-014 run and job against their logs;
- reproduces the original `IMMUTABLE_FACTS.json` byte contract used by the first staged archive, including `liveManifestSha256` and `pages014VerifierRunId` in their historical order;
- never silently replaces an existing draft asset: every existing asset is re-downloaded and byte-compared;
- can stage the locked previous mutable draft through a dedicated branch that is re-resolved to the exact candidate SHA before use; `PAGES_RELEASE_ADMIN_TOKEN` remains mandatory for immutable publication/promotion;
- proves/enables repository immutable releases **before publication**;
- after publication, requires `isImmutable=true`, release/asset verification, exact SHA equality and a non-production restore;
- only then appends `archive_verified` and matching strong `deployment_generation_verified` to the additive ledger.

`tests/pages015_archive_facts_contract.test.mjs` locks the historical immutable-facts field order and forbids later qualification state from leaking into immutable release assets.

The original Pages source artifacts expired, but this is no longer a blocker. One-time recovery run `32136096713` independently reconstructed both exact historical tar streams and preserved them for 90 days:

- active recovered artifact `9324028185` → `3bb476e2ee76f372b9b945d160f6f1e9faad865eaacd9baef2b1384bd434fa5f`
- previous recovered artifact `9324029202` → `6769843ee45a807cffe8af8c8450e0afd7d08c45270e66512f1ad52462dfb560`

The temporary recovery workflow was retired after proving those exact SHA matches. Durable recovery now lives in the resolver + locked Git SHAs + `PAGES015_TAR_LAYOUT/*.json`; recovered-source metadata is explicitly `qualificationEvidence=false`.

`RELEASE_QUALIFICATION/PAGES015_ARCHIVE_STATUS/*.json` is diagnostics only (`qualificationEvidence=false`). The retention-independent flow now has exact mutable drafts for **both** locked frontend keys. Run `32164753404` revalidated them after the original Actions artifacts had expired:

- **active** `pages-archive-2026-08-18-geeb3b8e1-t4e4e5dec` / `3bb476e2…`: `stageState=exact-draft-verified`; release ID `372154227`.
- **previous** `pages-archive-2026-08-18-geeb3b8e1-t5cc89e05` / `6769843e…`: `stageState=exact-draft-verified`; release ID `372518304`. Its mutable draft targets `pages015-release-target-previous-5cc89e05`, and that branch is re-resolved to exact candidate SHA `5cc89e05653b6461ed6a41332f374eaadb360945` before staging and again before any immutable publication.

All eight expected release assets are byte-checked before a `draft_staged` receipt is accepted. Neither draft is immutable or eligible yet; publication remains blocked on the Admin credential.

Run `32169299197` then proved the low-cost waiting path for both locked keys: each resolved its exact `draft_staged` receipt, reported `stageState=exact-draft-already-staged`, skipped the source-recovery bridge, skipped publication, and completed successfully. Recovery and re-hashing resume only when the Administration credential exists, at which point the archive helper re-downloads and re-verifies the mutable draft before any immutable publication.

Neither state is an `archive_verified` event. The strict verifier ignores `draft_staged`, recovery metadata and diagnostics.

### Verified release/tag permission requirement

A dedicated one-time permission probe was run and then retired. Run `32150862909`, job `95756098932`, had `contents:write` and attempted to create the locked archive tag without changing the locked target SHA. GitHub rejected the ref update because the GitHub App token lacked **workflows permission**, naming `.github/workflows/pages-005-cloudflare-backend.yml` in the rejection. This is recorded in `RELEASE_QUALIFICATION/PAGES015_RELEASE_PERMISSION_BLOCKER.json` and is not qualification evidence.

The locked previous candidate `5cc89e05653b6461ed6a41332f374eaadb360945` itself directly changed `.github/workflows/threejs-optional-checks.yml`; the active candidate `4e4e5dec72ee71a06940c6db561dde8d24abd2d0` changed only `web/online-compatibility.json`. The release target/candidate SHA will **not** be retargeted merely to bypass this permission requirement.

The branch-target proof subsequently showed that ordinary `github.token` can safely stage the **mutable previous draft** when the target branch is pre-created and independently locked to the exact candidate SHA. This does not weaken the historical raw-ref permission finding and does not remove the Admin publication gate.

Therefore `PAGES_RELEASE_ADMIN_TOKEN` must be capable of:

- reading the staged drafts and release assets and promoting them only after immutable-release proof;
- creating/publishing the locked release tag/ref for candidate commits whose trees/history contain workflow files;
- carrying the GitHub **workflows write permission/scope** required for that ref operation;
- reading/enabling the repository immutable-release setting;
- reading source Actions/PAGES-014 evidence used by the archive helper.

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

The authoritative automatic-resume path is `.github/workflows/pages-015-qualification-orchestrator.yml` on `main`, invoking `scripts/pages015-orchestrate-qualification.sh`. It runs from the explicit credential trigger, manual dispatch, or one low-frequency daily schedule. It does **not** depend on nested workflow dispatch.

Each run checks the five required credentials without storing values. Semantic changes are recorded in `RELEASE_QUALIFICATION/PAGES015_ORCHESTRATOR_STATUS.json`; explicit push/manual runs also write `RELEASE_QUALIFICATION/PAGES015_ORCHESTRATOR_RUN.json` so a fresh Run ID and credential-presence receipt exists even when the semantic state is unchanged. Both files are `qualificationEvidence=false` and never store secret values.

When `PAGES_RELEASE_ADMIN_TOKEN` is present, the workflow runs the release-admin capability preflight and only then installs the exact-source recovery bridge before archive work. When the Admin credential is absent, both steps are skipped; Cloudflare/Turso readiness and all non-archive status checks continue independently. If credentials permit, the run proceeds directly and serially:

1. With `PAGES_RELEASE_ADMIN_TOKEN`, strongly qualify active then previous immutable frontend archives.
2. With all four Cloudflare/Turso credentials, run `pages005-bootstrap-live.sh` if a proven Worker rollback window is not already locked.
3. Once both strong frontend archive keys and the Worker window exist, run `scripts/pages015-finalize-live-window.sh`.
4. The finalizer re-proves both Worker versions, live Turso, real browser CORS, both immutable archive downloads/attestations/descriptor digests, materializes all four frontend×Worker pairings, appends `backend_compatibility_verified` for both exact keys, and runs the strict release verifier.

The orchestrator validation step also runs the archive immutable-facts, archive Admin-preflight, release-target staging/readback and release-admin capability contract tests before any live action.

The earlier nested credential-probe/supervisor experiments were retired after GitHub returned `422` for nested workflow dispatch. The one-time tag-permission probe was also removed after recording the exact blocker. None of those diagnostic workflows are part of the production qualification path.

## Verified current blocker evidence

Fresh explicit orchestrator run `32175709664` completed successfully at `2026-08-18T19:16:58Z`. Its non-secret receipt proves the current credential state without relying on an older unchanged semantic-status timestamp:

- `PAGES_RELEASE_ADMIN_TOKEN`: absent
- `CLOUDFLARE_API_TOKEN`: absent
- `CLOUDFLARE_ACCOUNT_ID`: absent
- `TURSO_DATABASE_URL`: absent
- `TURSO_AUTH_TOKEN`: absent
- backend credentials ready: false
- Worker lock files present: false

The same run completed the full orchestrator job successfully. Release-admin preflight and exact-source recovery bridge were both skipped because the Admin credential was absent, while the remaining contract validation and readiness logic succeeded. The additive ledger still contains initialization plus exact `draft_staged` events for both active and previous archives; there are no strong archive, deployment-generation, or backend-compatibility qualification rows.

`backend/cloudflare/API_ORIGIN.txt` and `backend/cloudflare/WORKER_ROLLBACK_WINDOW.json` remain absent. Therefore no authenticated Cloudflare/Turso bootstrap or live four-pair compatibility proof can occur, both mutable release drafts are staged but neither can yet be published/verified immutable without the required release/workflows/Admin authority, and no `backend_compatibility_verified` event may be written.

The four backend credentials must be valid for the selected Cloudflare account and live Turso datastore. Do not weaken the exact source, release-target, immutable-release, browser-CORS, live-Turso or four-pair checks merely to make the task appear complete.

Missing credentials are treated as **not qualified**, never as a product/local-play failure and never as a guessed/pending qualification.
