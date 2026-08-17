# YAKOLAK GitHub Pages Origin, Storage and Cross-Origin Security Contract

Status: **LOCKED by PAGES-006 (2026-08-17)**

Scope: the GitHub Pages browser client, every YAKOLAK browser persistence surface, and every cross-origin request to the authoritative `API_ORIGIN`.

## 1. One browser origin, not one path origin

The browser origin is exactly:

`https://a7sncom.github.io`

Both `/yakolak/` and `/yakolak/threejs/` are paths on that same origin. CORS, Web Storage, IndexedDB, CacheStorage and BroadcastChannel do not provide a security boundary between those paths. No backend authorization decision may trust the request because it came from `/yakolak/`, `/yakolak/threejs/`, or another path on `a7sncom.github.io`.

CORS is only a browser read-policy. It is not seat authentication and it is not room authorization.

## 2. Seat authorization is credential + backend state

Every online mutation that acts as a player seat must be authorized by the backend using all of the following:

- a high-entropy opaque seat bearer credential;
- the room identity and claimed seat;
- the currently valid credential generation for that seat;
- current authoritative room/protocol state;
- mutation/version/idempotency rules required by the room contract.

The current backend already hashes bearer values before matching them to seat ownership. That remains the minimum semantic requirement when the authoritative runtime moves away from Vercel.

CORS success, a Pages pathname, UI state, LocalStorage content, BroadcastChannel content, or a client-supplied seat id is never sufficient authority.

## 3. CORS contract for `API_ORIGIN`

For browser API routes:

- allow `Origin: https://a7sncom.github.io` exactly;
- do not attempt pathname allowlisting through CORS; the Origin header does not contain a path;
- return `Vary: Origin` on origin-dependent responses;
- do not use `Access-Control-Allow-Origin: *` for authenticated room routes;
- bearer auth uses the `Authorization` header, not a cross-site cookie;
- omit `Access-Control-Allow-Credentials` unless a later explicit contract introduces cookies;
- preflight allows only the methods and request headers actually required by the endpoint;
- a disallowed Origin receives no permissive CORS headers, but backend authentication is still enforced independently for every caller.

`API_ORIGIN` is public configuration. Datastore/admin credentials are never frontend configuration.

## 4. YAKOLAK owns only YAKOLAK browser storage

Every LocalStorage key, SessionStorage key, IndexedDB database name, CacheStorage cache name and BroadcastChannel name created by the rebuild must begin with:

`YAKOLAK:v1:`

Canonical builders live in `web/app/security/pages-origin-security.js`.

No YAKOLAK code may call `localStorage.clear()`, `sessionStorage.clear()`, or any equivalent broad delete that can erase data belonging to another application on the shared `a7sncom.github.io` origin. Cleanup enumerates/removes only names beginning with the YAKOLAK prefix. IndexedDB deletion targets one explicit YAKOLAK database name. CacheStorage deletion filters by the YAKOLAK prefix.

## 5. Bearer persistence rule

The seat bearer credential is **memory-only by default and by contract**.

It must not be written to LocalStorage, SessionStorage, IndexedDB, CacheStorage, service-worker caches, BroadcastChannel messages, analytics, URLs, console logs, Actions logs, crash reports or static configuration.

A tab may retain the bearer in normal in-memory application state while that tab is alive. Rendering/context recovery must not recreate or broaden that authority.

## 6. Reload/recovery without persistent bearer storage

If reload recovery is required, the backend may issue a separate opaque recovery handle with all of these properties:

- it is not accepted as a gameplay bearer credential;
- it is scoped to one room + seat;
- it expires in at most 5 minutes;
- it is single-use;
- it may be kept only in namespaced SessionStorage;
- successful exchange deletes the recovery handle immediately and returns a newly rotated in-memory seat bearer;
- failed/expired exchange leaves the client unauthenticated and requires an explicit rejoin/recovery path.

LocalStorage persistence of either the bearer or the recovery handle is forbidden.

## 7. Takeover and multi-tab rules

A seat has one current credential generation.

An explicit takeover/recovery operation is atomic on the backend: validate the recovery authority, rotate to a new high-entropy seat credential, increment/replace the seat credential generation, and invalidate the prior generation immediately. The old tab may continue rendering cached state but all later authoritative requests with the old bearer must be rejected.

BroadcastChannel may announce non-secret events such as `seat-generation-changed`, room id, seat id and state-version hints. It must never transmit the bearer or recovery handle. Receiving a takeover notice forces reconciliation/re-authentication; it never grants authority by itself.

Reconnect after a network drop in the same live tab may reuse the current in-memory bearer. Reconnect after reload uses the one-time recovery flow or an explicit user rejoin; it never silently reconstructs authority from public identifiers.

## 8. Public artifact and GitHub Actions secret boundary

The GitHub Pages artifact may contain public static code/assets and public `API_ORIGIN` only. It must never contain or interpolate:

- datastore URLs that are private credentials;
- datastore auth tokens;
- admin/service-role keys;
- backend signing/encryption secrets;
- provider API tokens used to administer the backend.

Pages assembly/deploy workflows must not receive those backend secrets at all. A secret that is not required by the static deployment job must not be present in its `env`, command arguments, generated files, artifacts, debug output or logs.

Backend runtime secrets belong only in the selected backend provider secret store. Logs must redact bearer/recovery values and never print authorization headers.

## 9. Enforcement

`tests/pages_origin_storage_security.test.mjs` locks the origin model, YAKOLAK namespace, scoped cleanup behavior, bearer/recovery persistence policy, and scans the public `web/` artifact for broad Web Storage clears and known backend secret bindings.

`.github/workflows/pages-006-origin-security.yml` runs the contract test with `contents: read` and no secrets.

Any later task that needs to weaken one of these rules must explicitly supersede PAGES-006 and document the replacement threat model before implementation.
