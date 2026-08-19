# THREEJS-044 — Shared rules and transitions

Status: **LOCKED by THREEJS-044 (2026-08-19)**

## Canonical shared package

Browser and backend-compatible pure gameplay code now lives under:

- `web/app/shared/rules.js`
- `web/app/shared/transitions.js`

`rules/yakolak-rules.json` remains the versioned rule-data contract. `tests/threejs_shared_rules_transitions_contract.test.mjs` deep-compares the browser-safe `RULES` export against that JSON and fails on drift.

`api/game-rules.js` is now only a protocol-v5 compatibility re-export. It contains no independent rule implementation.

## Shared rule semantics

The package owns the already-authoritative current behavior for:

- player-count and wins-to-match validation;
- empty board creation and piece counting;
- placement validation and pure placement;
- same-size lines, graded lines, complete-cell wins and unique winning slots;
- legal-move detection.

The transition module provides pure equivalents of the current gameplay transition behavior for:

- choosing the next legal mover from a caller-supplied player order;
- applying one move;
- finishing a round as win or draw;
- advancing to the next round;
- resetting a completed match.

The functions return new state/board objects and do not mutate the supplied state.

## Protocol-v5 compatibility boundary

`api/rooms.js` remains the historical protocol-v5 room adapter until an explicit migration task replaces that boundary. THREEJS-044 does **not** silently migrate its room/session protocol or claim that v5 has the target future authority model.

The parity contract intentionally preserves v5-observed transition behavior as evidence, including its caller-supplied `players` order and current round-starter formula. Those facts are compatibility behavior, not newly declared canonical seat topology.

Duplicate transition logic inside the historical v5 adapter is therefore not deleted by this task. The shared package is the target implementation for local authority and the future online authority; removal of the v5 transition copy must occur only when its owning migration contracts are explicit.

## Explicit non-resolutions

THREEJS-044 does not close or redefine any open backend gap. In particular it does not choose:

- stable seat IDs, canonical seat topology or turn ring (`THREEJS-048` / GAP-001);
- online Computer authority, timeout authority or readiness;
- restart-round policy or rematch consensus (`THREEJS-076` / GAP-008);
- mutation/revision exactly-once envelope (`THREEJS-072` / GAP-009);
- the canonical full session-state schema (`THREEJS-045`).

No browser timer, bot, presentation input or compatibility adapter gains gameplay authority from this refactor.

## Verification

Run:

`node --test tests/threejs_shared_rules_transitions_contract.test.mjs`

The contract verifies JSON parity, browser-safe module boundaries, protocol-v5 re-export identity, placement/win behavior, pure move/round/reset transitions, and the currently observed v5 order/starter behavior without promoting those unresolved ordering rules into a new contract.

Before publication, THREEJS-044 also ran a deterministic 500-board differential comparison of the shared rule implementation against the pre-refactor `api/game-rules.js` implementation; validation, piece counts, win patterns, winners and legal-move results matched exactly.
