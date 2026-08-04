# Online Contract

## Room setup

- Private room code: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- Players: 2, 3, or 4.
- Match length: exactly 3 or 5 completed rounds, chosen by host before room creation.
- Creator chooses a color; joiners choose only remaining colors.
- Start automatically when the target player count is reached.
- Show target round count to joiners before they commit to a color.

## Authority

- Server owns room status, players, colors, turn, board, inventory, scores, round, winner, draw, last move, rematch readiness, and revision.
- Every mutating request includes the current revision.
- A revision mismatch returns the latest full room state; client discards its stale pending presentation and rebuilds.
- The client may select a size locally, but it may not permanently place a piece before acceptance.

## Match lifecycle

`waiting → playing → round finished → all players ready → next round`

After round 3 or 5:

`match finished → all players ready → new match`

- A round winner gains one point; a draw gains none.
- After the target number of rounds, the highest score wins; equal highest scores are a tie.
- Round starter rotates. A new match starts from seat one.
- All players must request rematch before the next round or match begins.
- Leaving a started match cancels the current room/game for everyone; warn before leaving.

## Connection behavior

| Setting | Value |
|---|---:|
| normal poll | 900 ms |
| maximum backoff | 8000 ms |
| request timeout | 6500 ms |
| room lifetime after activity | 8 hours |

Store room code, seat, and secret session token for refresh recovery. On refresh, resume, or reconnect, fetch the room before enabling input and rebuild all pieces from board state.

## Required failure states

- invalid room code, player count, round count, color, or move;
- room not found, full, cancelled, or not playing;
- color already taken;
- not your turn;
- same-size slot occupied;
- no piece of that size remains;
- revision conflict;
- request timeout;
- service unavailable or server error;
- unauthorized/expired seat.

Each error has a clear retry, back, exit, or resync action. No error may consume a piece or advance a turn.
