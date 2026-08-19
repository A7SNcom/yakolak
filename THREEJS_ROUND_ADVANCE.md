# THREEJS-054 — Next-round reset and starter rotation

Status: **LOCKED by THREEJS-054 (2026-08-19)**

THREEJS-054 defines one pure canonical round-advance transition after a non-match-completing win or draw. It consumes the stable configured seat ring from THREEJS-048, the canonical round-end result from THREEJS-051/052, and the local absolute deadline helper from THREEJS-049.

## Pure round advance

`advanceCanonicalRound(state, { expectedRevision })` is allowed only when:

- `expectedRevision` matches canonical `revision`;
- the prior round has a non-null `roundEndRevision`;
- the prior result is exactly win or draw and lifecycle agrees;
- no active turn/deadline remains;
- the match is not complete;
- lifecycle is uninterrupted.

The transition is pure and returns a new `round-ready` canonical snapshot.

## Reset boundary

The new round clears only round-scoped state:

- board becomes empty;
- derived inventory restores every configured color/size to `RULES.copiesPerSizePerColor` home pieces;
- `lastMove = null`;
- ordered `skips = []`;
- winner/draw/match-result fields are cleared for the new round;
- `roundEndRevision = null`;
- restart/rematch vote maps are reset false so no prior-round vote leaks forward;
- old deadline is absent;
- lifecycle advances through `win/draw → reset → round-ready`, invalidating stale presentation callbacks.

Canonical state contains no renderer selection or pending-animation objects, so there is no second selection/pending authority to reset. Presentation must derive home pieces from the empty canonical board/full derived inventory.

## Preserved match/session state

The transition preserves:

- `lobbyGeneration`;
- `preferredColor`;
- configured stable seats/types/colors/readiness;
- `targetPlayers`;
- `winsToMatch`;
- cumulative match `scores`;
- `completedRounds` already committed by the prior win/draw;
- current gameplay `revision` until THREEJS-072/057 own revision advancement semantics.

Score markers therefore remain visible across normal round reset because THREEJS-053 projects the unchanged authoritative scores.

## Starter rotation

Round 1 begins from the first configured seat. Each subsequent round advances exactly one seat through the resolved THREEJS-048 configured order.

For an ended round number `N`, the next starter is:

`configuredOrder[N % configuredSeatCount]`

The round number itself increments exactly once. Reapplying `advanceCanonicalRound` to its `round-ready` result fails because that state no longer contains an ended-round result.

## Deadline after commit

The pure reset intentionally produces:

- lifecycle `round-ready`;
- the selected `activeSeatId` starter;
- `deadlineAtMs = null`.

`beginCommittedLocalRoundTurn(...)` is a separate local-authority step that accepts the already committed/accepted `round-ready` state, advances lifecycle to `turn-loop`, then creates the new absolute 18-second deadline through THREEJS-049.

This ordering guarantees the next deadline does not exist before the new-round state. Sessions containing an Online seat fail the local deadline path; THREEJS-070 later owns online authoritative deadline creation.

## Match-complete boundary

A match-completing THREEJS-052 win cannot advance into another normal round. THREEJS-056 owns rematch/new-match lifecycle and score reset.

## Verification

Run:

- `node --test tests/threejs_round_advance_contract.test.mjs`
- `node --test tests/threejs_win_scoring_contract.test.mjs`
- `node --test tests/threejs_true_draw_contract.test.mjs`
- `node --test tests/threejs_persistent_score_markers_contract.test.mjs`

The focused contract covers 2/3/4-seat starter rotation across all host preferred colors, win and draw reset, exact-once round increment, full piece-home inventory, score/config preservation, score-marker persistence, vote/result clearing, stale callback invalidation, match-complete rejection, and local deadline creation only after `round-ready` commit.
