# THREEJS-052 — Round win scoring and wins-to-match

Status: **LOCKED by THREEJS-052 (2026-08-19)**

THREEJS-052 makes winning-round scoring canonical on top of the accepted-placement win proof from THREEJS-047 and the exact round-end revision introduced by THREEJS-051.

## Winning accepted move

`commitAuthoritativeRoundWin(state, { expectedRevision })` may close a round only when:

- `expectedRevision` exactly matches canonical `revision`;
- the round has not already ended;
- lifecycle is uninterrupted `turn-loop`;
- configured `winsToMatch` is exactly one of the locked values `3` or `5`;
- canonical `lastMove` belongs to the current stable `activeSeatId` and configured color;
- `winningOutcomeAfterAcceptedPlacement(...)` proves one or more winning patterns containing that exact accepted slot.

A stale/pre-existing winning pattern elsewhere cannot close the round, and a non-winning accepted move cannot score.

## Score delta

One winning accepted move increments exactly one seat:

`winner score += 1`

Every other configured score remains byte-for-byte numerically unchanged. The number of simultaneously completed patterns is irrelevant to score magnitude: a move completing two or more patterns still awards exactly **one** round point.

The round closes once, increments `completedRounds` once, records `roundEndRevision = revision`, clears active turn/deadline and advances lifecycle `turn-loop → win`.

Re-applying the resulting canonical state fails as `round_already_ended`; re-evaluating the same immutable input produces the same single +1 result rather than a cumulative side effect.

## Locked wins-to-match semantics

Match completion depends only on the winner's authoritative score after the +1 increment:

`matchComplete = scores[winnerSeat] >= winsToMatch`

The configured choices remain exactly `3` and `5` wins.

`completedRounds` is informational/history state only. It must never terminate the match. A match can therefore have:

- `completedRounds = 3` while every seat has fewer than 3 wins;
- `completedRounds = 5` while every seat has fewer than 5 wins;
- any larger completed-round count when draws or split wins occurred.

Conversely a seat reaching 3/3 or 5/5 wins completes the match immediately regardless of the completed-round count.

Before a new round-win commit, no configured seat may already be at or above the wins-to-match threshold while `matchComplete` is still false; that malformed state fails closed.

## Match winner

When the winning seat reaches the threshold, canonical state sets:

- `matchComplete = true`
- `matchWinner = { seatId, color, wins }`
- `matchWinners = [matchWinner]`

Otherwise `matchComplete=false`, `matchWinner=null`, and `matchWinners=[]`.

`canonicalWinResult(state)` reconstructs the persisted result using canonical score, `roundEndRevision`, match completion and winner fields. Later movement of live `revision` cannot rewrite the recorded round-end revision.

## Draws

THREEJS-051 remains the sole draw authority. A draw increments `completedRounds` but awards **zero score** and never completes a match merely because `completedRounds` reaches 3 or 5.

## Revision boundary

THREEJS-052 records the current exact revision as `roundEndRevision` but does not advance gameplay `revision`. Mutation/revision/exactly-once advancement remains owned by THREEJS-072.

## Verification

Run:

- `node --test tests/threejs_win_scoring_contract.test.mjs`
- `node --test tests/threejs_winning_patterns_contract.test.mjs`
- `node --test tests/threejs_true_draw_contract.test.mjs`

The scoring contract covers multi-pattern +1 behavior, duplicate application, both 3-win and 5-win thresholds, large/completed-round counts that must not end a match, draw +0 behavior, stale revision, active-seat/last-move proof and persisted exact end revision.
