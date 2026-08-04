# Equivalence Checklist

A rebuild is equivalent only when all items pass.

## Rules

- [ ] 36 pieces exist: 3 sizes × 3 copies × 4 colors.
- [ ] Each cell accepts one of each size, even from different colors.
- [ ] A duplicate same-size slot and a fourth same-size piece are rejected.
- [ ] All 8 lines detect same-size and both graded directions.
- [ ] Every cell detects the complete-cell win.
- [ ] A blocked player is skipped; nobody able to move produces a draw.
- [ ] One win adds exactly one point; reset keeps scores.
- [ ] Local is open-ended; online completes exactly 3 or 5 rounds.

## Spatial and assets

- [ ] Cell spacing is 48 and base radius is 135.
- [ ] All three sizes share each cell center.
- [ ] Every home stack, base, board, and score marker matches `WORLD.md`.
- [ ] Board rests on the table with no visible floating or clipping.
- [ ] All included models and both official logos load without fallback geometry.

## Interaction and motion

- [ ] Stack opens remaining sizes and selects the largest first.
- [ ] Legal markers depend on selected size, not general cell occupancy.
- [ ] Tap and drag use the same validator.
- [ ] Invalid drop changes no game state and returns the piece.
- [ ] Double input cannot submit two moves.
- [ ] Intro is deterministic and snaps correctly at 4010 ms.
- [ ] Piece travel ends exactly at the committed slot.
- [ ] Only winning pieces blink.
- [ ] Reset returns all active pieces home together.
- [ ] Reduced motion reaches the identical final state.

## Scenes and online

- [ ] Every state in `SCENES.md` can be entered by a preview/test fixture.
- [ ] Every transition can replay from a clean initial state.
- [ ] Refresh/reconnect rebuilds the exact server board and identity.
- [ ] Two clients cannot commit the same revision/slot.
- [ ] Conflict, timeout, cancellation, leave warning, and rematch wait are visible.
- [ ] Desktop, compact landscape, portrait, resize, and resume are verified.
