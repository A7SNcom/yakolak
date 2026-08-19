# THREEJS-056 — Match end, Rematch and Return to Setup

Status: **LOCKED by THREEJS-056 (2026-08-19)**

THREEJS-056 defines the canonical match-end boundary and the two local post-match exits: Rematch and Return to Setup. It consumes THREEJS-052 match completion, THREEJS-053 score-marker projection and the THREEJS-060 lifecycle state machine without introducing browser-owned match state.

## Commit match end

`commitCanonicalMatchEnd(state, { expectedRevision })` accepts only an uninterrupted canonical `win` state whose score has already reached `winsToMatch` and whose persisted `winner`, `matchWinner`, `matchWinners`, score threshold and `roundEndRevision` agree.

The transition is:

`win → reset → match-end`

Only lifecycle/presentation generation changes. Final board, winning move/result, cumulative score and exact `roundEndRevision` remain canonical so match-end presentation can render the real final position rather than a synthetic copy.

Duplicate match-end commit is rejected.

## Rematch

Local Rematch uses the existing engine-neutral `rematch` intent. It is available only from uninterrupted `match-end` and only when no configured seat is Online; online rematch consensus remains owned by THREEJS-076.

A Rematch request captures the stable local host seat, gameplay revision, exact round-end revision and current `presentationGeneration`. Replaying it after the lifecycle changes is stale.

Accepted Rematch atomically creates a fresh match while preserving:

- `lobbyGeneration`;
- `preferredColor`;
- `targetPlayers`;
- configured stable seats, types, colors and readiness;
- `winsToMatch`;
- gameplay `revision` until THREEJS-072/057 own revision advancement.

It resets:

- board and derived inventory;
- cumulative scores to zero;
- restart/rematch votes;
- deadline;
- last move and ordered skips;
- winner/draw/match-complete fields;
- `round=1` and `completedRounds=0`;
- `roundEndRevision=null`.

The first configured stable seat becomes `activeSeatId`, lifecycle advances `match-end → round-ready`, and no new deadline exists until the committed new-round state is started by its authority adapter. Because canonical scores are zero, THREEJS-053 physical score markers clear from authority rather than from presentation code.

## Return to Setup

Return to Setup is an explicit session-abandon transition, not a score reset disguised as setup.

From uninterrupted local `match-end`, it advances lifecycle:

`match-end → setup`

and creates a clean setup snapshot without reload:

- increments `lobbyGeneration` once, invalidating callbacks tied to the abandoned configured session;
- clears `preferredColor`, `targetPlayers` and `winsToMatch`;
- clears configured seats and therefore inventory/score/vote maps;
- clears board, deadline, last move, skips and all result fields;
- sets `round=0` and `completedRounds=0`;
- preserves gameplay `revision` pending THREEJS-072.

The lifecycle `presentationGeneration` also increments, so stale animation/UI callbacks from the completed match cannot advance the clean setup state.

## Authority boundary

`commitCanonicalMatchEnd` is pure canonical lifecycle work and does not choose transport authority.

`createLocalRematchRequest`, `applyAuthoritativeLocalRematch`, `createReturnToSetupRequest` and `applyAuthoritativeReturnToSetup` are local-only and fail closed if the supplied seat-type classifier identifies any Online seat. Browser-side local code therefore does not resolve the open online rematch/abandon consensus work.

## Verification

Run:

- `node --test tests/threejs_match_end_lifecycle_contract.test.mjs`
- `node --test tests/threejs_win_scoring_contract.test.mjs`
- `node --test tests/threejs_persistent_score_markers_contract.test.mjs`
- `node --test tests/threejs_session_lifecycle_contract.test.mjs`

The focused contract starts from a real threshold-winning placement, commits match end, verifies final-board/result preservation, Rematch configuration preservation and score reset, score-marker zeroing, request replay/stale handling, clean Return-to-Setup abandonment/hydration and Online fail-closed behavior.
