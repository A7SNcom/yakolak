# Developer D4 Journey Audit

## Purpose

This audit compares the D4 registry and preview implementation with states that exist in the actual Yakolak runtime. It separates runtime correctness from visual polish: a preview cannot be accepted when it displays the wrong player, omits a supported player count, or renders a substitute instead of the native UI.

## P0 — Correctness blockers

### 1. Three-player gameplay is missing

- The local setup offers 2, 3 and 4 players in `renderSetup3D` and `renderSetupStep`.
- `gameplay-ready` and `game-hud` expose only `two-players` and `four-players`.
- `playersFor` maps every count except 2 to four colors, so a future `count: 3` request would still render four players.

Acceptance:
- Add `three-players` to the gameplay and HUD variants.
- Return exactly three active colors for count 3.
- Verify the visible bases, pieces and score entries are three, not four.

### 2. D4 writes the wrong turn field

- The real runtime uses `gameState.turnIndex` in `currentPlayer`, `startRound` and `nextTurn`.
- D4 writes `currentIndex` in `setupPlay` and `configureTurn`.

Impact:
- A variant labelled as the blue, gold or white turn may still render the first player's turn.

Acceptance:
- Use `turnIndex` only.
- Test all four color variants and assert the active HUD/player matches the requested color.

### 3. Online preview targets the launcher instead of the dialog

- `yakolakOnlineEntry` is the launcher button.
- `yakolakOnlineDialog` is the real native online panel.
- D4 `configureOnline` currently calls `showDom('yakolakOnlineEntry')` and adds an `open` class to the launcher.

Acceptance:
- Open and populate `yakolakOnlineDialog` for native online-state previews.
- Keep the entry button only as a launcher element when it is reviewed separately.

### 4. Nested Blob import can break the D4 runtime bridge

- `app-game-developer-d4.js` imports the source of `app-game-developer-d1.js` through a Blob URL.
- The D1 source contains a relative dynamic import of `./online-client-v114.js`.
- Relative module imports inside a Blob do not inherit the original module path contract.

Acceptance:
- Avoid the nested Blob wrapper, or rewrite the online-client module import to an absolute URL before importing the Blob.
- Add a browser test that waits for both `__yakolakGame` and `__yakolakOnlineV114`.

## P1 — Missing real journey states

### Local play

- Draw caused by no remaining legal moves.
- Bot-thinking locked state.
- Turn-timeout and automatic skip transition.
- Opened piece tray and selected piece size.
- Last-move marker.

### Online play

The runtime contains these distinct native states:

- Home/create/join.
- Invite verification/loading.
- Player-count selection for room creation.
- Available-color selection for create/join.
- Waiting room.
- Active playing-room status.
- Finished result and rematch readiness.
- Cancelled room.
- Recoverable validation/server/offline errors.

D4 currently models only landing, room-code and waiting.

## P2 — Useful isolated elements

- Persistent online status pill: online, offline and error.
- Local versus online last-move marker variants.
- Online legal-zone marker variant where its geometry/style differs from local play.

## Automated audit

Run:

```bash
node scripts/audit-developer-d4-journey.mjs
```

This produces:

```text
artifacts/developer-d4-journey-audit.json
```

Advisory mode reports gaps without failing the process. Once the P0 work is integrated, use strict mode as a merge guard:

```bash
node scripts/audit-developer-d4-journey.mjs --strict
```

## Acceptance order

1. Resolve all P0 runtime-contract gaps.
2. Add native previews for P1 states without duplicating the product UI.
3. Run strict static audit.
4. Run desktop and mobile browser journeys.
5. Accept the D4 interface only after screenshots and functional assertions agree.
