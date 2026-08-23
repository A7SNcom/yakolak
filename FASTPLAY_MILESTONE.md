# FASTPLAY Milestone — First Human-Playable Three.js Build

Product priority is now the first real human-playable experimental build on GitHub Pages with the smallest safe scope.

## Hard priority

Until `FASTPLAY-003` records `FIRST_PLAYABLE_EXPERIMENTAL=PASS`, do **not** spend implementation time on:

- Cloudflare/Turso live deployment or compatibility qualification
- online rooms, invitations, invite-code capacity, reconnect/controller security
- telemetry/observability expansion
- immutable release qualification, rollback polish, or final cutover
- tutorial, unboxing, brand handoff, decorative motion, or cosmetic expansion

Those items remain valid future work but are deliberately deferred.

## Only three active milestones

1. **FASTPLAY-001 — Real local game scene**
   Replace the TorusKnot technical shell in the user path with the actual YAKOLAK room/table/board/bases/36 pieces and wire the already-completed local authority/input/motion stack into it. A human must be able to make a real legal move from the public `/yakolak/threejs/` page.

2. **FASTPLAY-002 — Minimal local start + HUD + match flow**
   Add only the controls needed to start and finish a local match: 2/3/4 seats, Human/Computer choices, canonical fixed colors/ring, `winsToMatch=3` for this milestone, active turn, 18-second timer, scores, selection/legal targets/last move, win/draw, next round, rematch, return to setup.

3. **FASTPLAY-003 — Public first-playable acceptance**
   Test the actual human-facing Pages build on mobile portrait and desktop. Complete a Human+Computer match, exercise tap + drag + one timeout, verify score/reset/rematch/refresh/WebGL recovery, and require no fatal/page errors. When green, record the exact SHA/generation and `FIRST_PLAYABLE_EXPERIMENTAL=PASS`.

## Reuse, do not rebuild

THREEJS-030 through THREEJS-061 already establish the local rules, state, local authority, input semantics, motion controller, timer, score/reset/rematch behavior, and live local acceptance harness. FASTPLAY must consume those modules rather than create alternate rules, state, schedulers, or test-only gameplay paths.

## Scope rule

If a change does not directly help a person open the public Three.js URL and play a complete local match, it waits until after FASTPLAY-003.
