# YAKOLAK — Definitive Rebuild Guide

This folder is the only implementation source of truth for rebuilding YAKOLAK. Historical versions, wrapper chains, developer-screen cards, experiments, and abandoned menu or room flows are references only and must not be copied.

## 1. Product contract

- One gameplay system serves offline humans, computer players, online players, and mixed matches.
- Only seat ownership and state authority differ. Rules, turns, timers, scoring, rounds, interactions, animations, and outcomes are identical.
- A match has 2, 3, or 4 seats and exactly 3 or 5 completed rounds.
- The board state decides gameplay. Rendering, UI, camera, sound, particles, and animation never decide or mutate rules.
- Every accepted mutation is validated and committed exactly once.

## 2. Setup flow

The mandatory sequence is:

1. **Preferred color:** choose white, blue, gold, or green.
2. **Total players:** choose 2, 3, or 4.
3. **Remaining seats:** assign each remaining seat as `Computer` or `Online`.
4. **Match length:** choose 3 or 5 rounds.
5. **Invitations:** create one seat-specific invitation for every online seat.
6. **Ready check:** computer seats are ready immediately; online seats are ready after joining.
7. **Start:** begin only when every configured seat is ready.

Seat order uses the fixed ring:

`white → blue → gold → green`

Rotate the ring so the preferred color is first, then keep the selected number of seats. Each online invitation reserves one exact seat and color; the joining player does not choose another color.

Setup choices remain reversible until invitations are created. Changing color, player count, seat type, or round count after invitation creation invalidates the old lobby and invitations and creates a new lobby. An unjoined online seat may be replaced by a computer without recreating the lobby.

Every setup step has one visible current choice, one explicit Continue action, and one Back action. A choice cannot be submitted twice while its exit transition or network request is pending.

## 3. Board, pieces, and coordinates

Coordinate system: Y is up; board center is `(0,0,0)`. Any engine unit scale is allowed only if every object and motion is scaled uniformly.

### Board

- 3×3 cells, IDs `0–8`, row by row.
- Each cell has three independent slots: small, medium, and large.
- All three size slots share the same cell center.
- A cell may contain different sizes and colors simultaneously.
- One size slot may contain only one piece.

| Cell | X,Y,Z |
|---:|---|
| 0 | `-48,2,-48` |
| 1 | `0,2,-48` |
| 2 | `48,2,-48` |
| 3 | `-48,2,0` |
| 4 | `0,2,0` |
| 5 | `48,2,0` |
| 6 | `-48,2,48` |
| 7 | `0,2,48` |
| 8 | `48,2,48` |

### Pieces

- Colors: white, blue, gold, green.
- Sizes: small, medium, large.
- Each color owns 3 pieces of each size: 9 per color, 36 total.
- A placed piece never moves, captures, replaces, removes, or changes size during a round.

### Board and bases

| Object | Position X,Y,Z | Rotation X,Y,Z degrees |
|---|---|---|
| Board | `0,6,0` | `-90,0,0` |
| White/right base | `135,6,0` | `-90,0,0` |
| Blue/back base | `0,6,-135` | `-90,0,-90` |
| Gold/left base | `-135,6,0` | `-90,0,180` |
| Green/front base | `0,6,135` | `-90,0,90` |

Home-stack centers:

- White/right: `(135,2,-48)`, `(135,2,0)`, `(135,2,48)`
- Blue/back: `(-48,2,-135)`, `(0,2,-135)`, `(48,2,-135)`
- Gold/left: `(-135,2,-48)`, `(-135,2,0)`, `(-135,2,48)`
- Green/front: `(-48,2,135)`, `(0,2,135)`, `(48,2,135)`

Each home center initially contains one nested large, medium, and small piece. Piece rotation is `-90,0,0` degrees.

Score markers use radius `85`, gap `11`, and placement order `0,-1,+1,-2,+2,-3,+3` from each side center. Exact room, stack, score, camera, and responsive transforms are in `assets/layout/world-layout.json`.

## 4. Turn rules

A move is legal only when all conditions are true:

1. The match is accepting input.
2. It is that seat’s turn.
3. No move from that seat is already pending.
4. The requested cell exists.
5. The requested size slot is empty.
6. The seat still owns an unused piece of that size.
7. The request uses the current authoritative revision.

Turn resolution:

