# PAGES-015 — Online frontend / Cloudflare Worker / Turso compatibility window

Status: **DESIGN + FAIL-CLOSED GATE LOCKED; LIVE QUALIFICATION BLOCKED BY PAGES-005 API_ORIGIN**

This task is an **online/backend gate only**. It must never block loading the Three.js shell, presentation, asset loading, rendering, or local/offline gameplay. It gates only remote authoritative reads/mutations.

## Compatibility identity

Every online tuple is identified by all of these values; none may be inferred from “latest”:

| Dimension | Required identity |
| --- | --- |
| Frontend | immutable GitHub release tag + `pages-composite.tar` SHA-256 |
| Frontend deployment | PAGES-014 deployment generation/content identity already qualified for that same immutable asset |
| Worker | Cloudflare Worker **version ID** exposed by the version-metadata binding |
| Protocol | `yakolak-online-room@1` |
| Capabilities | `yakolak-online-room-capabilities-v1` + the explicit capability-name set |
| Turso | `yakolak-pages005-room-probe@1` |
| Migration policy | `expand-contract-forward-only`; Turso data is never rolled backward |

`RELEASE_QUALIFICATION/ONLINE_COMPATIBILITY_MATRIX.json` defines the matrix columns and policy. Verified rows live only as additive `backend_compatibility_verified` events in `RELEASE_QUALIFICATION/ledger.jsonl`; an absent row means **unverified**, never pending/assumed.

## Active + previous rollback window

Before an online frontend/Worker release is eligible, all four pairings must be safe against the same forward-only Turso schema:

1. active frontend × active Worker
2. active frontend × previous Worker
3. previous frontend × active Worker
4. previous frontend × previous Worker

There is no cutover-task bootstrap exemption: THREEJS-078/080/098/099 require a complete qualification event proving the active+previous window. A version can leave the rollback window only after its successor pairings have been proven and the retention decision is explicit.

Cloudflare rollback changes Worker executable/configuration only. Turso rows/schema are not rolled backward.

## Expand / contract rule

Schema/protocol evolution is ordered:

1. **Expand** Turso additively. Existing columns/tables/semantics remain readable/writable by both Worker versions.
2. Deploy a Worker version that accepts both old and expanded shapes.
3. Qualify active + previous frontend against active + previous Worker.
4. Move the frontend window.
5. Retire the oldest frontend/Worker only after no rollback path needs it.
6. **Contract** only after the previous window has drained and a new qualification proves no retained version depends on the old shape.

Destructive rename/drop/type reinterpretation cannot be part of an ordinary rollback-window migration.

## Runtime fail-closed behavior

`web/app/session/online-compatibility.js` starts `unverified`. It must successfully fetch `/health` and validate protocol, capability set, and Turso schema before `assertMutationAllowed()` can succeed.

`createCanonicalOnlineSession()` calls that assertion **before** reserving a move id and before invoking transport. Missing API origin, failed health, missing identity, protocol/capability/schema mismatch, or a changed snapshot identity blocks only the online mutation. It does not disable the shell/local game.

The Worker returns the same `compatibility` object from `/health`, probe write responses, and probe snapshot reads. A response can therefore close the gate again if identity changes after the health check.

## Live qualification — mandatory evidence

Matrix design is valid while `backend/cloudflare/API_ORIGIN.txt` is absent, but **no** `backend_compatibility_verified` ledger event may be written until PAGES-005 has completed its real authenticated deploy and locked that file.

The manual `PAGES-015 online compatibility qualification` workflow then requires, for both active and previous Worker version IDs:

- the locked HTTPS `API_ORIGIN`;
- Cloudflare version metadata proving the exact invoked Worker version ID;
- `/health` success with exact protocol/capability/Turso identity;
- GitHub Pages browser-origin CORS fetch success;
- live Turso write then independent read with matching payload/integrity;
- the active and previous immutable frontend keys already have `archive_verified` and `deployment_generation_verified`;
- all four active/previous frontend × Worker pairings use the same compatible identity.

Only then does the workflow append `backend_compatibility_verified` to the separate version-controlled ledger for **both** frontend archive keys. It never edits, re-uploads, or annotates an immutable release asset.

## Current blocker

PAGES-005 currently records `PUBLIC API_ORIGIN NOT YET LOCKED`; therefore this commit intentionally appends **no** backend qualification event. Doing so before a real Cloudflare deploy + browser CORS + live Turso proof would be a false eligibility claim.
