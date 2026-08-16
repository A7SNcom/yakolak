# Three.js Vercel Preview Contract

Status: **LOCKED by THREEJS-009 (2026-08-16)**

Scope: `threejs-rebuild` only. This document defines the one allowed non-Production deployment path for the Three.js migration. It does not authorize cutover, a second Vercel project, or any Production alias change.

## 1. Single deployment path

Use the existing Vercel project `yakolak` and its normal **Preview** environment.

- Vercel project: `yakolak` (`prj_bs47prs871H9tPwEwDVH8RMlCfHm`).
- Vercel team: `ahmdkcoms-projects` (`team_eaC5mTND8Ct6uEFQTQwdQJ5v`).
- Git branch allowed for migration Preview: `threejs-rebuild` only.
- `main` remains the Production/Godot path.
- `https://yakolak.vercel.app/` remains Production and must never be assigned to a `threejs-rebuild` deployment.
- Do not create another Vercel project, custom Production domain, staging project, migration branch, or alternate preview lane.

`vercel.json` on `threejs-rebuild` is intentionally branch-scoped: it enables Git deployment for `main` and `threejs-rebuild`, keeps the wildcard disabled, and makes the existing ignored-build rule continue immediately for `threejs-rebuild`. The equivalent `main` file remains unchanged, so this exception cannot loosen Production policy.

## 2. Preview URL: discovery and refresh

The canonical human-facing migration URL is the Vercel **branch alias** attached to the latest READY Preview deployment whose Git metadata says `githubCommitRef=threejs-rebuild`.

Discovery workflow:

1. Open the existing Vercel project `yakolak` -> Deployments.
2. Filter/identify the latest deployment with environment/target `Preview` and Git branch `threejs-rebuild`.
3. Confirm it is `READY`.
4. Use its `branchAlias` (the stable `*-git-threejs-rebuild-*.vercel.app` URL), not the per-deployment hash URL, as the one shared preview URL.
5. Confirm deployment metadata points to the expected `threejs-rebuild` commit SHA before testing.

Refresh workflow:

1. Commit the next Three.js migration change to `threejs-rebuild`.
2. Vercel creates a new Preview deployment in the same `yakolak` project.
3. Wait only for that deployment to reach `READY`; do not promote it.
4. The same branch alias moves to the new READY deployment automatically. No new project/domain/path is created.
5. Re-check the branch alias and deployment SHA before treating the refresh as current.

The immutable hash URL may be used for diagnosis, but it is not a second supported preview path and must not be circulated as the canonical migration URL.

## 3. API functions and environment variables

Preview uses the same repository `api/` functions as Production, packaged from the `threejs-rebuild` commit. No browser-side mock backend is allowed merely to make Preview work.

Required private-online-room variables are the existing contract from `.env.example`:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

They must exist in Vercel's **Preview** environment for `threejs-rebuild` (a branch-scoped Preview value is preferred when isolation is required). Secrets must never be committed to Git.

Operational verification before accepting a Preview:

- request a read-only/simple API route to prove the branch deployment packaged the Serverless Functions;
- exercise `/api/rooms` far enough to distinguish a valid configured service from `service_unavailable` caused by missing Turso credentials;
- if credentials are absent, configure them in Vercel Preview for `threejs-rebuild`; do not copy secret values into repository files;
- never use a Production-only environment target as a workaround.

## 4. Production-safety gate

A `threejs-rebuild` deployment is acceptable only when all are true:

- target/environment is Preview, never Production;
- Git metadata is `githubCommitRef=threejs-rebuild`;
- the stable branch alias is the only canonical migration URL;
- aliases do not include `yakolak.vercel.app` or `yakolak-git-main-ahmdkcoms-projects.vercel.app`;
- `yakolak.vercel.app` still resolves to a READY deployment from `main`;
- no domain was added/transferred and no deployment was promoted.

If any check fails, the Preview must not be used and the alias/configuration must be corrected before further migration testing.

## 5. Cutover boundary

THREEJS-009 creates Preview capability only. It grants no authority to merge/copy the rebuild to `main`, promote a deployment, attach the Production alias, modify Production environment variables, or replace the Godot site. Those actions require the later explicit cutover task recorded by the migration contracts.
