# THREEJS-050 — Local timeout skip exactly once

Status: **LOCKED by THREEJS-050 (2026-08-19)**

THREEJS-050 consumes the absolute local deadline from THREEJS-049 and the configured legal-mover ring from THREEJS-048. It applies only to authority adapters that confirm zero Online seats. Online timeout authority remains owned by THREEJS-062/070.

## Timeout intent and turn witness

When local authority observes `nowMs >= deadlineAtMs`, `createExpiredLocalTimeoutIntent(...)` creates the existing engine-neutral gameplay intent:

- kind: `timeout`
- origin: `clock`
- authority adapter: `local`
- authority seat: current stable `activeSeatId`
- authority revision: current canonical `revision`
- payload: empty
- presentation source: `none`

THREEJS-029 intentionally gives local intents no mutation ID. THREEJS-050 therefore does **not** invent one and does not redefine the revision contract owned by THREEJS-072.

For local exactly-once application, the timeout attempt carries one additional immutable witness: the exact `deadlineAtMs` observed for that turn, plus a deterministic diagnostic `timeoutKey = local-timeout:<revision>:<deadline>:<seat>`.

Application is allowed only when all three current facts still match the attempt:

1. `activeSeatId`;
2. canonical `revision`;
3. exact `deadlineAtMs`.

After one accepted timeout handoff, the new turn has a new deadline. The old attempt is therefore stale even when the configured ring gives the **same seat** a consecutive turn and even while gameplay revision semantics remain unchanged. Replayed visibility/resume/render callbacks cannot apply that same timeout twice.

## Timeout transition

For a matching expired attempt with at least one legal mover:

1. preserve board exactly;
2. preserve derived inventory exactly;
3. consume no piece;
4. award no score;
5. record `{ seatId: timedOutSeat, reason: 'timeout' }` first in canonical ordered `skips`;
6. append any `no_legal_move` skips returned by the shared THREEJS-048 selector;
7. set `activeSeatId` to the first legal configured seat selected by that shared ring;
8. clear the old deadline as part of the authoritative handoff;
9. immediately create exactly one new local 18-second deadline from the handoff wall-clock time via THREEJS-049.

The `timeout` reason is distinct from `no_legal_move`. Neither reason may be inferred from UI animation or a decrementing display counter.

## Same-seat consecutive turn

If all other configured seats have no legal placement but the timed-out seat still does, the shared ring may wrap to that same seat. This is a **new turn**, with:

- the same stable `activeSeatId`;
- the same gameplay revision until THREEJS-072 defines revision advancement;
- a different absolute `deadlineAtMs`;
- ordered skip evidence containing the timeout and the blocked intervening seats.

The old timeout attempt cannot replay because its deadline witness no longer matches.

## Background resume

If the app resumes long after the expired deadline, the old turn is not extended. The timeout applies once at the authoritative resume transition. The newly selected turn then receives its own full 18-second deadline starting from that transition wall-clock time.

This avoids silently burning unseen future turns while still refusing to extend the already-expired turn.

## All seats blocked

If shared rules prove **every configured seat** has no legal placement, THREEJS-050 does not commit a timeout handoff and does not set `draw=true`.

It returns `requires-draw-resolution` plus the complete ordered `no_legal_move` evidence from THREEJS-048. THREEJS-051 exclusively owns validating that evidence against shared rules and committing the canonical draw/end revision.

Therefore timeout presentation by itself can never manufacture a draw, while any existing legal move always causes a legal handoff rather than a draw.

## Online boundary

The same zero-Online classifier boundary from THREEJS-049 is reused. THREEJS-050 does not add a server deadline, online timeout mutation, request wake, clock-skew policy or reconciliation receipt. Those remain GAP-005/GAP-006 work for THREEJS-062/070/072.

## Verification

Run:

- `node --test tests/threejs_local_deadline_contract.test.mjs`
- `node --test tests/threejs_local_timeout_contract.test.mjs`
- `node --test tests/threejs_turn_ring_contract.test.mjs`

The timeout contract covers exact-deadline triggering, pre-deadline no-op, board/inventory/score preservation, new deadline creation, duplicate replay, same-seat replay protection, late background resume, stale seat/revision/deadline witnesses, all-seats-blocked deferral to THREEJS-051 and online exclusion.
