# THREEJS-029 — Engine-neutral gameplay intent schema

Status: **LOCKED by THREEJS-029 (2026-08-19)**  
Tracking: `JSRNA_JOB_f5abfc6b-498e-40a2-838d-d6710fba2231`

## Contract

There is one serializable gameplay-intent envelope. Three.js, Godot, touch, mouse, keyboard, gamepad, bots and network transports must not define parallel rule semantics.

```json
{
  "schema": "yakolak.gameplay-intent/v1",
  "kind": "move",
  "origin": "human",
  "authority": {
    "adapter": "network",
    "seat": "p2",
    "revision": 17,
    "mutationId": "threejs029_mutation_id_000000000001"
  },
  "payload": { "cell": 4, "size": "medium" },
  "presentation": { "source": "drag-release" }
}
```

`kind + seat + payload` are the rule-facing semantics. `revision`/`mutationId` are authority context; `origin`, `presentation` and transport selection do not create another rules path.

## Intent kinds

| Kind | Payload | Meaning |
|---|---|---|
| `move` | `{ cell, size }` | Attempt the same canonical placement regardless of how it was selected/confirmed. |
| `timeout` | `{}` | Request the authority adapter to process a timeout transition. It does not invent a client-side outcome. |
| `restart` | `{}` | Request restart semantics from the owning authority contract. THREEJS-029 does not choose the still-open online restart/quorum rules. |
| `rematch` | `{}` | Request rematch through the same intent/authority path. |

The schema validates only structural move data. Board legality, piece availability, turn ownership, wins and transition rules stay in the shared rules/authority layer.

## Origins and presentation

`origin` is one of `human`, `bot`, `clock`, `system`. It identifies who/what produced the intent for authority policy; it is excluded from rule semantics.

`presentation.source` is one of `tap`, `click`, `drag-release`, `keyboard-confirm`, `gamepad-confirm`, `none`. Tap, click, drag release, keyboard confirm and gamepad confirm that select the same move must produce identical rule semantics. Pointer coordinates, button codes, gesture deltas and other device details are not allowed in `payload`.

A bot move is the same `move` kind and payload with `origin: "bot"`; it does not get a bot-specific placement rule. A timeout normally uses `origin: "clock"` and `presentation.source: "none"`.

## Minimum authority context

| Adapter | Intent carries | Notes |
|---|---|---|
| `local` | `seat`, `revision` | No mutation/retry ID is carried because there is no network replay boundary. |
| `network` | `seat`, `revision`, `mutationId` | `mutationId` is stable for retries of the same intended mutation. |

The engine-neutral core treats `seat` and `mutationId` as opaque identifiers. This is deliberate: THREEJS-029 must not pre-empt the still-open stable-seat and unified-mutation-envelope decisions. A concrete authority adapter may impose the constraints of the protocol it actually targets.

## Graphics/context-recovery boundary

`web/app/session/canonical-online-session.js` is application/session state used by the graphics recovery contract. It is not allowed to define its own gameplay mutation shape. Its `submitMoveIntent()` boundary accepts only a validated `yakolak.gameplay-intent/v1` network `move`, requires the intent seat to match the canonical session seat, and deduplicates/reconciles by `authority.mutationId`.

The historical parallel `{ moveId, cell, size, ... }` shape is rejected. WebGL loss/restoration may preserve the canonical intent and its mutation identity, but it must never translate it into a graphics-specific or recovery-specific rules path.

## Current protocol-5 network submission adapter

`toRoomsApiSubmission()` is explicitly an adapter for the currently deployed `/api/rooms` contract, not a second gameplay schema.

Before serializing, it verifies that the authenticated `sessionSeat` equals the intent seat. It then omits seat from the wire body because the server derives seat ownership from bearer authentication, maps `revision` to the current `version` field, and preserves the stable `mutationId`.

Current protocol-5 mapping:

| Intent | Current wire action |
|---|---|
| `move` | `action: "move"`, `version`, `mutationId`, `cell`, `size` |
| `rematch` | `action: "rematch"`, `version`, `mutationId` |
| `timeout` | fail closed: `online_timeout_authority_unsupported` |
| `restart` | fail closed: `online_restart_authority_unsupported` |
| online `origin: "bot"` | fail closed: `online_bot_authority_unsupported` |

Those explicit failures preserve the existing backend-gap ownership: protocol 5 has no authoritative timeout mutation, restart-round action or durable server-side bot trigger. THREEJS-029 defines how such actions are represented without pretending the backend can already authorize them.

## Device equivalence examples

All of these are the same rule-facing move when `seat`, `cell` and `size` match (with each adapter attaching its current revision context):

```text
click              -> move(seat, cell, size)
tap                -> move(seat, cell, size)
drag-release       -> move(seat, cell, size)
keyboard-confirm   -> move(seat, cell, size)
gamepad-confirm    -> move(seat, cell, size)
bot origin         -> move(seat, cell, size)
```

Only `presentation.source`/`origin` differs. `gameplayRuleSemantics()` removes both plus transport/retry metadata, making accidental device-specific rule branches directly testable.

## Files and verification

- Runtime contract: `web/app/gameplay/gameplay-intent.js`
- Graphics/session compatibility boundary: `web/app/session/canonical-online-session.js`
- Contract test: `tests/threejs_gameplay_intent_contract.test.mjs`
- Graphics recovery regression: `tests/threejs_context_recovery_contract.test.mjs`
- Verification: `node --test tests/threejs_gameplay_intent_contract.test.mjs tests/threejs_context_recovery_contract.test.mjs`

No PAGES-012/PAGES-015 release, qualification, deployment or compatibility state is changed by THREEJS-029.
