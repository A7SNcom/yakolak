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

Pending. This section must be updated only after the real Vercel Preview is
opened on desktop and mobile and a two-client room is played.

## Result

Pending Preview evidence.

## Rollback

Production v113 deployment:
`dpl_J1Ucdzn2nsBxsywLpy9HAXFcFQz9`.
