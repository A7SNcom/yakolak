# YAKOLAK Flash Mode

PAGES-004 changes only the delivery owner; the fast Godot export remains useful while Godot intentionally occupies the migration root.

Current Godot loop during migration:

`main source change -> GitHub Godot Web export -> [flash-ready] -> eligible Godot root for composite GitHub Pages artifact`

- Fast exporter/source workflow: `.github/workflows/online-build-publish.yml`.
- Minimal exporter remains `scripts/vercel-flash-build.sh`; its legacy filename does **not** make Vercel the current deployment authority.
- A normal `main` push is not itself the new Pages root; the composite pipeline consumes an eligible `[flash-ready]` result.
- Three.js changes on `threejs-rebuild` are composed separately under `/yakolak/threejs/` and must not trigger Godot export.
- GitHub Actions/Pages owns static frontend publishing under `PAGES_MIGRATION_CONTRACT.md` / PAGES-002.
- Automatic broad gameplay/Playwright/regression/latency/visual gates are not part of the daily export path unless a task/release gate explicitly requires them.

Historical Vercel Production/Preview behavior may still be used as evidence for old runs, but it is non-normative after PAGES-004.