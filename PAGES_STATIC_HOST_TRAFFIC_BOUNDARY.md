# PAGES-013 — Static-host / traffic operating boundary and GitHub policy snapshot

Status: **LOCKED**

Execution checkpoint: **2026-08-17T18:59Z** (`2026-08-17 21:59 +03:00`)

This contract keeps mutable GitHub platform policy separate from YAKOLAK's intentionally stricter internal delivery budgets. GitHub documentation must be re-read at execution time and at every later release checkpoint; a timestamped snapshot is evidence of what GitHub said at that checkpoint, not an architecture constant that may be assumed forever.

## Static-host operating boundary

GitHub Pages is only the public static-host layer for YAKOLAK. It may serve browser-required immutable/static files and harmless public metadata such as frontend identity, protocol version and public `API_ORIGIN`.

GitHub Pages must never become or contain:

- authoritative room/game state;
- request-time room/backend logic;
- database access or database credentials;
- backend/admin secrets;
- seat/bearer minting or signing authority;
- privileged debug/admin controls;
- any server-side credential or secret-bearing configuration.

The online boundary remains:

```text
GitHub Pages static client -> public API_ORIGIN -> authoritative backend runtime -> approved datastore
```

`API_ORIGIN` is public routing metadata, not authority. Backend validation and backend-held credentials remain authoritative regardless of which static host serves the frontend.

## Current official GitHub policy snapshot

The following was re-read from current official GitHub documentation at the execution checkpoint above:

| Platform fact | Current official wording / effect |
| --- | --- |
| Pages source repository | **Recommended limit: 1 GB** |
| Published Pages site | **Maximum: 1 GB** |
| Pages deployment | **Times out after 10 minutes** |
| Pages bandwidth | **Soft limit: 100 GB per month** |
| Pages build frequency | **Soft limit: 10 builds per hour**, but this limit **does not apply** when the site is built and published with a custom GitHub Actions workflow |
| Pages request rate limiting | May apply; a limited request receives HTTP **429** with an informative HTML response |
| Regular Git file | GitHub **blocks files larger than 100 MiB** |
| Git LFS | **Cannot be used with GitHub Pages sites** |

Official sources re-read for this snapshot:

- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage

Do not silently rewrite GitHub's `GB` wording as `GiB`, and do not derive an internal architectural constant from a mutable external policy value.

## Decimal GB versus binary MiB

GitHub's Pages documentation currently says **1 GB**. YAKOLAK's internal guards are expressed in binary **MiB** and stay unchanged:

- composite published tree: **128 MiB** = **134,217,728 bytes**;
- each route cold-cache envelope: **64 MiB**;
- any one published/committed runtime file: **64 MiB**;
- repository API-reported size budget: **512 MiB**.

For documentation only, comparing the current official `1 GB` wording as 1,000,000,000 bytes with the 128 MiB internal tree budget gives:

- internal tree budget is about **13.42%** of 1 GB;
- remaining byte headroom is about **86.58%**;
- current platform-to-internal ratio is about **7.45x**, not an exact `8x`.

This comparison is descriptive and must be recalculated if GitHub changes its policy wording. It does **not** change the 128/64/512 MiB internal guards.

## Release-checkpoint rule

Before qualifying or publishing any future release:

1. Re-open the current official GitHub Pages limits, large-files, and Git LFS documentation listed above.
2. Record the UTC timestamp of the review.
3. Record any changed wording or limits separately from YAKOLAK's internal budgets.
4. If a platform policy has become stricter than an internal guard, stop release qualification and adapt the static-host/delivery architecture deliberately; never raise an internal guard just to make a release pass.
5. If GitHub has relaxed a platform limit, do not automatically relax YAKOLAK's internal guard. That requires a separate explicit architecture decision.
6. Keep the custom-Actions build-frequency exemption distinct from the general Pages soft 10-builds/hour policy; never re-introduce an unnecessary build-rate gate into the normal custom Pages workflow merely because the generic limit exists.

### Policy snapshot ledger

| Checked at (UTC) | Pages source / published site | Deploy / bandwidth / build | Regular Git / LFS | Result |
| --- | --- | --- | --- | --- |
| 2026-08-17T18:59Z | 1 GB recommended source; 1 GB max published | 10 min; 100 GB/month soft; 10 builds/hour soft exempt for custom Actions; 429 may apply | >100 MiB blocked; LFS not usable for Pages | PAGES-013 baseline locked |

Future release checkpoints append a new row; they do not rewrite old rows as though past policy had always matched the newest policy.

## Traffic and host-growth decision rule

The 100 GB/month value is a soft platform traffic policy, not YAKOLAK's backend capacity budget and not an authorization mechanism. Rate limiting or static-host saturation must never shift room authority into Pages/browser code.

If policy, traffic, latency, cache economics, or static asset volume makes GitHub Pages unsuitable:

1. migrate **only the public static-host/delivery layer** through an explicit tested cutover;
2. keep GitHub as source/control and retain exact-byte release/rollback provenance;
3. keep authoritative online behavior behind the separately selected backend runtime and `API_ORIGIN` boundary;
4. do not move database credentials, signing authority, bearer minting, room authority, or request-time backend logic into the replacement static host;
5. verify new-host caching, MIME/CORS/range behavior, exact-byte integrity, rollback and failure behavior before cutover;
6. keep the backend migration question separate unless a different explicit backend task changes it.

A static-host migration therefore does not implicitly authorize a backend migration, and a backend migration does not implicitly authorize a frontend static-host change.

## Related authorities

- `PAGES_MIGRATION_CONTRACT.md` — migration deployment/backend boundary and precedence.
- `PAGES_PUBLIC_ARTIFACT_CONTRACT.md` — exact public-artifact/secret-free boundary.
- `PAGES_SIZE_GUARDRAILS.md` — stricter internal MiB delivery/repository budgets.
- `PAGES_BACKEND_RUNTIME.md` — authoritative backend-provider boundary.
- `PAGES_RELEASE_ARCHIVES.md` and `RELEASE_QUALIFICATION/` — exact-byte release and qualification evidence.
