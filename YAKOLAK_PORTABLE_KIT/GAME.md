# Game Contract

## Pieces and board

- Cell IDs are `0–8`, row by row.
- Every cell contains three independent slots: small, medium, large.
- Each color has exactly 3 small, 3 medium, and 3 large pieces.
- A move is legal only when:
  1. it is that player's turn;
  2. the chosen cell exists;
  3. the chosen size slot is empty;
  4. that player still has an unused piece of that size;
  5. the game is not locked.
- Different colors and sizes may coexist in one cell.
- No capture, replacement, or movement of placed pieces.

## Color identities and turn ring

| Engine identity | Player color |
|---|---|
| right | white |
| back | blue |
| left | gold |
| front | green |

Turn ring: **white → blue → gold → green**. Rotate this ring so the selected starting color is first, then take the configured player count.

## Setup

- Local: choose color, then choose 2, 3, or 4 total players. Remaining seats are bots.
- Learn: show the three win demonstrations, then use the normal local setup.
- Online: create or join a room, choose an available color, and start only when the configured number of players is present.

## Turn resolution

1. Validate the move against the latest state.
2. Reserve one unused physical piece.
3. Fill the selected cell/size slot.
4. Record the last move.
5. Check victory.
6. If no victory, advance to the next player who has a legal move.
7. If nobody has a legal move, declare a draw.

Local normal turn time is 18 seconds; expiry skips the move. The first guided human turn may pause the timer. Current online play has no authoritative turn timer.

## Victory

A move wins immediately when its color completes one condition:

1. **Same-size line:** the same size in all three cells of any row, column, or diagonal.
2. **Graded line:** small-medium-large or large-medium-small across any row, column, or diagonal.
3. **Complete cell:** small, medium, and large of one color inside the same cell.

Winning lines:

`0-1-2, 3-4-5, 6-7-8, 0-3-6, 1-4-7, 2-5-8, 0-4-8, 2-4-6`

## Rounds and scores

- Win: lock input, show winning pieces, add one point, reset the board.
- Draw: add no point, reset the board.
- Scores survive board resets.
- Local play has no mandatory match end.
- Online host selects exactly 3 or 5 rounds. After the chosen number is completed, highest score wins; equal leaders produce a tied match.
- Local next round starts from the configured first player. Online round starters rotate; a new online match returns to the first seat.

## Bot behavior

Evaluate every legal move using these priorities:

| Reason | Value |
|---|---:|
| Wins now | +10000 |
| Blocks an opponent's immediate win in that slot | +5200 |
| Progress on own same-size line | count × 18 |
| Center cell | +18 |
| Large / medium / small | +8 / +5 / +3 |
| Random variation | 0–8 |

Round skill cycle: `0.94, 0.56, 0.86, 0.68, 0.78`.
Color multipliers: white `0.74`, blue `0.88`, gold `0.66`, green `0.80`; clamp final skill to `0.35–0.97`.
Choose the best move with that probability; otherwise choose randomly among the best five. Thinking delay: 420–740 ms.
