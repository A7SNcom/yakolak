# PAGES-009 — Secret-free public Pages artifact and runtime config contract

Status: **IMPLEMENTED**

Date: 2026-08-17

## Public artifact rule

GitHub Pages is a public static delivery target. The deployed artifact may contain only browser-required runtime files plus harmless public metadata. Anything copied into the Pages artifact must be assumed permanently readable by any visitor.

Allowed public metadata is intentionally small:

```json
{
  "frontendSha": "<threejs commit sha>",
  "protocolVersion": "1",
  "apiOrigin": "https://<approved-backend-origin>" | null,
  "environment": "production",
  "branch": "threejs-rebuild",
  "apiOriginState": "configured" | "absent" | "invalid"
}
```

`apiOrigin` is public routing information, never a credential. Database URLs/tokens, Cloudflare credentials, bearer credentials, signing material, GitHub tokens, `.env` files, server configuration, privileged debug controls, backend source/configuration, CI files and developer-only artifacts are forbidden from the Pages tar.

## API_ORIGIN source and fail-closed behavior

The deploy workflow may read `backend/cloudflare/API_ORIGIN.txt` from the exact Three.js candidate only after PAGES-005 has created that file from a proven live deployment. No hostname is guessed and no Vercel fallback exists.

At deploy time:

- missing file -> publish `apiOrigin: null`, `apiOriginState: "absent"`;
- malformed, non-HTTPS, credentialed, pathful, or `*.vercel.app` value -> publish `apiOrigin: null`, `apiOriginState: "invalid"`;
- valid credential-free HTTPS origin -> publish that exact origin with `apiOriginState: "configured"`.

The static/local game remains bootable when online configuration is absent or invalid. Browser online code must pass through `requireOnlineRuntimeConfig()` from `web/app/core/public-runtime-config.js`; it throws `ONLINE_UNAVAILABLE` with a clear reason unless both protocol version and API origin are compatible. No browser code may silently fall back to `/api`, Vercel, localhost, or another historical service.

The build marker now reads the static `runtime-config.json`; it does not contact `/api/build-info`.

## Deploy-time sanity scan

`scripts/pages-public-artifact-scan.sh` runs against the fully composed `pages-site` immediately before upload. It rejects:

- `.env*`, private keys, certificate/key containers and SSH key files;
- `.git`, `.github`, `backend`, `api`, `scripts`, `tests`, `node_modules` and package/deployment configuration;
- database files/configuration;
- common private-key, GitHub token, cloud token, live payment key and database credential signatures in text content;
- symbolic links and hard links;
- a missing or malformed `threejs/runtime-config.json`;
- unexpected runtime-config fields;
- an incompatible protocol value;
- a credentialed/non-HTTPS/pathful/Vercel public API origin.

The scan is deliberately lightweight and appropriate for a public repository: it is an artifact boundary check, not a claim that regex scanning replaces secret management.

## Online entry-point contract

Every current or future Three.js online entry point must resolve the deployed public runtime config first and call `requireOnlineRuntimeConfig()` before creating a room, joining a room, restoring an online session, polling, submitting a move, or opening any online transport.

If the guard fails, the UI must present online play as unavailable and keep local/offline play usable. It must not attempt a network request to a previous endpoint.

## Ownership

- PAGES-005 owns provider selection and the proven canonical value of `backend/cloudflare/API_ORIGIN.txt`.
- PAGES-009 owns what may enter the public Pages artifact, public runtime metadata shape, client fail-closed config semantics and deploy-time public-artifact scanning.
- Database/admin secrets remain server-side only and never cross this boundary.
