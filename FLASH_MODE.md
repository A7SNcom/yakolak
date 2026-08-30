# YAKOLAK Flash Mode

The only active development and publish loop is:

`GitHub main source change -> YAKOLAK Flash Publish -> Godot Web export only -> [flash-ready] -> Vercel production -> https://yakolak.vercel.app/`

Automatic gameplay, Playwright, regression, latency, visual, and quality test workflows are not part of the daily publish path.

- Fast publisher: `.github/workflows/online-build-publish.yml`
- Minimal exporter: `scripts/vercel-flash-build.sh`
- Production URL: https://yakolak.vercel.app/
- Heavy tests remain in the repository and should be run manually only when explicitly requested.
- PCLOCAL, Three.js, GitHub Pages, old branches, and old deployment generations are historical READ-ONLY references only and must never be used as an executable fallback.
