# YAKOLAK 2.8 — Approved Baseline

Approved on 2026-08-05 after direct visual review.

## Permanent recovery point

- Approved source commit: `df2c822c748c79b85dde6f948340dcd8cbebe526`
- Frozen recovery branch: `approved/yakolak-2.8-v129-loader`
- Approved implementation branch: `adopt/yakolak-2.8-approved-baseline`

## Locked visual contract

### Loading screen

The loading animation must remain the exact motion from `agent/v129-loading-star-motion`:

- White background: `#ffffff`
- Star color: `#3f3f3f`
- Cycle: `820ms`
- Vertical bounce only; no horizontal rolling
- Impact frame: `translateY(36px) scale(1.17,.72)`
- Final rotation: `24deg`
- Shadow impact scale: `scale(1.28,1)`
- No progress bar or loading text

### Table and intro

The approved table and camera must remain unchanged:

- Table marker: `approved-star-svg`
- Table level: `true`
- Camera: `level-centered`
- Bases: `4`
- Pieces: `36`
- Base color: `161616`
- Intro duration: `5730ms`

## Regression policy

Any pull request that changes the loader, table, camera, intro geometry, or their tests must pass:

1. `python3 scripts/check_approved_baseline.py`
2. The full browser test in `tests/intro_smoke.spec.js`
3. The Vercel build in `scripts/vercel-build.sh`

A deliberate visual change requires a new explicit approval and a new baseline version. Do not silently replace this baseline.
