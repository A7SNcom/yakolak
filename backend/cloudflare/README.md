# Yakolak Cloudflare backend

This directory is the selected non-Vercel runtime for the GitHub Pages migration.

- Worker: `yakolak-room-api`
- frontend security origin: `https://a7sncom.github.io`
- datastore: existing Turso Cloud credentials
- configuration: `wrangler.jsonc`
- runtime entry: `src/worker.js`
- live proof: `node ../../scripts/probe-pages005-cloudflare-roundtrip.mjs "$API_ORIGIN"`

## Required deployment secrets

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` must be supplied by the GitHub `cloudflare-backend` environment. Do not commit secret values.

## Local verification

From repository root:

```sh
npm install --ignore-scripts
node --test tests/pages_backend_runtime_contract.test.mjs
npx wrangler@4 deploy --dry-run --config backend/cloudflare/wrangler.jsonc
```

## Public origin lock

Do not invent a `workers.dev` hostname. After the first authenticated deploy, run the live round-trip probe against the exact deployment URL. Only a passing URL may be recorded as `backend/cloudflare/API_ORIGIN.txt` and exposed to the GitHub Pages client.

See `PAGES_BACKEND_RUNTIME.md` for the decision matrix and rollback contract.