1. Start the authoritative 18-second deadline.
2. Select one remaining size.
3. Show only legal cells for that size.
4. Submit one target through the shared validator.
5. Reserve and remove one physical piece from inventory.
6. Commit the board slot, last move, inventory, revision, and next result once.
7. Animate the accepted piece to the committed slot.
8. Check victory.
9. If there is no victory, advance to the next seat with a legal move.
10. Visibly skip seats with no legal move.
11. If no seat has any legal move, end the round as a draw.

Timer expiry skips the current turn without consuming a piece or changing the board. A cycle of timeouts is not a draw while legal moves still exist. Computer thinking occurs inside the same 18-second deadline.

Tap, click, drag, keyboard, gamepad, bot, timeout, and network paths must produce the same intent objects and use the same validator and commit path.

### Confirmation and cancellation

- Tap/click: selecting a legal target is the move confirmation.
- Drag: releasing inside the valid target radius is the move confirmation.
- Keyboard/gamepad: the focused target requires an explicit Confirm action.
- Before submission, Cancel closes the stack or clears the selected size and target.
- After a request is pending, it cannot be locally undone; wait for accepted, rejected, timeout, or resync.
- After acceptance, the move is final for that round.

Normal drop radius is `31`; forgiving touch radius is `42`; drag height is `14`.

## 5. Win conditions

Check victory only after an accepted move. That move wins immediately for its color when it completes one condition:

1. **Same-size line:** the same size in all three cells of a row, column, or diagonal.
2. **Graded line:** small-medium-large or large-medium-small across a row, column, or diagonal.
3. **Complete cell:** small, medium, and large of the same color in one cell.

Winning lines:

`0-1-2, 3-4-5, 6-7-8, 0-3-6, 1-4-7, 2-5-8, 0-4-8, 2-4-6`

A single move may satisfy multiple patterns, but awards only one round point.

## 6. Rounds, scoring, ties, and restart

- Every match is exactly 3 or 5 completed rounds.
- Round win: `+1` point.
- Draw: `+0` points.
- Scores persist through round resets.
- The next round starter rotates to the next seat in the fixed seat order.
- After the final round, the highest score wins the match.
- Equal highest scores produce a tied match; no hidden tiebreaker is used.
- Restart round is available only before a committed move and requires confirmation from the local host or every online human seat.
- Rematch keeps seat configuration and match length, resets scores and board, and starts from the first seat.
- Return to Setup discards the current lobby and match after explicit confirmation.

## 7. Authority and synchronization

- With no online seats, the local session is authoritative.
- With one or more online seats, the shared session service is authoritative.
- The authority owns lobby configuration, seats, session tokens, turn, deadline, board slots, inventory, scores, round, winner, draw, last move, readiness, and revision.
- Computer decisions run on the authoritative side.
- Every mutating request includes a unique request/move ID and the current revision.
- Applying the same accepted result again must not duplicate a piece, point, turn, or animation.
- A stale revision returns a complete current snapshot. The client discards stale pending presentation and rebuilds from that snapshot.
- A timer is derived from the authoritative deadline, never from accumulated client intervals.
- Animation completion carries its state revision; stale completion callbacks are ignored.
- Before enabling input after launch, refresh, resume, reconnect, or visibility return, rebuild every visible piece and player state from authority.

## 8. Required scene flow

Main flow:

`Boot → Loading → Loader Handoff → Room Reveal/Brand → Preferred Color → Player Count → Seat Configuration → Round Count → Invitations/Ready → Unboxing → Optional Tutorial → Round Ready → Turn Loop → Win/Draw → Score/Reset → Next Round or Match End`

Required player-visible states:

