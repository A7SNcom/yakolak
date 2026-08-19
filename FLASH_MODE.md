# YAKOLAK Flash Mode

PAGES-004 changes only the delivery owner; the fast Godot export remains useful while Godot intentionally occupies the migration root.

Current Godot loop during migration:

`main source change -> GitHub Godot Web export -> [flash-ready] -> eligible Godot root for composite GitHub Pages artifact`

- Fast exporter/source workflow: `.github/workflows/online-build-publish.yml`.
- Minimal exporter remains `scripts/vercel-flash-build.sh`; its legacy filename does **not** make Vercel the current deployment authority.
- A normal `main` push is not itself the new Pages root; the composite pipeline consumes an eligible `[flash-ready]` result.
- Ordinary Three.js frontend pushes no longer fan out into task-specific regression workflows. Only the tiny `YAKOLAK Pages Three.js Signal` bridge runs on relevant `web/**` changes, because the repository's `github-pages` environment currently rejects deployments whose workflow head branch is `threejs-rebuild`.
- The bridge does not build, test, compose, upload, or deploy anything. The default-branch `YAKOLAK Composite Pages` workflow remains the sole Pages deployment owner and receives the exact Three.js push SHA through `workflow_run`.
- Completed task-specific regression workflows are retired from automatic pushes. Optional consolidated checks live in `.github/workflows/threejs-optional-checks.yml` and are manual only; the immutable vendor refresh is also manual only.
- THREEJS-059 gameplay/rules/lifecycle coverage is available locally or in that manual workflow through `npm run test:threejs:gameplay`; it is deterministic Node-only coverage and is **not** a push/Pages/daily gate.
- `PAGES-006 origin and storage security` is manual regression coverage, not a daily deployment gate.
- `PAGES-005 Cloudflare backend` may retain its narrowly targeted backend-only verification while that backend migration is active; it is not part of ordinary frontend edit-to-Pages delivery.
- GitHub Actions/Pages owns static frontend publishing under `PAGES_MIGRATION_CONTRACT.md` / PAGES-002.
- Automatic broad gameplay/Playwright/regression/latency/visual gates are not part of the daily export path unless a task/release gate explicitly requires them.

## Cutover rule

`YAKOLAK Flash Publish` exists only to keep producing the temporary Godot root during migration. The explicit final Three.js cutover must disable its automatic `main` trigger after the accepted Three.js candidate becomes the root. It must not remain as a hidden post-cutover build/deploy lane.

Historical Vercel Production/Preview behavior may still be used as evidence for old runs, but it is non-normative after PAGES-004.
