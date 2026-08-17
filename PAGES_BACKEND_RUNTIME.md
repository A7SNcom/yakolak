# PAGES-005 — Authoritative backend runtime decision

Status: **PROVIDER LOCKED / PUBLIC API_ORIGIN NOT YET LOCKED**

Date: 2026-08-17
Branch: `threejs-rebuild`

## Decision

The selected non-Vercel backend runtime is **Cloudflare Workers**. The selected datastore remains the existing **Turso Cloud** database contract through `@tursodatabase/serverless`.

GitHub Pages remains the only user-facing frontend host. GitHub Pages and GitHub Actions are not the interactive room server.

```text
https://a7sncom.github.io/yakolak/...  ->  API_ORIGIN  ->  Cloudflare Worker  ->  Turso Cloud
```

No Vercel URL is permitted as `API_ORIGIN` after this decision.

The exact public `API_ORIGIN` is intentionally not guessed. It becomes locked only after the first successful authenticated Worker deployment returns its real HTTPS deployment URL and the live room write/read probe succeeds. The canonical source for that value will be `backend/cloudflare/API_ORIGIN.txt`, created only from a proven live deployment URL.

## Evaluation

| Requirement | Cloudflare Workers | Decision evidence |
| --- | --- | --- |
| HTTPS JavaScript runtime | Pass | Native edge Worker request/response runtime. |
| Shared ES modules | Pass | Module Workers are the recommended format; the PAGES-005 worker directly imports `api/game-rules.js`. |
| Web Crypto | Pass | Worker probe uses `crypto.getRandomValues()` and `crypto.subtle.digest()`; no `node:crypto` is used in the Worker. |
| Turso access | Pass | Turso documents `@tursodatabase/serverless` as compatible with Cloudflare Workers and fetch-only. Existing repository dependency is reused. |
| Secrets | Pass | `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are Worker secrets, never public frontend config. |
| CORS | Pass | Probe allows the GitHub Pages security origin `https://a7sncom.github.io` and local development only; PAGES-006 owns final protocol/storage CORS policy. |
| Low-latency requests | Pass | Edge HTTPS runtime with fetch-based remote Turso client and no Node server process. |
| Stateless reconciliation | Pass | Request handlers are stateless; no request/session authority is kept in module globals. The eventual full room port must preserve datastore/version authority. |
| Deadline/bot reconciliation | Pass as runtime capability | Request-time reconciliation can run on every authoritative mutation/read; scheduled reconciliation is supported through Cron Triggers. Product semantics remain owned by the room protocol tasks. |
| Scheduled cleanup | Pass | `scheduled()` cleanup is implemented and wired to hourly Cron in `wrangler.jsonc`. |
| Deployment/versioning | Pass | Worker Versions/Deployments support immutable versions and controlled promotion. |
| Rollback | Pass | Cloudflare supports rolling back to a prior Worker version; datastore state is explicitly outside Worker version rollback and must remain protocol-compatible. |
| Non-Vercel | Pass | Provider and deployment workflow are Cloudflare-only. |

## Minimal implementation proof in repository

- `backend/cloudflare/src/worker.js`
  - imports the shared `api/game-rules.js` ES module;
  - uses Web Crypto;
  - connects to Turso using the existing serverless package;
  - implements `POST /__pages005/rooms` and `GET /__pages005/rooms/:id`;
  - implements exact-origin CORS and bounded request-body reads;
  - implements scheduled probe cleanup.
- `tests/pages_backend_runtime_contract.test.mjs`
  - proves the Worker HTTP write/read route round-trip against an injected in-memory store without requiring secrets;
  - proves origin rejection and Web Crypto digest behavior.
- `scripts/probe-pages005-cloudflare-roundtrip.mjs`
  - performs the required live write then independent read against the deployed Worker/Turso pair and fails on any mismatch.
- `.github/workflows/pages-005-cloudflare-backend.yml`
  - runs the Worker contract test;
  - runs a Wrangler dry-run bundle;
  - requires Cloudflare/Turso secrets;
  - deploys through Cloudflare Wrangler Action;
  - executes the live write/read probe against the deployment URL.

The in-memory test is implementation evidence, not a substitute for the required live Turso round trip. PAGES-005 is not complete until the deployment job succeeds and the exact public `API_ORIGIN` is recorded.

## Required secret boundary

GitHub environment `cloudflare-backend` must provide these secrets for the deployment job:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

No secret value may be committed to this repository or copied into GitHub Pages.

## Public API_ORIGIN lock rule

After successful deployment and live probe:

1. take the exact HTTPS `deployment-url` returned by Wrangler;
2. reject it if it is a Vercel URL or is not HTTPS;
3. run `node scripts/probe-pages005-cloudflare-roundtrip.mjs "$API_ORIGIN"`;
4. only if that succeeds, create `backend/cloudflare/API_ORIGIN.txt` containing exactly that origin with no trailing slash;
5. update migration docs/client public runtime configuration to use that one value;
6. later provider/origin changes require an explicit superseding migration task, not an ad-hoc fallback.

## Deployment and rollback contract

Normal Worker changes use Wrangler/Workers Versions. Deployment must keep the previous known-good Worker version available for rollback. Rollback changes executable Worker code/configuration only; it does not roll Turso data backward. Therefore schema/protocol changes must remain backward compatible across the active rollback window or ship with an explicit data migration/rollback plan.

## Official references checked for this decision

- Cloudflare Workers modules: https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
- Cloudflare Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare Versions and Deployments: https://developers.cloudflare.com/workers/versions-and-deployments/
- Cloudflare Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Cloudflare GitHub Actions: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Turso TypeScript reference: https://docs.turso.tech/sdk/ts/reference
- Turso SQL-over-HTTP quickstart: https://docs.turso.tech/sdk/http/quickstart