| State | Required outcome |
|---|---|
| Boot | Initialize renderer, rules, storage/session, and asset manifest. |
| Loading | Show the approved bouncing star and progress; no blank frame. |
| Loading error | Explain failure and offer Retry. |
| Loader handoff | The loading star becomes the same star on the room wall. |
| Room reveal/brand | Reveal the neutral room, table, YAKOLAK and MTKYF marks. |
| Preferred color | Show and confirm the four physical color sets. |
| Player count | Choose 2, 3, or 4. |
| Seat configuration | Assign each remaining seat Computer or Online. |
| Round count | Choose 3 or 5. |
| Invitations/ready | Show reserved colors, share/copy, joined status, replacement, and readiness. |
| Unboxing | Lid opens; bases and all 36 pieces assemble. |
| Tutorial | Demonstrate all three win types and one guided real move; skippable. |
| Round ready | Board empty, pieces home, scores retained, starter identified. |
| Turn start | Active seat and 18-second deadline are unmistakable. |
| Stack open | Remaining sizes separate vertically. |
| Size selected | Legal cells for that size only are shown. |
| Dragging/targeting | One candidate target is shown; camera control is disabled. |
| Invalid action | Red/invalid feedback; piece returns; state is unchanged. |
| Move pending | Input locked while authority validates. |
| Move accepted/rejected | Accepted piece travels; rejected move explains reason and restores selection. |
| Last move | Latest accepted move remains visibly identifiable. |
| Bot thinking | Input locked; bot uses the same legal-move request. |
| Timeout/no-move skip | Identify skipped seat and hand off. |
| Turn handoff | Close selection, change active seat, reset deadline. |
| Win highlight | Highlight only the exact winning pieces. |
| Score award | Add one persistent marker once. |
| Draw | Clearly show draw; add no marker. |
| Round reset | Return all active pieces home together. |
| Match end | Final scores, winner/tie, Rematch, and Return to Setup. |
| Network pending/error | Show action, retry/back/exit, and never mutate state on failure. |
| Reconnecting/resync | Lock input, restore identity and full snapshot, then return to prior state. |
| Cancelled | Explain explicit leave, expired session, or lobby cancellation. |
| Resize/resume | Refit the current scene without restarting it. |
| Reduced motion | Preserve state order, messages, locks, and exact final transforms. |

Error and recovery states may interrupt any state. Recovery returns to the latest authoritative state, not to a guessed previous screen.

## 9. Camera states

Use the exact poses in `assets/layout/world-layout.json`.

Required camera categories:

- Entry wall star: desktop, compact landscape, portrait.
- Brand/setup surfaces: primary and secondary, each responsive.
- Play overview: desktop, compact landscape, portrait 2-player, portrait 3–4-player.
- Tutorial overview.
- Current-player emphasis without hiding the board or other players.

Camera rules:

- Interpolate position, target, orientation, and FOV together.
- Use shortest-path orientation interpolation.
- Destination content exists before travel begins.
- Never expose an empty wall, missing table, or uninitialized board.
- Disable free camera movement during setup confirmation, drag, move travel, win, reset, and scripted camera travel.
- On resize or orientation change, refit the current state; do not replay the scene.

## 10. Motion timings

All values are milliseconds. Default easing is smooth cubic ease-in-out. State commits before presentation starts. A skipped or cancelled presentation snaps once to the same exact final state.

| Motion | Duration | Required result |
|---|---:|---|
| Loading-star loop | `820` | Bounce, impact squash, rebound, 24° rotation. |
| Loader hold | `280` | Complete room frame exists behind overlay. |
| Wall star → play overview | `2200` | Continuous room reveal. |
| Post-reveal hold | `620` | Stable readable overview. |
| Setup-surface camera travel | `2050` | Destination is already rendered. |
| Setup choice exit | `520` | ±7 X, +18 Y, -14 Z, scale 18%, +0.62 rad Y. |
| Setup panel in/out | `460 / 420` | Confirm step and lock duplicate input. |
| Invitation reveal/joined | `360 / 420` | Reserved color and readiness persist. |
| Stack open/close | `360 / 360` | Remaining sizes separate by 19 Y / return with arc 10. |
| Invalid return | `300` | Return with arc 8; no state change. |
| Accepted placement | `520` | Arc 18; end exactly at committed cell center. |
| Tutorial placement | `460` | Arc 18; 110 pause between scripted moves. |
| Bot thinking | `420–740` | No mutation before accepted request. |
| Timeout/no-move handoff | `520` | Skipped seat is clearly identified. |
| Win highlight | `3000` | Five pulses on winning pieces only. |
| Score confirmation | `900` | New marker remains visible. |
| Draw confirmation | `1200` | No marker is added. |
| Round reset | `620` | All active pieces return together with arc 16. |
| Tutorial/overview camera | `520` | Finish at exact responsive overview pose. |

### Unboxing

Intro order is:

`white/right → gold/left → green/front → blue/back`

- Lid initial transform: position `(0,62.5,0)`, rotation `(-90,180,0)`.
- Lid shake `420`; lift `900`; lift height `740`.
- Delay between bases `360`; base rise `260`; travel `620`; drop `280`.
- Piece lead `360`; piece travel `850`; arc `30`; stack stagger `42`.
- Use `assets/layout/intro-scatter.csv` for the exact 36 starting transforms.
- At `4010`, snap board, bases, pieces, and lid visibility to exact final values.
- Skip Intro performs the same final snap once.

