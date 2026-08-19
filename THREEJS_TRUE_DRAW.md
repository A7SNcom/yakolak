# THREEJS-051 — True draw detection

Status: **LOCKED by THREEJS-051 (2026-08-19)**

A draw is an authoritative rules result, never a timeout animation, empty countdown, skip banner or UI inference.

## Draw proof

`proveCanonicalDraw(state)` re-derives the complete configured seat order and checks every configured color directly against the shared gameplay rules:

- `hasLegalMove(board, color)` must be false for every configured seat;
- `winningPatterns(board, color)` must be empty for every configured seat.

The second guard prevents malformed/hydrated state containing an already-completed win from being converted into a draw merely because no moves remain.

The proof ignores existing `skips`, timeout presentation and other UI evidence. Those values may explain what the user saw, but they are not authority for ending the round.

## Authoritative draw commit

`commitAuthoritativeDraw(state, { expectedRevision })` is allowed only when:

- `expectedRevision` exactly matches current canonical `revision`;
- lifecycle is uninterrupted `turn-loop`;
- the round has not already ended;
- the match is not already complete;
- shared rules independently prove every configured seat has no legal move;
- no configured color already has a winning pattern.

On commit it:

- sets `draw=true` and keeps `winner=null`;
- changes no board slot and no inventory count;
- awards zero score to every seat;
- increments `completedRounds` once;
- clears active turn/deadline;
- records exact ordered `no_legal_move` evidence for every configured seat;
- advances canonical lifecycle `turn-loop → draw` through the THREEJS-060 lifecycle reducer;
- preserves gameplay `revision` unchanged until THREEJS-072 owns revision advancement;
- records that exact value in canonical `roundEndRevision`.

## Exact end revision

`roundEndRevision` is a nullable canonical session field introduced by THREEJS-051. It is distinct from the live `revision` field.

At draw commit:

`roundEndRevision = revision`

If later authoritative actions advance the live revision, the recorded round-end revision remains unchanged until the round/reset owner clears/replaces it. `canonicalDrawResult(state)` reconstructs the persisted draw result as:

`{ type: 'draw', endRevision, scores }`

This survives serialization/hydration and gives presentation/telemetry an exact end boundary without inventing a new revision rule.

THREEJS-052 should use the same `roundEndRevision` field for winning round closure.

## Timeout integration

THREEJS-050 may return `requires-draw-resolution` when its shared turn-ring scan sees every configured seat blocked. That status is only a request to invoke the authoritative draw resolver.

THREEJS-051 does **not** trust the timeout result as proof. It recomputes legal moves and wins from the canonical board. If any legal move exists, draw commit fails even if timeout/no-move presentation claims otherwise.

## Verification

Run:

- `node --test tests/threejs_true_draw_contract.test.mjs`
- `node --test tests/threejs_local_timeout_contract.test.mjs`
- `node --test tests/threejs_winning_patterns_contract.test.mjs`

The draw contract includes a genuine no-win/no-legal-move board, score preservation, exact end revision persistence, hydration, stale revision rejection, duplicate end protection, fake timeout/no-move presentation rejection, winning-board rejection and THREEJS-050 all-blocked integration.
