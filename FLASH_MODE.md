# YAKOLAK Flash Mode

`GitHub main -> Godot Web export -> web/ -> GitHub Pages`

- Preview: https://a7sncom.github.io/yakolak/
- Publisher: `.github/workflows/online-build-publish.yml`
- Exporter: `scripts/godot-flash-build.sh`
- `[flash-ready]` publishes the committed export without rebuilding.
- Heavy tests run manually only when requested.
- Vercel is canceled. Pages is static hosting; online rooms require a separate server.
- Legacy engines and branches are historical references only.
