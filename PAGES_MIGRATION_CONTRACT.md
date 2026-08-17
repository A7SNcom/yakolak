# YAKOLAK GitHub Pages Migration Contract

Status: **LOCKED by PAGES-004 (2026-08-17)**

Scope: `threejs-rebuild` migration documentation and every later deployment/backend decision until an explicit cutover or hosting-migration task supersedes this contract.

This file is the deployment-boundary authority for the migration. Where an older migration document, completed `THREEJS-*` task, Vercel deployment, `vercel.json`, or historical URL disagrees with this file, **this file wins for future deployment/backend decisions**. Historical Vercel work remains evidence of what was tested at that time only.

## 1. Static frontend target

The migration frontend target is **GitHub Pages**, not Vercel.

Public project site:

- site origin: `https://a7sncom.github.io`
- project root: `https://a7sncom.github.io/yakolak/`
- migration Three.js path: `https://a7sncom.github.io/yakolak/threejs/`

GitHub Pages serves static browser files only. It does not become the interactive room server and does not own gameplay authority.

## 2. One-site migration layout

Until explicit final cutover, one GitHub Pages artifact contains two deliberately separated frontend trees:

```text
/yakolak/           latest known-good Godot-ready root from main/web
/yakolak/threejs/   Three.js candidate from threejs-rebuild/web
```

Rules:

1. The root stays Godot during migration.
2. A `threejs-rebuild` change may refresh only the `/threejs/` candidate portion of the composite site; it must not silently replace the root game.
3. The candidate must be relocatable: no runtime code may hard-code `/yakolak/` or `/threejs/` as an environment-specific truth. PAGES-003 owns the base-URL implementation.
4. Final cutover is a separate explicit action that moves the accepted Three.js bytes to `/yakolak/` and retires the migration subpath deliberately.
5. No second GitHub Pages site, migration repository, production domain, or competing frontend deployment lane is authorized.

PAGES-001 established the one-site root-Godot + `/threejs/` layout. PAGES-002 owns the composite no-build Pages Actions pipeline and cross-branch trigger contract. PAGES-003 owns relocatable client URLs/base paths.

## 3. GitHub Actions owns frontend publishing

GitHub Pages publishing is owned by the controlled Pages Actions pipeline.

The canonical pipeline must use the official Pages deployment actions and the `github-pages` environment with the minimum required permissions. It composes one artifact from the approved Godot root source plus the current Three.js candidate and verifies the artifact before deployment.

A normal Three.js HTML/CSS/JS edit remains no-build: Pages publishing may assemble/copy/verify static bytes but must not introduce a bundler, Godot export, npm application build, or heavy regression gate into the ordinary Three.js edit-to-preview path.

The Godot `[flash-ready]` mechanism may continue only as the migration source of the known-good root artifact while the root is intentionally Godot. It is not the future Three.js deployment model.

## 4. Vercel-era work is historical evidence only

Completed Vercel-era migration work—including Vercel Preview aliases, deployment IDs, `yakolak.vercel.app`, branch-preview rules, Vercel project settings, Vercel Function packaging, Node-runtime observations, and Vercel-specific cache/header behavior—may be retained in repository history and old task evidence.

It must **not** govern any new decision about:

- where the Three.js frontend is published;
- which branch/path is the migration preview;
- how the final frontend cutover occurs;
- which runtime hosts the authoritative online backend;
- how frontend and backend origins are composed;
- which serverless/runtime limits later protocol work must target;
- future cache/header/service-worker strategy.

A Vercel URL may still exist or remain useful to compare historical behavior, but it is not the migration deployment source of truth after PAGES-004.

## 5. `API_ORIGIN` is the frontend/backend boundary

GitHub Pages is static and cannot host `api/` server functions. Every online-capable Three.js client therefore crosses one explicit public backend boundary:

```text
GitHub Pages client -> API_ORIGIN -> authoritative room/backend runtime
```

Rules:

1. `API_ORIGIN` is public runtime configuration, not a secret.
2. Browser code must not assume same-origin `/api/...` merely because historical Vercel deployments used it.
3. Transport code owns construction of backend URLs from `API_ORIGIN`; scene/UI modules never hard-code backend hosts.
4. Private datastore/admin credentials remain backend-only and never enter the Pages artifact, source-visible config, or browser storage.
5. If `API_ORIGIN` is missing/incompatible, offline/local play may continue where its own contract permits, but online entry points must fail clearly as unavailable rather than falling back to an old Vercel endpoint.
6. PAGES-005 selects and locks the non-Vercel authoritative backend provider/runtime and one public `API_ORIGIN`. Until that task closes, documentation and implementation must not invent a provider-specific runtime contract.

Current `rules/` + `api/` behavior remains valuable authoritative product/protocol evidence until an explicit backend migration changes those semantics; that does **not** imply that Vercel remains the future host for those semantics.

## 6. Security/origin rule

The browser origin for the Pages site is `https://a7sncom.github.io`. URL paths do not create separate security origins, so `/yakolak/` and `/yakolak/threejs/` cannot be treated as different origins for authorization.

Authorization must depend on backend-validated, high-entropy session/seat credentials and protocol state—not CORS/path trust. PAGES-006 owns the detailed storage, CORS, cross-origin and recovery model.

## 7. Final cutover contract

Final frontend cutover requires an explicit later task and must satisfy all of the following:

1. Select one accepted Three.js release candidate by exact source/content identity.
2. Publish those accepted Three.js bytes at `/yakolak/` in the same GitHub Pages site.
3. Remove/retire the migration `/yakolak/threejs/` lane deliberately so two live clients do not compete.
4. Stop using the Godot root artifact only after the accepted Three.js root passes the cutover health checks.
5. Keep online authority behind the explicitly selected `API_ORIGIN`; Pages never absorbs backend secrets or server logic.
6. Coordinate frontend protocol compatibility with the selected backend runtime and active-room migration/rollback rules.
7. Rollback must redeploy known-good archived bytes/protocol-compatible state, not rebuild an approximation from mutable branch heads. PAGES-012 owns immutable release assets/manual rollback.
8. No Vercel promote/alias/domain switch is part of the final frontend cutover contract.

Until that cutover task completes, the migration invariant remains: **Godot root + Three.js `/threejs/` candidate inside one GitHub Pages site.**

## 8. Documentation precedence

For migration deployment/backend-hosting questions, use this order:

1. `PAGES_MIGRATION_CONTRACT.md` and completed `PAGES-*` contracts for hosting/deployment/origin boundaries.
2. `THREEJS_SOURCE_OF_TRUTH.md` for product/spatial/backend semantics by domain.
3. `THREEJS_BACKEND_GAP_REGISTER.md` for unresolved authority/protocol decisions and task ownership.
4. `THREEJS_MIGRATION.md` for browser/runtime architecture.
5. Vercel-era task reports and deployment records as historical evidence only.

No historical document may silently restore Vercel as the migration frontend target or future backend runtime.