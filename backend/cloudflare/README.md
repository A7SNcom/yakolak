# Yakolak Cloudflare backend

This directory is the selected non-Vercel runtime for the GitHub Pages migration.

- Worker: `yakolak-room-api`
- frontend security origin: `https://a7sncom.github.io`
- datastore: existing Turso Cloud credentials
- configuration: `wrangler.jsonc`
- runtime entry: `src/worker.js`
- authoritative API envelope/auth contract: `src/authoritative-api.js`
- one persistence interface + deterministic memory implementation: `src/authoritative-store.js`
- live PAGES-005 proof: `node ../../scripts/probe-pages005-cloudflare-roundtrip.mjs "$API_ORIGIN"`

## PAGES-005 compatibility routes

The historical rollback/probe surface remains unchanged:

- `GET /health`
- `POST /__pages005/rooms`
- `GET /__pages005/rooms/:probeRoomId`

Its locked compatibility identity remains `yakolak-online-room@1`, `yakolak-online-room-capabilities-v1`, and Turso probe schema `yakolak-pages005-room-probe@1`. THREEJS-062 only adds fields; it does not rename or replace the PAGES-005 identity.

## THREEJS-062 versioned authoritative shell

The same Worker now also exposes the versioned shell:

- `GET /v1/health`
- `GET /v1/rooms/:roomId/snapshot`
- `POST /v1/rooms/:roomId/mutations`

The shell identity is `yakolak.authoritative-api/v1` with capability id `yakolak-authoritative-api-capabilities-v1`.

Authenticated room routes require `Authorization: Bearer <opaque seat credential>`. The Worker validates the credential shape, hashes it with Web Crypto, and passes only the hash to the store. The client never supplies authoritative `seatId`; the store returns the server-derived `seatId`, credential generation and current snapshot.

The mutation body is intentionally narrow:

```json
{
  "mutationId": "32-to-96-char-opaque-id",
  "expectedRevision": 7,
  "action": "move",
  "payload": { "cell": 4, "size": "medium" }
}
```

Extra keys such as `seatId` fail closed. `move` executes only through `web/app/shared/transitions.js`; THREEJS-062 contains no duplicate board/win logic.

Every response carries a request/trace envelope plus `x-request-id` and `x-trace-id`. Browser CORS remains locked to the PAGES-006 origin model, with bearer authorization independent from CORS/path trust. Bodies remain bounded to 8 KB and errors use one normalized code/retryability shape.

## Store boundary

`src/authoritative-store.js` defines one store interface used by both the historical PAGES-005 probe routes and the new `/v1` shell. It includes:

- PAGES-005 probe read/write/cleanup methods;
- server-side seat authorization;
- revision/mutation CAS framing.

`createInMemoryAuthoritativeStore()` is deterministic contract-only storage for tests. It proves server-derived seat authority, revision conflicts, mutation-id reuse rejection and duplicate receipt replay without a second backend.

The current Turso implementation deliberately supports only the existing PAGES-005 probe table. Its authoritative capabilities report `authoritativeRead=false`, `authoritativeMutation=false`, and `durableMutationReceipts=false`; authenticated `/v1/rooms/*` calls fail `authoritative_store_unavailable` until THREEJS-063 supplies the real Turso schema/CAS/receipt adapter. Do not add a temporary authoritative Turso table in THREEJS-062.

## Required deployment secrets

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` must be supplied by the GitHub `cloudflare-backend` environment. Do not commit secret values.

## Local verification

From repository root:

```sh
npm install --ignore-scripts
node --test tests/pages_backend_runtime_contract.test.mjs
node --test tests/threejs062_authoritative_api_shell.test.mjs
npx wrangler@4 deploy --dry-run --config backend/cloudflare/wrangler.jsonc
```

These commands prove the shell locally only. They do **not** establish live client readiness.

## Live readiness boundary

Do not invent a `workers.dev` hostname. After an authenticated deployment, PAGES-005 must still pass its exact live round-trip/rollback proof. The authoritative `/v1` room surface cannot be called live-ready until THREEJS-063 provides durable Turso authority, PAGES-005 performs the authenticated deploy/probe, and PAGES-015 qualifies the matching compatibility window.

See `PAGES_BACKEND_RUNTIME.md`, `PAGES_ORIGIN_STORAGE_SECURITY.md`, and `THREEJS_BACKEND_GAP_REGISTER.md` for the locked runtime/security/ownership boundaries.
