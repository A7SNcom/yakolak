# YAKOLAK — Clean Rebuild Contract

This folder is the **only implementation source of truth**. Rebuild the same game in any engine, framework, language, renderer, or networking stack. Ignore historical versions, wrappers, test pages, and old menu routes.

## Package

- `README.md` — complete rules, flow, scenes, motion, and acceptance contract.
- `assets/logos/` — official YAKOLAK and MTKYF logos.
- `assets/models/` — board/lid, player base, three piece sizes, score marker.
- `assets/table/` — table shape and optional surface maps.
- `assets/room/` — generated-room specification and plan.
- `assets/ui/` — approved loading star.
- `assets/layout/world-layout.json` — exact spatial and camera data.
- `assets/layout/intro-scatter.csv` — exact starting transforms for all 36 intro pieces.
- `assets/manifest.json` — asset inventory.

## Product rule

There is **one gameplay system** for offline, online, bots, and mixed matches. Only seat ownership and state authority differ; board rules, rounds, scoring, scenes, timing, and interaction remain identical.

## Setup journey

The first player choice is always the preferred color.

1. **Choose preferred color:** white, blue, gold, or green. This is the host/local player's fixed seat.
2. **Choose total players:** 2, 3, or 4.
3. **Configure every remaining seat:** `Computer` or `Online`.
4. **Choose match length:** exactly 3 or 5 rounds.
5. For each online seat, create a seat-specific invitation link and show copy/share actions.
6. Computer seats are ready immediately. Online seats become ready when their invitation is joined.
7. Start when every configured seat is ready. Before start, an unjoined online seat may be changed to Computer.

Seat colors follow the fixed ring **white → blue → gold → green**, rotated so the chosen preferred color is first, then truncated to the selected player count. An invitation reserves its color; the joining player does not select another color.

## Board and pieces

- Board: 3×3 cells, IDs `0–8` row by row.
- Sizes: small, medium, large.
- Colors: white, blue, gold, green.
- Each color owns 3 pieces of each size: 9 per color, 36 total.
- Each cell has one independent slot for each size.
- Different sizes and colors may share a cell.
- A placed piece never moves, replaces, captures, or removes another piece during the round.

A move is legal only when it is that seat's turn, the match accepts input, the cell exists, the selected size slot is empty, and that seat still owns an unused piece of that size.

## Turn and result

1. Select one remaining size.
2. Show only legal cells for that size.
3. Submit one target through the shared validator.
4. Commit the state once.
5. Animate the accepted physical piece to the slot.
6. Check victory; otherwise advance to the next seat with a legal move.
7. Skip seats with no legal move. If no seat can move, the round is a draw.

Turn time is **18 seconds for every human or computer seat in every match type**. When it expires, the turn is skipped. The authoritative clock owns the deadline whenever online seats exist.

## Victory

A color wins immediately by completing one of these:

- **Same-size line:** the same size across any row, column, or diagonal.
- **Graded line:** small-medium-large or large-medium-small across any row, column, or diagonal.
- **Complete cell:** small, medium, and large of that color in one cell.

Lines: `0-1-2, 3-4-5, 6-7-8, 0-3-6, 1-4-7, 2-5-8, 0-4-8, 2-4-6`.

## Match

- Every match is exactly **3 or 5 completed rounds**.
- Win: one point. Draw: no point.
- Scores persist between round resets.
- Round starter rotates to the next seat.
- Highest score after the final round wins; equal leaders tie.
- Rematch keeps the same seat configuration unless the host returns to setup.

## Authority

- With no online seats, the local session is authoritative.
- With one or more online seats, a shared session service is authoritative.
- The authority owns seats, turns, deadlines, board slots, inventory, scores, round, winner, draw, last move, and revision.
- Every mutation carries a unique move ID and current revision.
- A stale revision returns a complete latest snapshot; the client discards pending presentation and rebuilds.
- Bots run on the authoritative side.
- Visuals, camera, particles, and animation never decide or mutate rules.

## Spatial identity

Use one uniform scale only. Board center is `(0,0,0)` and Y is up.

- Cell spacing: `48`.
- Cell centers: X/Z values `-48, 0, 48`; final piece Y `2`.
- Board/base Y: `6`.
- Player-base radius: `135`.
- White/right base: `(135,6,0)`.
- Blue/back base: `(0,6,-135)`.
- Gold/left base: `(-135,6,0)`.
- Green/front base: `(0,6,135)`.
- Drag height: `14`; normal drop radius `31`; forgiving touch radius `42`.

All exact object, stack, score-marker, room, camera, and responsive-view transforms are in `assets/layout/world-layout.json`. The room is generated geometry defined by `assets/room/ROOM.md`; there is no missing room model.

Reference palette: wall `#f7f7f4`, floor `#deddd7`, table `#aeb2b6`, board `#4a5562`, white `#f1eee6`, blue `#3769a5`, gold `#b78a44`, green `#2f856a`, dark ink `#3f3f3f`.

## Required player-visible scenes

