# Yakolak Incremental Migration Roadmap

## Strategy

Do not rewrite the released game in one attempt. Use a strangler-style migration: create tested canonical modules, connect one vertical slice behind a feature flag, compare it with the legacy behavior, and expand only after parity evidence.

Production remains on the legacy path until a slice passes its gates. The old path is not extended with new feature layers.

## Phase 0 — Freeze architectural debt

- No new `app-game-vNNN.js` files after Build 126.
- No new runtime source-text replacements, Blob module wrappers, or hidden global APIs.
- Every legacy edit requires a debt note explaining why it cannot be implemented as a migration slice.
- Add architecture guardrails to `npm test` and required CI.

## Slice 1 — Contracts and deterministic state

Create without Three.js or DOM:
- `Action`
- `AppState`
- `GameCommand`
- `GameResult`
- `Effect`
- `RenderSnapshot`
- reducer/state-machine transition function

First transitions: Boot -> Entry -> Mode selection. Tests run in Node only.

## Slice 2 — Pure game rules

Extract and test:
- empty board;
- inventory;
- legal moves;
- two/three/four-player turn order;
- three win patterns;
- draw detection;
- round scoring.

Use table-driven and invariant/property-style tests. Local and online adapters must consume the same commands/results.

## Slice 3 — Replay and parity harness

Create a deterministic event log and replay runner. Feed identical commands into legacy fixtures and the new core, then compare board, turn, score, winner, and round results. This is the main anti-regression bridge.

## Slice 4 — Camera director and input router

Move camera poses/transitions into one director and normalize pointer/touch/mouse/keyboard into actions. Validate desktop, mobile, resize, recenter, cancellation, and Reduced Motion.

## Slice 5 — Clean entry and setup

Rebuild loader, wall menu, transition, color/player/round setup against the state machine. Do not include online transport yet. Reload and interruption must restore a valid state.

## Slice 6 — One complete local round

Complete one vertical playable path:
selection -> legal move -> placement -> turn transition -> win/draw -> next round.

This is the first product milestone. Do not migrate decorative states before this path is reliable.

## Slice 7 — Bot adapter

The bot receives snapshots and returns the same `GameCommand` used by humans. It cannot mutate scene objects or bypass game rules.

## Slice 8 — Online authoritative session

Move room lifecycle, identity, reconnect, command IDs, retries, conflict resolution, rematch, and cancellation into `src/network/`. Prove parity with two real clients and recoverable disconnects.

## Slice 9 — Developer workspace adapter

The workspace previews named states through deterministic fixtures and public adapters. It cannot mutate private runtime internals or create fake online/game overlays.

## Slice 10 — Visual parity and cutover

Transfer only approved assets, materials, lighting, motion, and responsive policies. Compare performance and appearance. Enable the new path gradually through a reversible feature flag, then delete legacy layers in a separate human-approved cleanup.

## Slice rules

- One slice may contain multiple hourly tasks, but each task has one outcome.
- At most two implementation tasks may touch the same slice concurrently, and their files must be disjoint.
- A task that only repairs legacy code does not count as migration progress.
- Each cycle reports two numbers: `legacy-debt delta` and `migration-gate delta`.
- No new feature is accepted only in legacy code unless the user explicitly authorizes the debt.

## Current immediate sequence

1. Enforce Phase 0 guardrails.
2. Finish only the D4 P0 work needed to inspect and preserve current behavior.
3. Build Slice 1 contracts in the active integration line.
4. Extract the pure rules and create replay parity before adding more visual journey states.
