# Yakolak Canonical Game Architecture

## Decision

The current version-layer runtime is **legacy maintenance-only**. New product behavior must move toward one canonical architecture instead of adding another `app-game-vNNN.js`, source-text patch, Blob wrapper, hidden global contract, or duplicated local/online rule path.

## Why this is necessary

The existing runtime grew around one very large module that owns rendering, camera, input, game rules, setup, tutorial, timers, UI, animation, and state. Later builds fetch older JavaScript as text, replace exact strings or regular expressions, create Blob modules, and expose internal objects through `globalThis`. This makes a harmless edit able to break unrelated layers and repeatedly creates import, state-key, preview, and verifier failures.

## Target dependency direction

```text
Input / Network messages
          |
          v
Actions -> State Machine / Reducer -> Effects
                 |                   |
                 v                   v
             Game Core          Adapters
                                |- Three.js renderer
                                |- Camera director
                                |- DOM/UI renderer
                                |- Online transport
                                |- Storage/audio
```

Dependencies only point inward. The pure game core does not import DOM, Three.js, fetch, timers, or online transport.

## Canonical modules

### `src/core/`
Owns the top-level state machine, typed actions, immutable snapshots, effect requests, persistence boundaries, and lifecycle coordination.

### `src/game/`
Owns board state, inventory, legal moves, turn order, scoring, win/draw detection, rounds, and bot commands. Functions are deterministic and headless-testable.

### `src/experience/`
Owns input routing, camera poses, transitions, motion policy, UI presentation, accessibility, mobile policy, and Reduced Motion. It reads snapshots and emits actions; it never decides game legality.

### `src/network/`
Owns rooms, identity, reconnect, synchronization, idempotency, authoritative command exchange, and conversion of server messages into actions. It never controls camera or DOM directly.

### `src/render/`
Owns Three.js objects and translates render snapshots/effects into visible output. Rendering never mutates game rules.

## Single owners

| Concern | Sole owner |
|---|---|
| Application lifecycle | State machine |
| Legal move / winner / draw | Game core |
| Current turn | State machine + game core contract |
| Camera pose | Camera director |
| Pointer/touch/keyboard | Input router |
| Online synchronization | Network session |
| Three.js objects | Renderer |
| DOM visibility | UI renderer |
| Animation/reduced motion | Motion policy |

## Non-negotiable invariants

1. One state snapshot is the source of truth; DOM classes and mesh visibility are projections only.
2. State changes happen through named actions/commands, not arbitrary cross-module mutation.
3. Local, bot, online, tutorial, and developer preview use the same game commands and rules.
4. Online commands are idempotent or safely retryable and carry a session/version identity.
5. Effects return success/failure events; arbitrary sleeps and polling are not correctness mechanisms.
6. Every critical transition has recovery behavior for reload, resize, timeout, cancellation, and disconnect.
7. Developer previews use public adapters/fixtures, never hidden globals or substitute overlays when native state exists.
8. New modules use stable names. Release versions live in tags/metadata, not copied source filenames.

## Legacy policy

Allowed legacy work is limited to:
- a production-blocking defect;
- a regression test needed to preserve released behavior;
- a small adapter that enables migration;
- security or data-integrity repair.

A legacy change must not introduce a new versioned runtime file, new source-string replacement, new Blob bootstrap, new `globalThis.__yakolak*` contract, or another parallel state model.

## Definition of done for a migrated slice

A slice is complete only when it has:
1. named actions and state transitions;
2. pure game rules where applicable;
3. explicit adapters/effects;
4. deterministic headless tests;
5. browser validation when visual/input behavior changes;
6. desktop/mobile evidence when appearance changes;
7. two-client evidence when online behavior changes;
8. rollback through a feature flag without permanent data conversion.