Reduced-motion values: initial hold `120`, room reveal `700`, post-reveal hold `180`, setup-surface travel `850`. Functional feedback such as invalid action, turn change, win identification, and connection state remains visible.

## 11. Online invitations, disconnect, and recovery

Invitation requirements:

- One secure, shareable, seat-specific link per online seat.
- Link contains no reusable authority secret visible to another seat.
- The join screen shows game name, reserved color, player count, round count, and host identity before acceptance.
- An invalid, expired, already-used, or cancelled invitation shows a clear exit action and never occupies a seat.
- Joining is idempotent; refreshing reclaims the same seat through its session token.

Connection behavior:

- Normal state refresh/poll target: `900 ms`.
- Retry backoff ceiling: `8000 ms`.
- Mutating request timeout: `6500 ms`.
- A transient disconnect locks input but retains the reserved seat and session identity.
- Reconnect fetches the complete snapshot before any input is enabled.
- The authoritative deadline continues; a disconnected player may time out normally.
- Explicit Leave after match start cancels the active match for all seats after warning.
- No automatic computer substitution occurs after the match starts.
- A room may expire after 8 hours without activity; expiration produces a cancelled state, not a guessed result.

## 12. Input, mobile, desktop, and accessibility

- Support touch, mouse, keyboard, and gamepad through the same semantic actions.
- Do not require hover, precision dragging, multi-touch, or audio.
- Touch targets are at least `44×44` CSS pixels and respect display safe areas.
- Portrait and landscape keep the entire board, active player, timer, and primary action visible.
- Prevent page scrolling, text selection, or browser gestures only while an intentional board drag is active.
- Keyboard: visible focus; arrows move between sizes/cells; Enter/Space confirms; Escape/Back cancels.
- Held keys, pointer duplication, touch-generated mouse events, and rapid taps cannot submit more than one move.
- Color is never the only state signal; pair it with position, label, icon, pattern, or outline.
- Announce active player, remaining time warnings, accepted/rejected move, score, winner/tie, and connection changes to assistive technology.
- Text remains readable at 200% zoom.
- Reduced motion is honored at launch and when changed during play.
- Sound is optional, independently muteable, and never carries unique gameplay information.

## 13. Visual and asset rules

Reference palette:

- Wall `#f7f7f4`
- Floor `#deddd7`
- Table `#aeb2b6`
- Board `#4a5562`
- White `#f1eee6`
- Blue `#3769a5`
- Gold `#b78a44`
- Green `#2f856a`
- Dark ink/loading star `#3f3f3f`

The room is generated from simple planes/boxes using `assets/room/ROOM.md`; there is no missing room model. Keep the room neutral, board readable, pieces distinct, and table contact free of floating or clipping.

Use only the approved files listed in `assets/manifest.json`. `assets/reference/approved-contract.json` defines the required rules, materials, lighting ratios, semantic icons, sound cues, and motion references. Silence is a valid implementation because no canonical audio recording was approved.

## 14. Error invariants

- Invalid input, rejected move, timeout, disconnect, request failure, or asset failure never consumes a piece, adds a point, or advances a turn unless authority explicitly commits that outcome.
- Every error names the failed action and offers one relevant action: Retry, Resync, Back, or Exit.
- A fatal boot/asset error returns to Loading Retry.
- A recoverable network error preserves the current lobby/match identity.
- Unauthorized or expired identity returns to the invitation/setup flow.
- A full snapshot overrides stale UI, animation, selection, timer, and local prediction.

## 15. Acceptance gate

A rebuild is equivalent only when all checks pass:

- 36 pieces load from the approved assets.
- All cell/size occupancy rules and inventory limits pass.
- All three win types, all eight lines, and both graded directions pass.
- One accepted move can add at most one point.
- Skip, timeout, no-legal-move draw, scoring, starter rotation, 3/5-round completion, tie, rematch, and restart pass.
- Offline-only, bot-only opponents, online-only, and mixed online/computer seats produce identical rule outcomes from the same move sequence.
- Duplicate input and duplicate network results cannot duplicate state or presentation.
- Two clients cannot commit the same revision or size slot.
- Refresh, resume, disconnect, reconnect, stale revision, timeout, cancellation, and room expiration rebuild or end cleanly.
- Every state in this guide can be entered and replayed independently.
- Desktop, compact landscape, portrait, orientation change, 200% zoom, keyboard-only, touch-only, and reduced motion end in exact valid states.
- No historical wrapper, numbered runtime chain, source-text patch, framework-specific architecture, old mode menu, named-room experiment, or alternate local/online rule set is reintroduced.
