# THREEJS-060 — Engine-neutral lifecycle state machine

Status: **LOCKED by THREEJS-060 (2026-08-19); `turn-loop → reset` authority-owned restart edge added by THREEJS-055 (2026-08-19)**

Canonical lifecycle lives inside `yakolak.session-state/v1` as:

```text
{ phase, interrupt, recoveryTarget, presentationGeneration }
```

The pure implementation is `web/app/session/session-lifecycle.js`. `web/app/session/canonical-session-state.js` validates every canonical snapshot through that model.

## Normal phases

The normal phase vocabulary is:

`boot → loading → handoff → room-reveal → entry → setup → invitations-ready → unboxing → tutorial → round-ready → turn-loop → win/draw → reset → match-end`

Legal route variations are explicit:

- invitee entry may go `entry → invitations-ready` without host setup;
- invitations/ready may return to `setup` for explicit reconfiguration;
- tutorial is optional: `unboxing → round-ready` is legal;
- normal round completion is `turn-loop → win/draw → reset → round-ready|match-end`;
- THREEJS-055 adds one exceptional **authority-owned** edge `turn-loop → reset` for a confirmed local restart request before any committed placement;
- match end goes to `round-ready` for a committed rematch reset or `setup` for Return to Setup.

The restart edge does not grant render/UI callbacks permission to jump lifecycle. Only the restart authority reducer may consume it after validating host confirmation, local-only authority, zero committed placements and its stale-request witnesses. If a move commits first, the pending restart cannot use the edge.

No other normal phase edge is legal.

## Interrupt states and recovery

Interrupts are explicit:

- `asset-error`
- `offline`
- `reconnect`
- `context-lost`
- `cancelled`

Recoverable interruptions retain the committed normal phase and one explicit recovery target. Offline/reconnect/context-loss recover to the interrupted phase; asset error may retry the phase or restart at loading; cancelled is terminal.

Hydrated snapshots are validated against the same rules.

## Presentation generation boundary

Every accepted lifecycle transition, interruption and recovery increments `presentationGeneration` once. Every lifecycle event carries the generation it observed; stale events fail closed.

This generation is separate from gameplay `revision`. It invalidates stale animation/network/restart-confirmation callbacks without defining the revision/mutation semantics owned by THREEJS-072.

A successful THREEJS-055 restart consumes three lifecycle edges after the confirmation witnesses are validated:

`turn-loop → reset → round-ready → turn-loop`

so stale presentation/restart callbacks from the old round generation cannot reapply the restart.

## Commit-before-presentation rule

1. authority validates an event/intent;
2. canonical lifecycle transition commits;
3. new `presentationGeneration` is exposed;
4. presentation/runtime work begins from that committed state;
5. completion may request another generation-bound event but never mutates lifecycle directly.

Animation handles, Promises, DOM nodes, Three.js objects, timers, service-worker state and transport callbacks remain outside canonical state.

## Consumer rule

THREEJS-049→059, THREEJS-030→043, THREEJS-082→096 and online hydration must consume this lifecycle model rather than parallel booleans/hidden phases.

Lifecycle states do not manufacture gameplay authority. Readiness, deadlines, wins, draws, restart eligibility and network authority must first be committed by their owning reducer/adapter.

## Verification

Run:

- `node --test tests/threejs_session_lifecycle_contract.test.mjs`
- `node --test tests/threejs_local_restart_contract.test.mjs`

Together these contracts cover the normal path, interruptions/recovery, stale-generation rejection and the guarded pre-placement restart edge.
