# YAKOLAK Flash Mode

The default development loop is now:

`main source change -> GitHub Godot Web export only -> [flash-ready] -> Vercel production`

Automatic gameplay, Playwright, regression, latency, visual, and quality test workflows are not part of the daily publish path.

- Fast publisher: `.github/workflows/online-build-publish.yml`
- Minimal exporter: `scripts/vercel-flash-build.sh`
- Production URL: https://yakolak.vercel.app/
- Heavy tests remain in the repository and should be run manually only when explicitly requested.
