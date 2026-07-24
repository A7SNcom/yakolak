# v115 — Restore setup framing

Date: 2026-07-24

## Problem

The v114 responsive play camera was also applied before a match was
configured. This replaced the established full-table setup framing and made
the four player choices look misplaced during color and player-count setup.

## Hypothesis

Keeping the original full-table fit while `gameState.configured` is false, and
switching to the responsive play overview only after configuration, restores
the familiar setup without reverting the mobile play camera or online mode.

## Smallest change

- Restore the original `fit(objects)` setup camera.
- Switch to `setResponsiveOverview()` immediately after local setup is
  confirmed.
- Keep the setup camera on resize until configuration is complete.
- Add contracts that prevent setup/play camera responsibilities from being
  merged again.

## Files

- `src/app-game-v114.js`
- `scripts/verify-v114-online.mjs`

## Preview verification

- Preview deployment `dpl_2HB5cmuRGeL4kHULFDkrmawcbaUq` reached `READY`.
- Compared the setup screen directly with immutable v113: table framing and
  all four player-choice positions match; v114 materials and the online button
  remain intentionally unchanged.
- Completed the local path: color choice, player-count choice, tutorial skip,
  and first playable turn. The camera remained in setup framing until the
  choice was confirmed, then moved to the play overview.
- Created online room `XACCMX`, joined from a second client, selected a piece,
  placed it legally, and observed the move plus turn change on both clients.
- Browser console: no warnings or errors on either clean online client.
- Vercel runtime logs: no warning, error, or fatal entries for the Preview.

## Result

Keep. The regression is reversed without reverting the v114 online system,
mobile play framing, rules, materials, or authoritative room state.

## Preview

`https://yakolak-hycmgpvnc-ahmdkcoms-projects.vercel.app`

## Rollback

Production v114 merge commit:
`f7bf94f05a670380c3815acf2725cb9001e1e2e4`.
