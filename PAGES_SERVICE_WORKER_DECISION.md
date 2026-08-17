# PAGES-011 — Measured Service Worker and cache-scope decision

Status: **VERIFIED**

Date: 2026-08-17

Target: `https://a7sncom.github.io/yakolak/` and `https://a7sncom.github.io/yakolak/threejs/`

SERVICE_WORKER_DECISION=none

## Decision

Keep Service Workers off. The current GitHub Pages/browser HTTP cache is the migration baseline and is already producing a strong repeat-load result without adding a second cache authority.

PAGES-010 established the prerequisite delivery facts on the real Pages artifact: successful resources currently return `Cache-Control: max-age=600`; `ETag` and `Last-Modified` validators revalidate to `304`; runtime payload URLs are already content-addressed with `?v=<git-blob-sha>`; the current loader performs full GETs; and there are currently no packaged font/audio requests. Those are observations of the live Pages service, not custom-header assumptions.

## Live browser proof

Temporary GitHub Actions run `32032833893` used Playwright Chromium 140 against the real public Pages site from a clean browser profile. The probe visited the Godot root first, reloaded it, then visited and reloaded the Three.js migration path in the same profile so a root-scoped worker had an opportunity to install before the candidate path was checked.

All four scope checks reported `navigator.serviceWorker.controller === null` and `navigator.serviceWorker.getRegistrations()` as an empty array:

- `/yakolak/` first load: no controller, zero registrations.
- `/yakolak/` repeat load: no controller, zero registrations.
- `/yakolak/threejs/` after visiting root: no controller, zero registrations.
- `/yakolak/threejs/` repeat load: no controller, zero registrations.

The separate cold/repeat Three.js measurement also reported zero Service-Worker-served responses and zero registrations on both passes.

### Generated Godot helper is inert, not a registration

The preserved Godot root's generated `index.js` contains Godot's generic `Engine.installServiceWorker()` support helper, including a dormant `navigator.serviceWorker.register(this.config.serviceWorker)` code path. The delivered root `index.html` does **not** configure a truthy `GODOT_CONFIG.serviceWorker`, and no Service Worker script is packaged. That is consistent with the live proof above: the helper is library capability, not an installed or active worker.

The final composed-artifact scanner therefore permits only this exact generated root helper when the delivered `GODOT_CONFIG` can be parsed and proves `serviceWorker` absent/empty/false. Any packaged worker script, any additional registration call, an unparseable root configuration, or a truthy Godot `serviceWorker` setting fails closed while this decision remains `none`.

## Repeat-load evidence

The measurement used a second clean browser profile so the first Three.js pass was cold.

| Measurement | Cold | Immediate repeat |
| --- | ---: | ---: |
| YAKOLAK requests observed | 39 | 39 |
| Browser cache events | 0 | 19 |
| Disk-cache responses | 0 | 18 |
| Service-Worker responses | 0 | 0 |
| CDP encoded wire bytes | 16,057,384 | 662 |
| ResourceTiming transfer bytes | 16,050,110 | 503 |
| zero-transfer resource entries | 0 | 37 of 38 |

The repeat pass was therefore served almost entirely by the ordinary browser cache. Chromium reported cached responses as successful `200` responses instead of producing a `304` round trip because the current `max-age=600` entries were still fresh; this complements, rather than replaces, the PAGES-010 validator proof that explicit revalidation returns `304`.

No warm-cache number may replace or relax THREEJS-017 cold-load budgets. The 16,057,384-byte cold wire observation remains visible here specifically so a warm reload cannot be used to hide a cold-load regression.

## Why `none` wins

Enabling a Service Worker has the burden of proof. The measured native cache already reduces this immediate repeat from about 16.06 MB of wire traffic to 662 bytes while introducing no worker lifecycle, cache-version, stale-config, credential, scope, or rollback state. There is no measured incremental benefit that justifies adding those failure modes during migration.

Therefore no worker registration, worker script, precache manifest, or CacheStorage fetch interception should be added for the migration candidate under this decision.

## Mandatory contract if a later measured task proposes `enabled`

A later task may change the decision only through a new explicit measured cache-scope decision; it may not infer permission from a performance task or silently add worker registration. Any future enabled design must satisfy all of these before activation:

1. During migration, worker scope is limited to `/yakolak/threejs/`; it must never control `/yakolak/`.
2. Cache names are namespaced by `YAKOLAK` plus the exact frontend build identity and protocol version so generations cannot share ambiguous cache state.
3. API responses, authorization/session responses, seat credentials, bearer material, and any request carrying privileged identity are never written to CacheStorage.
4. `runtime-config.json` is always network-pass/network-only and is never fulfilled from a Service Worker cache.
5. PAGES-014 `deployment-manifest.json` is always network-pass/network-only and is never fulfilled from a Service Worker cache, so provenance cannot pin an obsolete generation.
6. Cold-load THREEJS-017 budgets remain independently measured with worker/browser caches cleared. Warm-cache wins can never excuse a cold-load regression.
7. Rollback/update tests must prove that old cache namespaces cannot keep an obsolete API origin, protocol generation, frontend generation, or privileged state alive.

## THREEJS-097 consumption rule

THREEJS-097 must read this file and consume the decision marker before implementing cache/update behavior. With the current decision it must preserve the no-Service-Worker baseline. It may optimize ordinary HTTP/browser-cache usage, content-addressing, and update behavior, but it may not register a Service Worker or reinterpret the decision as permission to do so.

If THREEJS-097 finds this file missing, the marker malformed, or a later decision contradictory without fresh measured evidence, it must fail closed and leave Service Workers off rather than choosing a policy itself.

## Post-hardening production proof

After the composed-artifact guard was hardened to distinguish the inert generated Godot helper from an active registration, the normal composite Pages workflow successfully deployed the guarded artifact in run `32042174607` (attempt 5).

The successful compose used Godot root `fbc0d15c574a40c4a9f31c96d42c2f03b424bb39` and Three.js candidate `77f23a8db9be61c508be2700c41baf12c1db348c`. The PAGES-011 final-artifact scan passed with the explicit message that the Godot helper was verified inert by the delivered `GODOT_CONFIG`; the Pages inventory was 78 files / 83,936,022 bytes and remained inside the PAGES-007 internal budgets. The uploaded `github-pages` artifact ID was `9292187198`.

`actions/deploy-pages@v4` then reported success, and the workflow's HTTP smoke passed for the public root, `/threejs/`, and `/threejs/runtime-config.json`, with `frontendSha=77f23a8db9be61c508be2700c41baf12c1db348c`.

The branch later advanced from that deployed candidate to the current PAGES-011 cleanup state only through decision-document and regression-test changes; no `web/**`, runtime asset, or deploy-scanner bytes changed after the published `77f23a8` candidate. Therefore no additional production deploy is required merely to publish the evidence/cleanup commits.

## Evidence lifecycle

The live browser workflow used to obtain run `32032833893` is temporary measurement scaffolding and must be removed after this decision and its regression guard are committed. The durable evidence is this report plus the normal repository regression test; PAGES-011 does not add a permanent per-push browser workflow.
