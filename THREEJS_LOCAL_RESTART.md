# THREEJS-055 — Safe local restart-round

Status: **LOCKED by THREEJS-055 (2026-08-19)**

Local restart-round is an authority-owned confirmed transition. It is available only before the current round has any committed placement and only when the local authority adapter confirms zero Online seats.

## Eligibility

A restart request may be created only when:

- match is not complete;
- round has not ended;
- lifecycle is uninterrupted `turn-loop`;
- an active stable seat and absolute deadline exist;
- canonical `lastMove` is null;
- board is empty;
- every configured inventory is still at the shared rules home count;
- the request comes from an explicit confirmation-capable source (`tap`, `click`, keyboard confirm or gamepad confirm).

Any committed placement makes restart unavailable immediately.

## Host confirmation

The local host authority is the first configured stable seat after THREEJS-048 host-preference rotation. `createLocalRestartRequest(...)` creates the existing engine-neutral `restart` intent with that stable host seat and current revision.

The request additionally captures:

- round number;
- lifecycle `presentationGeneration`;
- exact current `deadlineAtMs`;
- deterministic diagnostic restart key.

These are confirmation witnesses, not a new mutation/revision protocol. THREEJS-072 still owns the unified revision/mutation envelope.

`confirmed=false` is a pure cancellation and changes no canonical state. Missing confirmation is rejected.

## Stale confirmation and idempotence

A confirmed request applies only if its authority witnesses still match the current state. It becomes stale if revision, round, lifecycle generation, deadline, host identity, lifecycle phase/interrupt, or committed-placement state changes before confirmation.

This deliberately invalidates a pending confirmation after any meaningful authority transition, including timeout handoff or context/lifecycle change.

A successful restart passes:

`turn-loop → reset → round-ready → turn-loop`

and creates a fresh absolute local 18-second deadline. Because generation/deadline change, replaying the same request is stale even though round number, match score and gameplay revision remain unchanged.

## Restart result

A successful restart:

- keeps the same round number;
- keeps `completedRounds` unchanged;
- keeps configuration and cumulative match score unchanged;
- restores empty board/full derived inventory;
- clears last move, ordered skips and round-scoped vote/result state;
- restores the **original starter for that same round** from the THREEJS-048 configured ring;
- clears the old deadline and creates one fresh local deadline only after the reset state reaches `round-ready`;
- keeps gameplay `revision` unchanged until THREEJS-057/072 own revision advancement.

Because authoritative scores do not change, THREEJS-053 physical score markers remain unchanged.

## Online boundary

Any configured Online seat makes this local restart path fail closed. Online restart-round quorum/consensus remains owned by THREEJS-076.

## Verification

Run:

- `node --test tests/threejs_local_restart_contract.test.mjs`
- `node --test tests/threejs_round_advance_contract.test.mjs`
- `node --test tests/threejs_session_lifecycle_contract.test.mjs`

The focused contract covers explicit cancel/confirm, stable host identity, same-round starter restoration, score/config preservation, fresh deadline, replay idempotence, pending-confirmation invalidation after committed placement, stale generation/deadline/revision, preferred-color host rotation and Online exclusion.
