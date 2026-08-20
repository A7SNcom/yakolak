# PAGES-005 — Authoritative backend runtime decision

Status: **PROVIDER LOCKED / LIVE API_ORIGIN + WORKER ROLLBACK WINDOW AWAIT CREDENTIALS**

Date: 2026-08-20
Branch: `threejs-rebuild`

## Decision

The selected non-Vercel backend runtime is **Cloudflare Workers** and the datastore is **Turso Cloud** through `@tursodatabase/serverless`.

GitHub Pages remains the only user-facing frontend host:

```text
https://a7sncom.github.io/yakolak/... -> API_ORIGIN -> Cloudflare Worker -> Turso Cloud
```

No Vercel URL is permitted as `API_ORIGIN`. The exact origin is never guessed and is not committed until a real authenticated deployment plus live Turso/CORS proof succeeds.

## Runtime contract

- `backend/cloudflare/src/worker.js` is a module Worker and imports the shared `api/game-rules.js` contract.
- Worker code uses Web Crypto and stateless request handlers.
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are Worker secrets and never enter Pages artifacts.
- `backend/cloudflare/wrangler.jsonc` declares both Turso secret names in `secrets.required`, so Wrangler must fail closed when either required Worker secret is absent.
- Browser CORS allows the security origin `https://a7sncom.github.io`; authorization never trusts a Pages path.
- `/health`, probe writes and probe reads expose the PAGES-015 protocol/capability/Turso identity plus Cloudflare Worker Version ID from the version-metadata binding.
- Scheduled cleanup remains wired through the hourly Cron trigger.
- The deployment toolchain is pinned in `package.json`: `wrangler=4.123.0` and `@playwright/test=1.62.1`. Live bootstrap refuses to continue if the installed Wrangler version differs.

## Credential contract

The `cloudflare-backend` GitHub Environment must provide these four PAGES-005 values:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

The Cloudflare token must be a CI-capable API token scoped to the target account. The supported baseline is Cloudflare's **Edit Cloudflare Workers** token template (or an equivalently restricted custom token with the required Workers write permissions). Do not use a global API key, do not place any secret value in the repository, and do not paste secret values into issues, workflow inputs, logs, or public runtime files.

`CLOUDFLARE_ACCOUNT_ID` must identify the exact account authorized by that token. The two Turso values are uploaded alongside Worker code through Wrangler's `--secrets-file`; they are not browser configuration.

## Verified non-live evidence

GitHub Actions run `32019036397` proved the Worker contract tests and Wrangler dry-run bundle pass. Subsequent hardening pinned Wrangler and Playwright, switched all PAGES-005 Wrangler calls to the local pinned binary, and declared the Turso secrets as required bindings.

The PAGES-015 qualification orchestrator is also an explicit credential probe for the same `cloudflare-backend` environment. Its fresh receipt from `2026-08-20T11:29:03Z` (workflow run `32341388549`) still reports:

- `cloudflareApiTokenPresent=false`
- `cloudflareAccountIdPresent=false`
- `tursoDatabaseUrlPresent=false`
- `tursoAuthTokenPresent=false`
- `backendCredentialsReady=false`

Therefore no live Worker/Turso pair may currently be claimed and no `API_ORIGIN.txt` or `WORKER_ROLLBACK_WINDOW.json` may be synthesized.

## Live deployment identity

`.github/workflows/pages-005-cloudflare-backend.yml` and `scripts/pages005-bootstrap-live.sh` use Wrangler's structured NDJSON output as the source of deployment identity rather than scraping console text or trusting an inferred hostname.

For the bootstrap `wrangler deploy`, `WRANGLER_OUTPUT_FILE_PATH` must contain a successful `type="deploy"` entry with:

- exact `version_id`;
- at least one HTTPS deployment target.

The workflow normalizes that target to a bare HTTPS origin, rejects Vercel, waits until `/health` reports the same exact version ID, then performs a real independent Turso write/read round trip.

## Active + previous Worker rollback window

PAGES-015 requires two distinct Worker versions to remain addressable in the **current Cloudflare deployment**. PAGES-005 therefore bootstraps the window explicitly:

1. `wrangler deploy --secrets-file ...` creates and deploys the bootstrap version with the required Turso secrets.
2. `wrangler versions upload --secrets-file ...` uploads a distinct twin version without deploying it and captures its structured `version-upload.version_id`.
3. `wrangler versions deploy <active>@100% <previous>@0% -y` creates the current two-version deployment.
4. `scripts/probe-pages015-live-compatibility.mjs` targets each exact version using `Cloudflare-Workers-Version-Overrides` and requires the returned version-metadata ID to match.
5. Both versions must independently pass `/health` and a real Turso write/read round trip.
6. A browser running from the real GitHub Pages origin must pass the CORS health probe using the pinned Playwright runtime.
7. Immediately before committing locks, the exact Worker window and live Turso round trip are proved again.
8. Only after all proofs succeed are `backend/cloudflare/API_ORIGIN.txt` and `backend/cloudflare/WORKER_ROLLBACK_WINDOW.json` committed.

The locked Worker-window file records active and previous Version IDs, active=100%/previous=0%, Version Override proof, browser-CORS proof, live Turso proof, and the forward-only migration policy. The previous version receives no ordinary traffic at 0% but remains directly testable through Cloudflare Version Override.

## Failure behavior

Missing credentials, insufficient Cloudflare token permissions, propagation delay, identity mismatch, CORS failure, Turso failure, toolchain-version mismatch, or inability to prove both exact Worker versions prevents the lock files from being written. It does **not** block static presentation or local gameplay.

Never synthesize a `workers.dev` hostname, write placeholder Worker IDs, or commit `API_ORIGIN.txt`/`WORKER_ROLLBACK_WINDOW.json` merely to unblock downstream gates.

## Migration / rollback rule

Worker rollback changes executable Worker code/configuration only. Turso data is never rolled backward. Schema evolution must use additive expand/contract sequencing and remain compatible with active + previous Worker/frontend releases for the full rollback window.

## Official references

- Cloudflare GitHub Actions authentication: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Cloudflare Versions & Deployments: https://developers.cloudflare.com/workers/versions-and-deployments/
- Cloudflare Version Overrides: https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Wrangler Workers commands: https://developers.cloudflare.com/workers/wrangler/commands/workers/
- Wrangler structured output: https://developers.cloudflare.com/workers/wrangler/system-environment-variables/
- Cloudflare secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Turso TypeScript reference: https://docs.turso.tech/sdk/ts/reference
