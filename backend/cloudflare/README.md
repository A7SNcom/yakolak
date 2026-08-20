# Yakolak Cloudflare backend

This directory is the selected non-Vercel runtime for the GitHub Pages migration.

- Worker: `yakolak-room-api`
- frontend security origin: `https://a7sncom.github.io`
- datastore: existing Turso Cloud credentials
- configuration: `wrangler.jsonc`
- runtime entry: `src/worker.js`
- authoritative API envelope/auth contract: `src/authoritative-api.js`
- one persistence interface: `src/authoritative-store.js`
- deterministic memory contract store: `src/authoritative-memory-store.js`
- durable Turso authority adapter: `src/authoritative-turso-store.js`
- additive authority schema: `src/authoritative-schema.js`
- live PAGES-005 proof: `node ../../scripts/probe-pages005-cloudflare-roundtrip.mjs "$API_ORIGIN"`

## PAGES-005 compatibility routes

The historical rollback/probe surface remains unchanged:

- `GET /health`
- `POST /__pages005/rooms`
- `GET /__pages005/rooms/:probeRoomId`

Its locked compatibility identity remains `yakolak-online-room@1`, `yakolak-online-room-capabilities-v1`, and Turso probe schema `yakolak-pages005-room-probe@1`. THREEJS-062/063 only add authority records and fields around that surface; they do not rename or replace the PAGES-005 identity/table.

## THREEJS-062 versioned authoritative shell

The same Worker exposes the versioned shell:

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

Extra keys such as `seatId` fail closed. `move` executes only through `web/app/shared/transitions.js`; the Worker contains no duplicate board/win logic.

Every response carries a request/trace envelope plus `x-request-id` and `x-trace-id`. Browser CORS remains locked to the PAGES-006 origin model, with bearer authorization independent from CORS/path trust. Bodies remain bounded to 8 KB and errors use one normalized code/retryability shape.

## THREEJS-063 durable store boundary

`src/authoritative-store.js` remains the one Worker-facing store composition point. It now composes:

- the deterministic memory contract implementation for tests;
- the PAGES-005 probe methods over the original probe table;
- the versioned Turso authority schema and adapter for server-derived seat reads, invitation lookup and transactional authority mutations.

The Turso adapter advertises `turso-authoritative-v1` with authoritative read/mutation/invitation/transaction capability and durable mutation receipts. Every authoritative write goes through the exact THREEJS-062 store interface and an IMMEDIATE interactive transaction; duplicate receipt identity is checked before revision, then revision/state/invitation are read and the accepted state + durable room-scoped receipt commit together.

The additive schema is documented in `THREEJS_TURSO_AUTHORITY_SCHEMA.md`. It includes versioned lobby, seat, invitation, readiness, deadline, vote and mutation-receipt records plus a migration ledger. Schema evolution is forward-only/expand-contract: Worker rollback never restores Turso data.

THREEJS-063 intentionally does not decide the finite `00–99` invitation allocation/reuse policy. Invitation locator rows are indexed but not made globally unique by this task; THREEJS-065 owns active uniqueness, expiry/reclamation and saturation behavior. Ambiguous locator lookup fails closed until that policy is implemented.

## Required deployment secrets

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` must be supplied by the GitHub `cloudflare-backend` environment. Do not commit secret values.

Before a Worker generation depends on the new authority tables, run the forward-only migration with backend-only Turso credentials:

```sh
node scripts/migrate-threejs-authority.mjs
```

The migration is idempotent and prints schema status only; it does not print database credentials.

## Local verification

From repository root:

```sh
npm install --ignore-scripts
node --test tests/pages_backend_runtime_contract.test.mjs
node --test tests/threejs062_authoritative_api_shell.test.mjs
node --test tests/threejs062_authority_contract_extensions.test.mjs
node --test tests/threejs063_turso_authority_contract.test.mjs
npx wrangler@4 deploy --dry-run --config backend/cloudflare/wrangler.jsonc
```

The THREEJS-063 test uses Node 22 `node:sqlite` to exercise the same additive SQL and store transaction contract deterministically, including competing move/claim/timeout/computer races and duplicate receipt replay. These commands prove code/schema integration locally only; they do **not** establish a live Turso deployment/probe or live client readiness.

## Live readiness boundary

Do not invent a `workers.dev` hostname. After an authenticated deployment, PAGES-005 must still pass its exact live round-trip/rollback proof. The new authority schema must be migrated with real Turso credentials, and PAGES-015 must qualify the matching compatibility window before `/v1` can be described as live client-ready. THREEJS-064+ still own the actual room/invitation/readiness/timeout/computer feature semantics built on this store.

See `PAGES_BACKEND_RUNTIME.md`, `PAGES_ORIGIN_STORAGE_SECURITY.md`, `THREEJS_AUTHORITATIVE_API_CONTRACT.md`, `THREEJS_TURSO_AUTHORITY_SCHEMA.md`, and `THREEJS_BACKEND_GAP_REGISTER.md` for the locked runtime/security/ownership boundaries.
