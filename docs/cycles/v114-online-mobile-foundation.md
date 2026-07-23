# v114 — Online and mobile foundation

Date: 2026-07-24

## Problem

Production v113 has no online multiplayer. On mobile, camera framing spends
most of the screen on the table body while the pieces remain small and the
gray table/board/room values compete with one another.

## Hypothesis

A server-authoritative two-player room with conflict-safe turns will provide a
reliable first online experience. Framing the play surface directly and adding
restrained warm/cool separation will improve mobile readability without
introducing post-processing or heavy shadows.

## Implementation

- `api/rooms.js`: durable room API.
- `api/calibration.js` and `package.json`: fetch-only Turso serverless driver
  on the pinned Node 22 LTS runtime.
- `src/online-rules-v114.js`: pure authoritative rules.
- `src/online-client-v114.js`: room UI, recovery, polling, tap input, and board
  synchronization.
- `styles/v114-online.css`: mobile-safe online interface.
- `src/app-game-v114.js`: release wrapper, responsive overview camera, bounded
  mobile DPR, board/table contrast, and narrow rendering hooks.
- `scripts/verify-v114-online.mjs`: rule and release contracts.

## Tests completed before Preview

- Module syntax checks.
- Direct same-size win.
- Graded win.
- Same-cell win.
- Wrong-turn rejection.
- Occupied-slot rejection.
- Versioned compare-and-swap contract.
- Two-player rematch handshake.
- Token hashing and no-token-logging contracts.
- Safe-area, touch-target, tap-threshold, and mobile-DPR contracts.

## Preview verification

- Final Preview deployment `dpl_EEBBBjknvMnP77d9e7iGK8eT2j5e` reached
  `READY` from commit `0e432eb775c3e6f11bb05324374b134a6bb694c8`.
- Opened the immutable Preview on 390x844 portrait and 844x390 landscape.
- Created a private room, joined from a second tab, and completed a legal move.
- The second client received the move and the active turn within one polling
  cycle.
- Reload recovery and session restoration were verified on an earlier Preview
  of the same online implementation.
- Portrait and landscape screenshots confirmed that the board, pieces, turn
  HUD, and online connection pill do not overlap.
- Browser Console filtering for the final Preview origin found no warnings or
  errors.
- Vercel Runtime logs for the final deployment found no
  `warning`, `error`, or `fatal` entries after the room and move test.

## Result

Keep. The first online release is server-authoritative, survives function
instance changes through Turso, rejects stale/illegal moves, and remains
understandable on mobile. Mobile landscape now frames the board rather than the
table body, portrait HUD collision was removed, and the database path no longer
emits the Node 24 deprecation warning.

## Preview

`https://yakolak-jye7emtev-ahmdkcoms-projects.vercel.app`

## Rollback

Production v113 deployment:
`dpl_J1Ucdzn2nsBxsywLpy9HAXFcFQz9`.
