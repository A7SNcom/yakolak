# Three.js Preview and Migration Hosting Contract

Status: **SUPERSEDED by PAGES-004 (2026-08-17)**

The Vercel Preview contract originally locked by THREEJS-009 is retained below only as historical evidence. It no longer governs where the Three.js migration frontend is published, how preview URLs are chosen, where the future backend runs, or how final cutover occurs.

Current authority: `PAGES_MIGRATION_CONTRACT.md`.

## 1. Current migration preview

The canonical migration frontend is the GitHub Pages subpath:

`https://a7sncom.github.io/yakolak/threejs/`

During migration the same Pages site keeps:

- `/yakolak/` = latest known-good Godot-ready root from `main/web`;
- `/yakolak/threejs/` = Three.js candidate from `threejs-rebuild/web`.

There is one site and one composite artifact. A Three.js update must not replace the Godot root before explicit cutover.

PAGES-001 owns this single-site layout. PAGES-002 owns the composite no-build Pages Actions deployment pipeline and its cross-branch triggers. PAGES-003 owns relocatable client/base-path behavior so the same Three.js files can later run at `/yakolak/`.

## 2. Backend boundary

GitHub Pages is static and cannot host the authoritative room API.

The Three.js client must reach online authority through one explicit public `API_ORIGIN` boundary. PAGES-005 selects and locks the non-Vercel backend runtime/provider and the public `API_ORIGIN`.

Until PAGES-005 closes:

- do not hard-code a new backend provider;
- do not treat same-origin `/api/...` as the migration contract;
- do not silently fall back to a historical Vercel endpoint;
- keep current `rules/` + `api/` semantics as backend/product evidence where still authoritative, without assuming their future hosting platform.

## 3. Current preview acceptance

A current Pages migration preview is acceptable only when:

- the root remains the approved Godot artifact during migration;
- the Three.js candidate is isolated under `/yakolak/threejs/`;
- module/static asset URLs work through the relocatable base-path contract;
- the public artifact contains no secrets or server-only credentials;
- online entry points use the selected `API_ORIGIN` once PAGES-005 provides it, and fail clearly if it is unavailable;
- no workflow or client path makes Vercel deployment state authoritative again.

## 4. Final cutover

Final cutover is not a Vercel promotion or alias switch.

A later explicit cutover task must:

1. choose one accepted Three.js artifact by exact source/content identity;
2. publish it at `/yakolak/` in the same GitHub Pages site;
3. deliberately retire the migration `/yakolak/threejs/` lane;
4. stop serving the Godot root only after health/protocol checks pass;
5. keep authoritative online services behind the selected `API_ORIGIN`;
6. preserve a tested rollback to known-good archived bytes/protocol-compatible backend state.

See `PAGES_MIGRATION_CONTRACT.md` for the complete binding contract.

---

# Historical THREEJS-009 Vercel Preview Evidence

Status at the time: **LOCKED by THREEJS-009 (2026-08-16)**

This section is intentionally non-normative after PAGES-004. It documents what was proven during the Vercel-era migration phase and may be used only for historical comparison/debugging.

## Historical single deployment path

THREEJS-009 used the existing Vercel project `yakolak` and its Preview environment:

- project: `yakolak` (`prj_bs47prs871H9tPwEwDVH8RMlCfHm`);
- team: `ahmdkcoms-projects` (`team_eaC5mTND8Ct6uEFQTQwdQJ5v`);
- migration branch: `threejs-rebuild`;
- `main` was kept on the Godot/Vercel Production path;
- the branch alias was treated as the one human-facing Vercel preview URL;
- alternate projects, production aliases and promotion were prohibited.

Those constraints were correct for THREEJS-009's historical Vercel phase. They are **not** the active hosting contract after PAGES-004.

## Historical API/environment behavior

The historical Vercel preview packaged repository `api/` functions and used Vercel Preview environment variables such as:

- `TURSO_DATABASE_URL`;
- `TURSO_AUTH_TOKEN`.

This proved the then-current backend could operate in Vercel Preview. It does not select Vercel as the future authoritative runtime. Private datastore credentials remain backend-only under the new architecture as well.

## Historical production-safety evidence

THREEJS-009 verified that `threejs-rebuild` preview deployments did not acquire the old Production alias and did not replace the Godot deployment. Those checks remain useful evidence that the migration was isolated at that time.

After PAGES-004, equivalent isolation is expressed by the GitHub Pages layout: Godot root + Three.js `/threejs/` candidate in one Pages site.