| Order | Scene | Required result |
|---:|---|---|
| 1 | Boot / loading | Load rules and assets; bouncing star remains visible; failure offers retry. |
| 2 | Loader handoff | Loading star becomes the same star on the room wall without a blank frame. |
| 3 | Room reveal / brand | Reveal the neutral room, table, YAKOLAK logo, and MTKYF logo. No gameplay choice occurs before color selection. |
| 4 | Color setup | Show four physical color sets; confirm one preferred color once. |
| 5 | Player count | Choose 2, 3, or 4 total seats. |
| 6 | Seat configuration | For each remaining color, choose Computer or Online. |
| 7 | Round count | Choose 3 or 5 rounds. |
| 8 | Invitations / waiting | Show each reserved online seat, invitation link, join state, replace-with-computer action, and start readiness. |
| 9 | Unboxing | Lid opens; four bases and all 36 pieces assemble into exact final positions. |
| 10 | Optional tutorial | Demonstrate the three win types, then one guided real move; available on first run and from Help. |
| 11 | Round ready | Empty board, pieces home, scores retained, active starter identified. |
| 12 | Turn start | Current seat, 18-second deadline, input enabled only for that seat. |
| 13 | Piece selection | Home stack opens; size is selected; legal targets appear. |
| 14 | Drag / tap placement | One candidate target; valid commit or invalid return; camera input disabled while dragging. |
| 15 | Bot thinking | Brief locked thinking state, then the bot uses the same move request. |
| 16 | Move resolution | Pending, accepted/rejected, piece travel, last-move marker, and exact state snap. |
| 17 | Turn handoff / skip | Close stack, update timer/seat; visibly skip a seat with no legal move or expired time. |
| 18 | Win / draw | Highlight only winning pieces, or show draw; lock all move input. |
| 19 | Score / round reset | Add one persistent point only for a win; return all active pieces home together. |
| 20 | Match end | Final standings after 3/5 rounds; rematch or return to setup. |
| 21 | Connection recovery | Pending, timeout, reconnect, revision conflict, cancellation, and full-state resync with clear retry/exit. |
| 22 | Responsive / accessibility | Refit the current scene on resize/orientation change; reduced motion reaches the same exact final state. |

## Required motion

All durations are milliseconds. Default interpolation is smooth cubic ease-in-out; camera orientation uses the shortest path. Input stays locked until the exact final state is reached or snapped.

| Motion | Duration | Contract |
|---|---:|---|
| Loading-star cycle | 820 loop | Bounce, impact squash, rebound, 24° total turn. |
| Wall-star to room overview | 2200 | Continuous reveal; hold 280 before and 620 after. |
| Camera move between setup surfaces | 2050 | Destination exists before travel; never show an empty wall. |
| Setup choice exit | 520 | Selected set drifts ±7 X, +18 Y, -14 Z, scales to 18%, rotates +0.62 rad Y. |
| Setup panel in / out | 460 / 420 | Confirm current step and lock duplicate input. |
| Invitation reveal / joined confirmation | 360 / 420 | Keep seat color and readiness visually persistent. |
| Stack open / close | 360 / 360 | Separate remaining sizes by 19 Y; return uncommitted pieces with arc 10. |
| Invalid placement return | 300 | Return to selected stack with arc 8; state remains unchanged. |
| Accepted piece placement | 520 | Arc 18; finish exactly at committed cell center. |
| Tutorial placement | 460 | Arc 18 with 110 pause between scripted moves. |
| Bot thinking | 420–740 | No board mutation before its accepted move. |
| Turn-expired / no-move skip | 520 | Clearly identify skipped seat, then hand off. |
| Win highlight | 3000 | Five pulses on winning pieces only. |
| Score confirmation | 900 | New score marker remains visible. |
| Draw confirmation | 1200 | Add no score marker. |
| Round reset | 620 | All active pieces return home together with arc 16. |
| Tutorial / overview camera | 520 | Finish on the exact responsive overview pose. |

### Unboxing sequence

Intro order is **white/right → gold/left → green/front → blue/back**.

- Lid shake `420`; lift `900`; lift height `740`.
- Delay between bases `360`; base rise `260`, travel `620`, drop `280`.
- Piece lead `360`; piece travel `850`; arc `30`; stack stagger `42`.
- Exact initial transforms for all 36 pieces come from `assets/layout/intro-scatter.csv`.
- At `4010`, snap board, bases, pieces, and lid visibility to exact final values.
- Skipping the intro performs the same final snap once.

Reduced-motion continuity: holds `120/180`, room reveal `700`, setup-surface camera move `850`; all rules, locks, messages, and final transforms remain identical.

## Interaction invariants

- Tap, click, drag, bot, timeout, and network requests use one validator and one commit path.
- Only one pending move may exist per seat.
- Double input never consumes two pieces or advances two turns.
- Legal markers depend on the selected size slot, not general cell occupancy.
- Invalid actions never alter inventory, score, board, or turn.
- Accepted presentation may be skipped, but its exact final transform must still be applied.
- Refresh, resume, or reconnect rebuilds every visible piece from authoritative state before enabling input.

## Acceptance gate

The rebuild is complete only when:

- all 36 pieces and every included asset load from this folder;
- all three win types, all eight lines, skip, draw, scoring, 3/5-round ending, and tie behavior pass;
- offline-only, online-only, bot-only opponents, and mixed online/bot seats produce the same gameplay results;
- every scene and motion above can be entered and replayed independently;
- desktop, compact landscape, portrait, resize, reconnect, and reduced motion end on exact valid states;
- no historical wrapper, old mode menu, framework-specific architecture, or alternate gameplay rules are reintroduced.
