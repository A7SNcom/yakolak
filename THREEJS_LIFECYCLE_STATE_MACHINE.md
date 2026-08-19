# THREEJS-060 — Engine-neutral lifecycle state machine

Status: **LOCKED by THREEJS-060 (2026-08-19)**

THREEJS-060 closes the lifecycle-model gap immediately after THREEJS-045 so later reducers, presentation code and online hydration do not create parallel booleans or hidden phases.

Canonical lifecycle lives inside `yakolak.session-state/v1` as:

```text
{ phase, interrupt, recoveryTarget, presentationGeneration }
```

The pure implementation is `web/app/session/session-lifecycle.js`. `web/app/session/canonical-session-state.js` validates every canonical snapshot through that model.

## Normal phases

The complete normal phase vocabulary is:

`boot → loading → handoff → room-reveal → entry → setup → invitations-ready → unboxing → tutorial → round-ready → turn-loop → win/draw → reset → match-end`

Legal route variations are explicit:

- invitee entry may go `entry → invitations-ready` without host setup;
- invitations/ready may return to `setup` for explicit reconfiguration;
- tutorial is optional: `unboxing → round-ready` is legal;
- reset goes to `round-ready` for another round or `match-end` when the match is complete;
- match end goes to `round-ready` for a committed rematch reset or `setup` for Return to Setup.

No other normal phase edge is legal. A renderer or callback cannot jump directly from Boot to gameplay, from Turn Loop to Reset, or otherwise invent a hidden phase transition.

## Interrupt states and recovery

Interrupts are explicit in the same lifecycle object:

- `asset-error`
- `offline`
- `reconnect`
- `context-lost`
- `cancelled`

Recoverable interruptions retain the committed normal `phase` and one explicit `recoveryTarget`.

- `offline`, `reconnect` and `context-lost` recover only to the phase they interrupted.
- `asset-error` may recover to the interrupted phase or deliberately restart at `loading`.
- changing a visible interrupt, such as `offline → reconnect`, cannot rewrite the already captured recovery target.
- `cancelled` is terminal and has no recovery target.

Hydrated snapshots are validated against the same rules, so an impossible state cannot bypass the reducer merely by arriving from persistence or the network.

## Presentation generation boundary

Every accepted phase transition, interruption and recovery increments exactly one `presentationGeneration` integer.

Every lifecycle event must carry the generation it observed. A stale event fails with `stale_presentation_generation`. This is the generation captured by animations, fetch completions, reconnect handlers, context-restoration callbacks and similar presentation/runtime work.

This generation is deliberately separate from canonical gameplay `revision`. THREEJS-060 does not choose mutation/revision/exactly-once semantics owned by THREEJS-072. It only prevents an old callback from advancing or restoring a newer lifecycle state.

## Commit-before-presentation rule

The lifecycle reducer is pure. The required order is:

1. event/intent reaches the canonical reducer;
2. canonical lifecycle transition is validated and committed;
3. the new `presentationGeneration` is exposed;
4. presentation/network work begins for that committed state;
5. completion may request another generation-bound event but never mutates lifecycle directly.

Animation handles, Promises, DOM nodes, Three.js objects, timers, service-worker state and transport callbacks remain outside canonical state.

## Consumer rule

THREEJS-049→059, THREEJS-030→043, THREEJS-082→096 and online hydration must consume this lifecycle model. They must not introduce alternate fields such as `isLoading`, `isReconnecting`, `introDone`, `contextLost`, `inTutorial`, hidden scene-phase strings or renderer-owned lifecycle truth.

Gameplay-authority gaps remain owned by their named tasks. For example, lifecycle may enter `invitations-ready`, `turn-loop`, `win` or `draw` only after the applicable authoritative reducer has committed the underlying gameplay/session facts; this state machine does not manufacture readiness, deadlines, wins or network authority itself.

## Verification

Run:

- `node --test tests/threejs_canonical_session_state_contract.test.mjs`
- `node --test tests/threejs_session_lifecycle_contract.test.mjs`

The lifecycle contract covers the full normal path, host/invitee route differences, tutorial skip, win and draw paths, reset/match-end exits, all interrupt types, recovery targets, terminal cancellation, hydration invariants, stale-generation rejection and canonical reducer composition.
