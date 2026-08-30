# YAKOLAK 2.8 — Historical Approved Baseline

Status: **HISTORICAL / READ-ONLY**. This file records a visual baseline approved on 2026-08-05. It is not a current source, branch, build, test, deploy, rollback, or fallback instruction.

Current operational source of truth is latest GitHub `main`, published only through Flash Publish to https://yakolak.vercel.app/. See `AGENTS.md` and `PROJECT_ORDER.md`.

## Historical recovery identity

- Approved source commit: `df2c822c748c79b85dde6f948340dcd8cbebe526`
- Historical frozen branch: `approved/yakolak-2.8-v129-loader`
- Historical implementation branch: `adopt/yakolak-2.8-approved-baseline`

These identifiers may be inspected for reference only; do not check them out or deploy them as a fallback.

## Historical visual contract

### Loading screen

- White background: `#ffffff`
- Star color: `#3f3f3f`
- Cycle: `820ms`
- Vertical bounce only; no horizontal rolling
- Impact frame: `translateY(36px) scale(1.17,.72)`
- Final rotation: `24deg`
- Shadow impact scale: `scale(1.28,1)`
- No progress bar or loading text

### Table and intro

- Table marker: `approved-star-svg`
- Table level: `true`
- Camera: `level-centered`
- Bases: `4`
- Pieces: `36`
- Base color: `161616`
- Intro duration: `5730ms`

The former PR/regression/build procedure for this baseline is retired. Any current testing is manual and must follow the current `main`/Flash policy rather than old branch or Vercel-build paths.
