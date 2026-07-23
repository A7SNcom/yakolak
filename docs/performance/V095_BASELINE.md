# Yakolak v095 Performance Baseline

This branch is an isolated performance-development copy created from the exact production deployment source.

- Baseline production URL: `https://yakolak.vercel.app/`
- Source commit: `98c565ed3efd18cb509a8c9f902dc71de7a1d09f`
- Branch: `feature/v095-performance-baseline`
- Created: `2026-07-23`
- Runtime behavior: unchanged from production at baseline

## Rules

1. Do not modify or merge into `main` while performance experiments are in progress.
2. Make one small optimization at a time.
3. Verify each Vercel Preview on desktop and mobile.
4. Record before/after measurements before keeping an optimization.
5. Preserve gameplay, positions, colors, intro timing, and calibration behavior unless explicitly requested.
