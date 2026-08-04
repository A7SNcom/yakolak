# YAKOLAK — Complete Engine-Agnostic Game Specification

Single portable contract for rebuilding **the same Yakolak game** in Unity, Godot, Unreal, Babylon.js, Three.js, or another engine without depending on the current wrapper chain.

This document intentionally separates:

1. **Canonical game rules** — must never change between engines.
2. **Canonical spatial layout** — may be uniformly scaled, but ratios and orientation remain fixed.
3. **Production presentation** — behavior currently shipped by `main` / `v125`.
4. **Approved motion references** — later reviewed branches `v126–v130`; use them when rebuilding the entry journey, but do not pretend they are already production.
5. **Replaceable implementation details** — renderer, networking library, UI toolkit, file formats, shaders, and physics.

## 0. Authority and provenance

When sources disagree, use this order:

1. The rules and invariants in sections 2–6 of this document.
2. Shared rules module from `v126` for move legality, win detection, no-move skipping, and draw resolution.
3. Production branch `main` / `v125-white-wall-continuity` for currently shipped menu, setup, gameplay, and online behavior.
4. Reviewed branches `v126–v130` for the clean loading-star and room-camera journey.
5. Older wrappers only to recover exact timings or geometry not contradicted above.

Known source references:

| Reference | Purpose |
|---|---|
| `main` / `v125-white-wall-continuity` | Current production presentation |
| `app-game-v085.js` through `app-game-v114.js` | Core board, intro, setup, tutorial, gameplay, bots, win/reset motions |
| `app-game-v121.js` | First wall-entry route |
| `app-game-v122.js` | Diegetic wall menu and room-to-table transition |
| `app-game-v123.js` | Tabletop setup overlay and lock presentation |
| `app-game-v124.js` | In-room online, learning, and lobby service walls |
| `app-game-v125.js` | Current white-wall menu continuity |
| `game-rules-v126.js` | Clean portable rules implementation |
| `entry-v126.js` | Clean wall-to-wall logo journey reference |
| `v128–v129` | Loading-star shape and approved bounce motion |
| `app-game-v130.js` | Approved loader-to-room-to-second-wall continuity reference |
| Developer screen / Google Sheet | Scene, journey, element, and preview inventory; useful but incomplete by itself |

### Audit result

The previous specification documented rules, coordinates, the unboxing intro, and a few camera poses, but omitted the complete scene graph and many visible transitions. The developer screen also listed only broad snapshots, not every operational scene. This revision adds the missing states, including camera travel, route transitions, setup exit, tray opening, size selection, drag/drop, invalid placement, network pending/conflict, bot thinking, timer expiry, skipped turns, last-move markers, reconnect sync, win scoring, draw reset, rematch, resize, and reduced-motion behavior.

---

## 1. Definitions

- **Scene:** a player-visible phase with its own camera, visible objects, UI, and input policy.
- **State:** authoritative game or connection status. A scene may render one or more states.
- **Motion:** a time-bounded visual transition. Motions never decide game rules.
- **Commit:** the single authoritative state change that accepts a move.
- **Presentation lock:** blocks new player input while a transition or server request is unresolved.
- **Zone:** one of the 9 board cells, IDs `0..8`.
- **Slot:** one size channel (`s`, `m`, or `l`) inside a zone.
- **Home stack:** one of three nested `l+m+s` stacks on a player's base.

All time values are milliseconds unless stated otherwise.

---

## 2. Non-negotiable game identity

- Board: `3 × 3`, exactly 9 zones.
- Player colors and engine IDs:
  - `right` = white
  - `back` = blue
  - `left` = gold
  - `front` = green
- Sizes: `s`, `m`, `l`.
- Each color owns exactly 3 pieces of every size: 9 pieces per color, 36 total.
- Each zone has three independent slots: one `s`, one `m`, and one `l`.
- Different sizes may coexist concentrically in one zone, regardless of owner.
- A slot is illegal only when the chosen zone already contains that same size.
- There is no capture, replacement, stacking order rule, or movement of a placed piece.
- Once committed, a piece remains in that zone until the round resets.
- A player may use at most 3 pieces of each size because that is their physical inventory.
- Supported active player counts: 2, 3, or 4.

```ts
type Color = 'right' | 'back' | 'left' | 'front';
type Size = 's' | 'm' | 'l';
type ZoneId = 0|1|2|3|4|5|6|7|8;
type Cell = { s: Color|null; m: Color|null; l: Color|null };
type Move = { color: Color; size: Size; zone: ZoneId };

type Win = {
  color: Color;
  type: 'same-size'|'graded'|'cell';
  cells: Array<{zone:ZoneId; size:Size}>;
};

const COLORS: Color[] = ['right','back','left','front'];
const TURN_RING: Color[] = ['right','back','left','front'];
const INTRO_ORDER: Color[] = ['right','left','front','back'];
const SIZES: Size[] = ['s','m','l'];
const WIN_LINES: ZoneId[][] = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];
```

---

## 3. Authoritative state model

The implementation may use classes, ECS, signals, reducers, or replicated objects, but it must be able to express this state without deriving rule-critical facts from mesh positions.

```ts
interface PlayerState {
  color: Color;
  kind: 'human'|'bot'|'remote';
  seat?: string;
  connected?: boolean;
}

interface LastMove {
  color: Color;
  size: Size;
  zone: ZoneId;
  moveNumber?: number;
}

interface GameState {
  phase:
    | 'boot'|'entry'|'setup'|'tutorial'|'playing'
    | 'winning'|'round-reset'|'draw'|'finished'|'cancelled';
  players: PlayerState[];
  humanColor: Color|null;
  turnIndex: number;
  board: Record<string,Cell>; // keys "0" ... "8"
  scores: Record<Color,number>;
  round: number;
  winner: Win|null;
  draw: boolean;
  locked: boolean;
  configured: boolean;
  started: boolean;
  tutorial: boolean;
  setupStep: 'color'|'players'|null;
  turnDeadline: number; // epoch ms; 0 when timer is paused
  lastMoves: Partial<Record<Color,LastMove>>;
  moveNumber: number;
  revision: number; // required for online conflict detection
}
```

### Empty board

```ts
function createEmptyBoard(): Record<string,Cell> {
  return Object.fromEntries(
    Array.from({length:9},(_,zone)=>[
      String(zone), {s:null,m:null,l:null}
    ])
  );
}
```

### State invariants

These must be asserted in development builds and covered by tests:

1. Every zone exists and has exactly `s`, `m`, and `l` slots.
2. Every occupied slot contains an active or historically valid color.
3. For each color and size, occupied count is `0..3`.
4. A physical piece and board slot represent the same committed move.
5. Only one turn owner exists while `phase === 'playing'`.
6. `locked === true` during move animation, server submission, bot thinking, win presentation, and reset.
7. A winner freezes turn advancement until the round transition completes.
8. Presentation cancellation must never partially mutate the board.
9. Scores survive round resets; board occupancy does not.
10. Rebuilding meshes from authoritative state must reproduce the same board exactly.

---

## 4. Spatial contract

Coordinate convention: `+Y` is up; board center is `(0,0,0)`. Uniform world scaling is allowed. Non-uniform scaling that changes relative spacing is not allowed.

```ts
const GRID_STEP = 48;
const BASE_RADIUS = 135;
const PIECE_FINAL_Y = 2;
const PIECE_DRAG_Y = 14;
const BOARD_Y = 6;
const HOME_STACK_LIFT_STEP = 19;
const DEFAULT_DROP_RADIUS = 31;
const CONFIGURABLE_DROP_RADIUS = 42; // current production calibration
```

### 4.1 Zone IDs

Zone IDs are row-major in X/Z space:

```ts
const ZONES = [
  [-1,-1],[0,-1],[1,-1],
  [-1, 0],[0, 0],[1, 0],
  [-1, 1],[0, 1],[1, 1]
].map(([gx,gz],id)=>({
  id,
  x:gx*GRID_STEP,
  y:PIECE_FINAL_Y,
  z:gz*GRID_STEP
}));
```

All size slots use offset `(0,0)` and therefore remain concentric:

```ts
const SLOT_OFFSETS = {
  s:{x:0,z:0}, m:{x:0,z:0}, l:{x:0,z:0}
};
```

### 4.2 Board and player bases

| Object | Position `(x,y,z)` | Rotation degrees `(x,y,z)` |
|---|---:|---:|
| board `9` | `(0,6,0)` | `(-90,0,0)` |
| right base | `(135,6,0)` | `(-90,0,0)` |
| left base | `(-135,6,0)` | `(-90,0,180)` |
| front base | `(0,6,135)` | `(-90,0,90)` |
| back base | `(0,6,-135)` | `(-90,0,-90)` |

### 4.3 Piece home positions

Each player base has three stack centers spaced by 48. Each stack contains one nested `l+m+s` set.

- `right`: `(135,2,-48)`, `(135,2,0)`, `(135,2,48)`
- `left`: `(-135,2,-48)`, `(-135,2,0)`, `(-135,2,48)`
- `front`: `(-48,2,135)`, `(0,2,135)`, `(48,2,135)`
- `back`: `(-48,2,-135)`, `(0,2,-135)`, `(48,2,-135)`
- Piece rotation: `(-90,0,0)`.

```ts
home = {
  x: base.x + cos(baseAngle) * 48 * side,
  y: 2,
  z: base.z + sin(baseAngle) * 48 * side
}; // side=-1,0,1; front/back angle=0°; right/left angle=90°
```

### 4.4 Score markers

Score markers persist visually between rounds.

```ts
const SCORE_RADIUS = 85;
const SCORE_GAP = 11;
const SCORE_SIDES = [0,-1,1,-2,2,-3,3];
```

Rows:

- front: center `(0,7,85)`, spread on X
- back: center `(0,7,-85)`, spread on X
- right: center `(85,7,0)`, spread on Z
- left: center `(-85,7,0)`, spread on Z

For scores beyond 7, continue the same alternating sequence algorithmically; never overlap an existing marker.

### 4.5 Room and table reference

Current room bounds:

```ts
const ROOM = {
  floorY:-650,
  topY:1250,
  halfWidth:2400,
  backZ:-2400,
  frontZ:2400
};
const TABLE_TOP_Y = -16;
```

Align the complete game group so its lowest visible geometry contacts the detected table top plus a small epsilon (`0.8` in the current source). Do not hard-code a visual gap under the board.

---

## 5. Setup, players, and turn order

### Entry routes

- `online`: create or join a private room.
- `computer`: local human versus 1–3 bots.
- `learn`: explain all three win types, then enter the normal local setup/game flow.

### Local game

1. Choose one color.
2. Choose total players: 2, 3, or 4.
3. Remaining seats become bots.
4. Build the player sequence by rotating `TURN_RING` from the selected color.

```ts
players = rotate(TURN_RING, selectedColor).slice(0, playerCount);
```

### Online game

- Room code: exactly 6 characters matching `[A-HJ-NP-Z2-9]`; omit ambiguous characters.
- Creator chooses color and target player count `2..4`.
- Joiners choose only unoccupied colors.
- Start automatically only when `players.length === targetPlayers` and the server confirms the room state.
- Persist the room identity token in session storage so a refresh may rejoin the same seat.

### Turn timing

- Default normal turn: 18 seconds.
- Minimum configurable timer: 6 seconds.
- The first guided human turn may have `turnDeadline = 0` and display `تعلم` instead of a countdown.
- Timer expiry commits no move and advances to the next playable player.
- The timer must stop while the tab is applying an authoritative remote update or while input is locked.

### Playable-turn advancement

Do not simply increment once. Skip any player with no legal moves.

```ts
function nextPlayableTurn(players,currentIndex,board) {
  for (let offset=1; offset<=players.length; offset++) {
    const index=(currentIndex+offset)%players.length;
    if (hasLegalMove(board,players[index].color)) return index;
  }
  return null;
}
```

If no player has a legal move, the round is a draw. This rule resolves an edge case that older production wrappers did not handle consistently.

---

## 6. Move legality and resolution

```ts
function isLegalMove(state:GameState,move:Move):boolean {
  const current=state.players[state.turnIndex]?.color;
  return state.phase==='playing'
    && !state.locked
    && current===move.color
    && move.zone>=0 && move.zone<9
    && SIZES.includes(move.size)
    && state.board[String(move.zone)][move.size]===null
    && piecesUsed(state.board,move.color,move.size)<3;
}
```

### Commit sequence

A legal move follows one transaction:

1. Revalidate against the latest authoritative revision.
2. Reserve one unused physical piece of the chosen color and size.
3. Write `board[zone][size] = color`.
4. Increment `moveNumber` and `revision`.
5. Record `lastMoves[color]`.
6. Detect a win for the moving color.
7. If no win, find the next playable turn.
8. If no playable turn exists, mark draw.
9. Emit one immutable result event for presentation and networking.

```ts
type MoveResult = {
  accepted:boolean;
  reason?:
    | 'invalid_turn'|'occupied_slot'|'no_piece_remaining'
    | 'version_conflict'|'room_cancelled';
  board:Record<string,Cell>;
  winner:Win|null;
  draw:boolean;
  turnIndex:number;
  lastMove:LastMove|null;
  revision:number;
};
```

### Important separation

- The board commit is authoritative.
- Piece travel, glow, sound, particles, and camera movement are observers.
- If a presentation animation is skipped or interrupted, snap visuals to the committed result.
- In online play, the server decides acceptance. The client does not optimistically invent a permanent board state.

---

## 7. Victory and round lifecycle

The first completed pattern after a legal move wins.

### A. Same-size line

The same color owns one size in all three zones of a winning line.

### B. Graded line

Across any winning line, the same color owns either:

- `s → m → l`, or
- `l → m → s`.

### C. Complete cell

The same color owns `s + m + l` inside one zone.

```ts
function detectWin(board:Record<string,Cell>,color:Color):Win|null {
  for (const line of WIN_LINES) {
    for (const size of SIZES) {
      if (line.every(zone=>board[String(zone)][size]===color))
        return {color,type:'same-size',cells:line.map(zone=>({zone,size}))};
    }
    for (const sequence of [['s','m','l'],['l','m','s']] as Size[][]) {
      if (sequence.every((size,i)=>board[String(line[i])][size]===color))
        return {color,type:'graded',cells:line.map((zone,i)=>({zone,size:sequence[i]}))};
    }
  }
  for (let zone=0; zone<9; zone++) {
    if (SIZES.every(size=>board[String(zone)][size]===color))
      return {color,type:'cell',cells:SIZES.map(size=>({zone,size}))};
  }
  return null;
}
```

### Win lifecycle

1. Set `phase='winning'`, `winner`, and `locked=true`.
2. Stop the turn timer.
3. Preserve all non-winning piece colors.
4. Blink only the winning pieces 5 cycles over 3000 ms.
5. Optional approved presets may add a light halo, but never hide or desaturate the other pieces.
6. Increment winner score exactly once after the highlight finishes.
7. Create one score marker.
8. Show the awarded-point state for 900 ms.
9. Increment round and run animated round reset.
10. Start next round at `turnIndex=0`.

### Draw lifecycle

1. Set `phase='draw'`, `locked=true`.
2. Stop timer and close any open tray.
3. Announce draw.
4. Wait 1200 ms.
5. Increment round and run animated round reset.
6. Scores remain unchanged.

There is currently no fixed match-ending score. A host application may add one only as a separately configured mode; it must not silently alter the base game.

---

## 8. Complete scene and state graph

The following graph is the minimum complete flow. A new engine may split scenes differently internally, but every named visible condition must remain representable and testable.

```text
BOOT
 ├─ LOAD_PROGRESS ──> LOAD_ERROR / retry
 └─ LOADER_WALL_HANDOFF
      └─ ROOM_REVEAL
          └─ BRAND_OR_MENU_WALL
              ├─ ROUTE_ONLINE
              │   ├─ ONLINE_HOME
              │   ├─ ONLINE_CODE_ENTRY
              │   ├─ ONLINE_REQUEST_PENDING
              │   ├─ ONLINE_ERROR
              │   ├─ ONLINE_LOBBY
              │   └─ ONLINE_PLAYING
              ├─ ROUTE_COMPUTER ──> SETUP_COLOR
              └─ ROUTE_LEARN ──> HOW_TO ──> SETUP_COLOR

SETUP_COLOR ──> SETUP_EXIT ──> SETUP_PLAYER_COUNT
SETUP_PLAYER_COUNT ──> SETUP_EXIT ──> UNBOXING_INTRO
UNBOXING_INTRO ──> TUTORIAL_DEMOS / TUTORIAL_SKIP
TUTORIAL_DEMOS ──> GUIDED_FIRST_TURN ──> ROUND_READY

ROUND_READY ──> TURN_START
TURN_START
 ├─ HUMAN_SELECTION ──> TRAY_OPEN ──> SIZE_SELECTED
 │    ├─ TAP_LEGAL_ZONE
 │    └─ DRAGGING ──> VALID_DROP / INVALID_DROP
 ├─ BOT_THINKING ──> BOT_MOVE
 ├─ TURN_TIMEOUT
 └─ NO_LEGAL_MOVE_SKIP

MOVE_COMMIT ──> MOVE_TRAVEL ──> LAST_MOVE_MARKER
 ├─ TURN_HANDOFF ──> TURN_START
 ├─ WIN_PRESENTATION ──> SCORE_AWARD ──> ROUND_RESET
 └─ DRAW_PRESENTATION ──> ROUND_RESET

ONLINE_PLAYING may enter:
 NETWORK_PENDING / VERSION_CONFLICT / RECONNECTING / CANCELLED
ONLINE_FINISHED ──> REMATCH_WAIT ──> ROUND_RESET or EXIT
```

### 8.1 Exhaustive scene catalog

| ID | Visible purpose | Entry condition | Input policy | Exit |
|---|---|---|---|---|
| `boot` | Initialize renderer, assets, rules, storage | App launch | None | Loader ready/error |
| `load-progress` | Loading star or progress status | Assets pending | None except debug retry | Handoff/error |
| `load-error` | Explain failed initialization | Fatal boot error | Retry/home only | Reload |
| `loader-wall-handoff` | Preserve loader position while room becomes visible | First render ready | None | Room camera starts |
| `room-reveal` | Reveal approved room and table | Loader released | None | Wall/menu focus |
| `brand-wall` | Official Yakolak and MTKYF marks | Entry journey variant | None or continue | Menu wall |
| `main-menu-wall` | Online/computer/learn choices | Entry complete | Hover/tap choices | Route transition |
| `route-transition` | Selection feedback and camera travel | Choice accepted | Locked | Destination scene |
| `online-home` | Create or join | Online route | Buttons/code field | Setup/code/request |
| `online-code-entry` | Six-character room code | Join selected | Keyboard/touch keys | Request/error/back |
| `online-request-pending` | Creating, joining, moving, rematching | Network request active | Locked; cancel only where safe | Server response |
| `online-error` | Validation/network/server problem | Request failure | Retry/back | Previous scene |
| `online-lobby` | Room code, roster, empty seats | Joined waiting room | Copy invite/leave | Playing/cancelled |
| `online-playing` | Synchronized remote game | Room status playing | Current seat only | Finished/cancelled |
| `online-finished` | Winner/draw and rematch action | Room finished | Rematch/leave | Rematch wait/exit |
| `rematch-wait` | Show who is ready | Rematch requested | Leave only | New round |
| `online-cancelled` | Another player left or host cancelled | Room cancelled | Exit | Main menu |
| `how-to` | Explain three win types | Learn selected | Start/continue | Setup color |
| `setup-color` | Four physical color sets on table | Local/online setup begins | Color sets only | Setup exit |
| `setup-player-count` | 2/3/4-player rows | Local create after color | Count rows only | Setup exit |
| `setup-exit` | Remove current setup choices | Setup choice accepted | Locked | Next setup/game stage |
| `unboxing-intro` | Lid, bases, and pieces assemble | Local configuration complete | Locked; optional skip only if explicit | Tutorial/round |
| `tutorial-demo-same-size` | Scripted first win type | Tutorial enabled | Confirm/repeat after demo | Next demo |
| `tutorial-demo-graded` | Scripted second win type | Previous confirmed | Confirm/repeat after demo | Next demo |
| `tutorial-demo-cell` | Scripted third win type | Previous confirmed | Confirm/repeat after demo | Guided turn |
| `guided-first-turn` | Teach actual selection and placement | Tutorials completed | Human move only; timer paused | First accepted move |
| `round-ready` | Board reset, active bases visible | Round begins | Locked until reset ends | Turn start |
| `turn-start` | Current player, timer, active glow | Playable turn selected | Depends on player kind | Selection/bot/timeout |
| `human-selection` | Human may open a home stack | Human turn | Human unplaced pieces/base | Tray open |
| `tray-open` | Remaining sizes rise apart | Stack selected | Size pieces, legal zone taps | Size selected/close |
| `size-selected` | One size active, legal zones visible | Size chosen | Legal zone or drag | Commit/close |
| `dragging` | Piece follows pointer at raised Y | Drag threshold passed | Pointer move/release only | Valid/invalid drop |
| `invalid-drop` | Red/invalid feedback and return motion | Illegal or missed drop | Locked until return begins | Size selected/tray |
| `move-commit` | Validate and commit once | Legal target chosen | Locked | Travel/server response |
| `move-travel` | Piece arcs to final slot | Commit accepted | Locked | Last-move/win |
| `last-move-marker` | Show each player's latest move | Travel complete/state sync | None | Remains until replaced/reset |
| `bot-thinking` | Show bot is choosing | Bot turn | Locked | Bot move/skip |
| `turn-timeout` | Announce expired time | Deadline reached | Locked | Turn handoff |
| `no-legal-move-skip` | Skip blocked player | No legal moves | Locked | Next playable/draw |
| `turn-handoff` | Close tray, update current player/timer | Move/skip complete | Locked for one state tick | Turn start |
| `network-conflict` | Remote revision won race | Server `version_conflict` | Locked | Authoritative resync |
| `reconnecting` | Poll/request failures with retained room identity | Connection degraded | No gameplay input | Synced/cancelled |
| `win-presentation` | Winning cells blink/glow | Win detected | Locked | Score award |
| `score-award` | Persistent point appears | Highlight complete | Locked | Round reset |
| `draw-presentation` | No legal move remains | Draw detected | Locked | Round reset |
| `round-reset` | All pieces return home | Win/draw/rematch | Locked | Round ready |
| `resize-refit` | Recompute responsive camera | Viewport/orientation change | Preserve current interaction when safe | Same scene |
| `page-resume-sync` | Restore from hidden/suspended tab | Visibility resumes | Locked until state checked | Previous/remote sync |

The developer screen must expose these as either scenes or explicit variants; broad cards such as “اللعب” are not sufficient by themselves.

---

## 9. Motion system contract

### 9.1 General rules

- Use unscaled monotonic time for transitions.
- Default easing for object and camera interpolation:

```ts
function cubicEaseInOut(t:number) {
  t=Math.max(0,Math.min(1,t));
  return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
}
```

- The clean `v126` entry path uses smootherstep:

```ts
smootherstep(t)=t*t*t*(t*(t*6-15)+10)
```

- Camera rotation must use quaternion slerp; never Euler-lerp a long camera turn.
- At motion completion, snap position, rotation, scale, FOV, and opacity to exact target values.
- One state owns each animated object. Starting a new owner cancels the previous animation and snaps or restores safely.
- Gameplay input remains disabled for the whole authoritative commit/travel window.
- Resizing during a route motion should finish the motion, then apply the correct responsive terminal pose; do not jump between unrelated cameras mid-flight.

### 9.2 Motion registry

| Motion ID | Duration | Arc/transform | Required behavior |
|---|---:|---|---|
| `setup-choice-spin` | continuous | Y rotation `+0.003..0.0038 rad/frame` in full mode | Static small offsets in performance mode |
| `setup-exit` | 520 | alternating X drift `±7`, `+18Y`, `-14Z`, scale to 18%, `+0.62 rad Y` | Clear setup group only after completion |
| `tabletop-panel-in` | 460 | opacity `0→1` | Lock disc may rotate while active |
| `tabletop-panel-out` | 420 | opacity `1→0` | Hide after zero |
| `tray-open` | 360 | pieces to lifted stack, arc 6 | Sort `l,m,s`; select largest first |
| `tray-close` | 360 | return home, arc 10 | Do not return the committed piece |
| `tray-invalid-return` | 300 | return to lifted tray target, arc 8 | Preserve selection |
| `piece-place` | 520 | vertical arc 18 | End exactly at slot center, Y=2 |
| `tutorial-piece-place` | 460 | vertical arc 18 | 110 pause between scripted moves |
| `tutorial-reset-piece` | implementation uses grouped reset | return to home | Must finish before next demo |
| `round-reset-pieces` | 620 | grouped arc 16 | All active pieces move together |
| `inactive-player-fade` | 620 | opacity `1→0`, scale `1→0.92` | Hide unused bases/pieces after tutorial |
| `tutorial-camera` | 520 | play overview | Quaternion/target interpolation |
| `bot-think` | 420–740 | no board mutation | Show thinking caption; input locked |
| `winner-blink` | 3000 | 5 sine cycles, small scale/emissive pulse | Winning pieces only |
| `win-score-hold` | 900 | static score confirmation | Then reset |
| `draw-hold` | 1200 | static draw message | Then reset |
| `wall-menu-select-v125` | 140 | selected state hold | Production reference |
| `wall-menu-route-wait-v125` | 160 | destination begins preparing | Production reference |
| `wall-menu-fade-v125` | 520 | opacity `1→0` | Production reference |
| `wall-menu-arrival-v122` | 900 + 1450 + 620 | wait, camera move, fade in | Historical room sequence |
| `wall-menu-exit-v122` | 210 + 1250 + 650 + 820 | selection, camera, route wait, fade | Historical room sequence |
| `clean-entry-v126` | 2650 | cubic Bezier camera path + quaternion slerp | Loader anchor follows wall point |
| `clean-entry-v126-reduced` | 1150 | same terminal poses | Reduced-motion reference |
| `room-reveal-v130` | 280 + 2200 | pre-roll then camera to table overview | Approved reference |
| `second-wall-v130` | 620 + 2050 | hold then camera turn | Hide star after it leaves view |
| `room-reveal-v130-reduced` | 120 + 700 | reduced transition | Preserve continuity |
| `second-wall-v130-reduced` | 180 + 850 | reduced transition | Preserve continuity |

### 9.3 Drag behavior

- Pointer down on an unplaced human piece opens/selects the stack; a second interaction may begin dragging the selected piece.
- While dragging:
  - disable orbit controls;
  - move the piece on the board-parallel plane at `Y=14`;
  - compute nearest zone;
  - show only the nearest candidate marker;
  - legal marker uses configured legal color;
  - occupied same-size marker uses red;
  - do not mutate board state.
- On release:
  - if within drop radius and legal, call the same commit function used by tapping;
  - if illegal/missed, return to tray/home;
  - restore camera controls;
  - hide transient zone markers.
- A tap is rejected as a drag when pointer travel exceeds 9 px or hold time exceeds 650 ms in the online interaction path.

### 9.4 Last-move presentation

- Maintain one last-move marker per player/color.
- A newer move by that color replaces the older marker.
- Production local reference uses a colored point light near the slot.
- Online reference uses a ring around the zone.
- A port may standardize on one style, but it must remain distinguishable from legal-target markers.
- Clear all last-move markers on round reset.

---

## 10. Canonical unboxing intro

The unboxing intro is a deterministic assembly sequence. It is independent from turn order.

```ts
const INTRO_ORDER = ['right','left','front','back'];
const INTRO = {
  lidShake:420,
  lidLift:900,
  lidHeight:740,
  wallDelay:360,
  wallLift:260,
  wallMove:620,
  wallDrop:280,
  pieceLead:360,
  pieceMove:850,
  pieceArc:30,
  pieceStagger:42,
  scatterSeed:4128
};
```

### Initial transforms

```ts
lid = {pos:[0,62.5,0],rot:[-90,180,0]};
wallStart = {
  right:{pos:[ 81,35,  0],rot:[ -90,-90,  0]},
  left: {pos:[-81,35,  0],rot:[ -90, 90,180]},
  front:{pos:[  0,35, 81],rot:[-180,  0, 90]},
  back: {pos:[  0,35,-81],rot:[-180,180,-90]}
};
```

### Timeline

1. `0–420`: lid shakes with decaying X/Z rotational amplitude.
2. `420–1320`: lid rises 740 units using cubic easing.
3. Hide lid exactly after lift completion.
4. Wall `i` begins at `420 + i×360`:
   - lift 20 units over 260;
   - travel to final base transform over 620;
   - drop 20 units over 280.
5. Piece start:

```ts
pieceStart = 420
  + colorIndex*360
  + 260 + 620
  - 360
  + (side+1)*42;
```

6. Each piece moves from deterministic scatter to its home transform over 850 with:

```ts
y += sin(progress*PI)*30;
```

7. Scatter generator seed is `4128`; radius `<78`, start Y `10..28`, and deterministic randomized rotations.
8. The sequence total resolves at 4010; snap all transforms exactly and hide the lid.
9. Skipping the intro must call the same final snap function; it may not leave hidden bases or scattered pieces.

---

## 11. Loading star and entry journeys

### 11.1 Approved loading-star motion (`v129` / integrated in `v130`)

- Canvas box: `96 × 132`.
- Star: `88 × 88`.
- Normal cycle: 820.
- Reduced-motion cycle: 1100–1200.
- Star fill: `#3f3f3f` on a white/light wall.

Keyframes:

| Progress | Y | Scale X/Y | Rotation |
|---:|---:|---:|---:|
| 0% | 0 | `1,1` | 0° |
| 43% | 33 | `1.01,.99` | 10° |
| 50% impact | 36 | `1.17,.72` | 12° |
| 58% rebound | 30 | `.94,1.09` | 14° |
| 78% | 5 | `1.01,.99` | 20° |
| 100% | 0 | `1,1` | 24° |

Shadow keyframes:

| Progress | X scale | Opacity |
|---:|---:|---:|
| 0/100% | `.66` | `.055` |
| 43% | `1.02` | `.105` |
| 50% | `1.28` | `.14` |
| 58% | `1.04` | `.105` |
| 78% | `.72` | `.065` |

The loader must not disappear into a blank cut. Either preserve its projected screen position during the camera handoff or reveal an equivalent star already attached to the room wall.

### 11.2 Production `v125` white-wall menu

Camera poses:

| View | Position | Target | FOV |
|---|---|---|---:|
| Desktop | `(0,250,-820)` | `(0,250,-2386)` | 42 |
| Compact landscape | `(0,245,-560)` | `(0,245,-2386)` | 46 |
| Portrait | `(0,250,-260)` | `(0,250,-2386)` | 48 |

Menu route motion:

- selected hold 140;
- destination preparation 160;
- menu fade 520;
- disable pointer input at first accepted selection;
- keep the selected row visible until the fade begins;
- one choice may route only once.

### 11.3 Clean wall-to-wall journey (`v126` reference)

Start camera:

| View | Position | Target | FOV |
|---|---|---|---:|
| Desktop | `(0,250,-1120)` | `(0,250,-2385)` | 42 |
| Compact | `(0,250,-930)` | `(0,250,-2385)` | 46 |
| Portrait | `(0,250,-720)` | `(0,250,-2385)` | 49 |

End camera at the side logo wall:

| View | Position | Target | FOV |
|---|---|---|---:|
| Desktop | `(1120,260,0)` | `(2380,260,0)` | 42 |
| Compact | `(1240,260,0)` | `(2380,260,0)` | 46 |
| Portrait | `(1320,265,0)` | `(2380,265,0)` | 49 |

Path:

- Cubic Bezier camera position.
- Desktop controls: `(0,280,-760)` and `(760,280,-560)`.
- Portrait controls: `(0,285,-500)` and `(900,285,-420)`.
- Quaternion slerp from start look to end look.
- Duration 2650; reduced 1150.
- Official `YAKOLAK.svg` and `MTKYF.svg` must exist before motion starts.
- Game board group remains hidden for this logo-wall-only variant.

### 11.4 Approved room continuity (`v130` reference)

Wall star position: group `(0,250,-2354)`.

Camera poses:

| Pose | Desktop | Compact | Portrait | Target |
|---|---|---|---|---|
| star | `(0,250,-1534)` | same position, FOV 46 | same position, FOV 48 | `(0,250,-2354)` |
| reveal | `(520,430,520)` FOV43 | `(245,325,285)` FOV45 | `(330,560,455)` FOV46 | board center / portrait Y18 |
| second wall | `(1050,275,0)` FOV42 | `(820,285,0)` FOV46 | `(650,350,0)` FOV48 | approximately `(2354,260,0)` |

Sequence:

1. Render wall star and first valid room frame.
2. Remove DOM loader without opacity flash.
3. Hold 280 (120 reduced).
4. Move to room/table reveal over 2200 (700 reduced).
5. Hold 620 (180 reduced).
6. Turn to second wall over 2050 (850 reduced).
7. Hide star only after it has left the camera view.
8. The second-wall content must already exist before the turn, avoiding a late pop-in.

A rebuilt game should choose one approved entry route rather than chaining `v121`, `v122`, `v125`, `v126`, and `v130` wrappers together.

---

## 12. Setup presentation

### Color selection

- Hide board, lid, normal player bases, and gameplay pieces.
- Show one nested `l+m+s` set for each available color on the tabletop.
- Full-quality mode rotates sets slowly; performance mode uses fixed rotation offsets.
- Online join mode hides/reserves unavailable colors.
- Selecting a color runs `setup-exit`, then advances to player count or directly joins an online room.

### Player-count selection

- Three rows: 2, 3, and 4 total players.
- Each row displays the corresponding colors based on the rotated turn ring.
- Selecting a row runs `setup-exit`, then starts local configuration or creates the online room.

### Tabletop lock panel (`v123` reference)

- Instruction panel fade in: 460.
- Fade out: 420.
- Lock disc may rotate `0.0028 rad` per update while setup is active.
- Panel is presentation only; setup remains locked by authoritative state.
- No duplicate DOM setup page should remain visible over the diegetic tabletop version.

---

## 13. Tutorial contract

The tutorial is short, repeatable, and action-led.

1. Move camera to play overview over 520.
2. Demonstrate same-size line using scripted legal-looking placements.
3. Blink the winning pieces.
4. Ask `فهمت` or `إعادة`; repeat only that demonstration when requested.
5. Repeat for graded line.
6. Repeat for complete cell.
7. Reset all tutorial pieces.
8. Explain: open a stack, choose size, choose a legal zone.
9. Begin the first real human turn with timer paused.
10. Resume normal timer after the first accepted human move.

Scripted tutorial placement:

- piece travel 460, arc 18;
- gap between placements 110;
- lead caption hold 260;
- win highlight uses the same production win presenter;
- post-highlight hold 450.

Tutorial state must never increment real scores, rounds, move numbers, or online revisions.

---

## 14. Human interaction

### Stack and size selection

1. Select an unplaced home stack belonging to the current human.
2. Gather all unplaced pieces with the same color and stack side.
3. Sort `l`, `m`, `s`.
4. Raise each piece by `index × 19` above its home Y.
5. Select the largest available size by default.
6. Allow tapping another visible size.
7. Highlight only zones where that size slot is empty.
8. Tapping the player base or same stack again closes the tray.

### Zone markers

- Legal target ring is fully visible and colored for the selected player.
- Occupancy is size-specific; another size in the zone does not make the zone illegal.
- Do not display all generic markers during normal play when no size is selected.
- Legal, last-move, tutorial, and error markers must use distinct shapes or animation.

### Invalid actions

Required feedback cases:

| Case | Result |
|---|---|
| No size selected | Prompt to choose a piece first |
| Same-size slot occupied | State that this size already exists in the zone |
| Inventory exhausted | Prompt to choose another size |
| Wrong turn | Ignore placement and refresh current-turn indication |
| Drop outside radius | Return piece to tray/home |
| Server revision conflict | Discard local pending presentation and resync |
| Room cancelled | Exit gameplay input and show cancelled state |

No invalid action may consume inventory, advance the turn, or leave a piece detached from its home/slot.

---

## 15. Bot contract

Evaluate every legal move:

```ts
score = 0;
if (moveWinsNow) score += 10000;
if (moveBlocksOpponentImmediateWinAtSameSlot) score += 5200;
score += ownSameSizeLineProgress * 18;
if (zone === 4) score += 18;
score += size === 'l' ? 8 : size === 'm' ? 5 : 3;
score += random(0,8);
```

Round skill cycle:

```ts
[0.94,0.56,0.86,0.68,0.78]
```

Color multipliers:

- white/right: `0.74`
- blue/back: `0.88`
- gold/left: `0.66`
- green/front: `0.80`

Clamp effective skill to `0.35..0.97`.

- Choose best move with probability `skill`.
- Otherwise choose randomly among the top 5 legal moves.
- Thinking delay: `420 + random(0,320)`.
- If no legal move, skip immediately to the next playable player.
- Bot RNG may remain nondeterministic locally, but tests must support a seeded RNG.

---

## 16. Online state, synchronization, and recovery

### Network timing

- Base poll delay: 900.
- Backoff maximum: 8000.
- Request timeout: 6500.
- Reset backoff to base after a successful room update.

### Client request flow

1. Select piece size locally; this is non-authoritative.
2. Select a legal-looking zone.
3. Enter `online-request-pending`; clear transient legal markers and lock input.
4. Submit `{zone,size,color,revision}`.
5. Server revalidates turn, slot, inventory, room status, and revision.
6. On success, server returns full authoritative room snapshot.
7. Rebuild board and pieces from that snapshot.
8. On failure, show mapped error and restore selection only when still legal.

### Required server errors

- `invalid_player_count`
- `room_cancelled`
- `not_your_turn`
- `occupied_slot`
- `no_piece_remaining`
- `version_conflict`
- `online_unavailable`
- `online_server_error`
- `request_timeout`

### Reconnect and refresh

- Store `{code,token,seat}` per room in session storage.
- On refresh or visibility resume, fetch room before enabling input.
- If seat is still valid, restore color and player identity.
- Rebuild every piece from board state; never trust stale transforms.
- Restore turn index, round, winner, draw, last move, and room status.
- If room is waiting, return to lobby.
- If room is finished, return to finished/rematch state.
- If room is cancelled or identity rejected, clear local identity and exit.

### Online room lifecycle

```text
creating/joining -> waiting -> playing -> finished -> rematch-wait -> playing
                              \-> cancelled
```

Leaving an already started match cancels that round for all players in the current behavior. This consequence must be stated before the player confirms leaving.

---

## 17. Camera and responsive framing

### Play overview

| View | Position | Target | FOV |
|---|---|---|---:|
| Desktop | `(520,430,520)` | `(0,0,0)` | 43 |
| Compact landscape | `(245,325,285)` | `(0,0,0)` | 45 |
| Portrait, 2 players | `(330,560,455)` | `(0,18,0)` | 46 |
| Portrait, 3–4 players | `(380,620,510)` | `(0,18,0)` | 48 |

### Camera policy

- Setup framing remains active until configuration is accepted.
- Switch to play overview only after setup completion.
- Orbit may be enabled in play, but pan remains disabled.
- Keep the camera and target inside room bounds.
- During menu, service-wall, setup-transition, win, and entry motions, camera control is disabled.
- On resize/orientation change:
  - update aspect and render resolution;
  - choose pose from current scene, not globally;
  - preserve selected piece/tray state;
  - recompute pointer ray bounds;
  - do not restart intro or route transitions.

### Side service wall (`v124` reference)

| View | Position | Target | FOV |
|---|---|---|---:|
| Desktop | `(1080,260,0)` | `(2386,260,0)` | 43 |
| Compact | `(980,250,0)` | `(2386,250,0)` | 47 |
| Portrait | `(820,280,0)` | `(2386,280,0)` | 49 |

Use cubic position/FOV interpolation plus quaternion slerp.

---

## 18. Visual hierarchy and assets

### Required model roles

| Role | Current asset |
|---|---|
| board and lid | `9.stl` |
| player base | `3.stl` |
| small piece | `s.stl` |
| medium piece | `m.stl` |
| large piece | `l.stl` |
| score point | `p.stl` |
| table footprint | `table.svg` |
| Yakolak logo | `YAKOLAK.svg` |
| MTKYF logo | `MTKYF.svg` |

Meshes may be replaced only when their nesting, footprint, centers, and gameplay readability remain equivalent.

### Reference palette

These are presentation references, not rule constants:

- wall: `#f7f7f4`
- floor: `#deddd7`
- neutral table: `#aeb2b6`
- production board reference: `#4a5562`
- white: approximately `#f1eee6` / `#f4f4f0`
- blue: `#3769a5` UI reference; deep model blue may be `#001f8f`
- gold: `#b78a44` UI reference; model gold may be `#b37a18`
- green: `#2f856a` UI reference; model green may be `#006144`
- loading/ink: `#3f3f3f` or `#242421`

A port must preserve strong color distinction under ordinary displays and should supplement color with position, labels, and turn markers.

### Rendering hierarchy

1. Room/table geometry.
2. Board and bases.
3. Pieces.
4. Legal and last-move markers.
5. Win glow and score markers.
6. Diegetic wall/table UI.
7. Emergency/error/accessibility overlays.

Do not disable depth testing globally for 3D game pieces. Diegetic UI may use controlled render order, but hit areas must match visible controls.

### Audio

No canonical audio sequence is established in the reviewed sources. A port may add audio, but gameplay correctness and motion timing must not depend on it. Reduced-motion or muted modes must still communicate every event visually and textually.

---

## 19. Input locks and cancellation

Use one lock owner, not many unrelated booleans.

```ts
type LockOwner =
  | null|'route'|'setup-transition'|'intro'|'tutorial-demo'
  | 'move'|'bot'|'network'|'win'|'round-reset'|'resync';
```

Rules:

- Only the current lock owner may release the lock.
- A newer authoritative resync may supersede `move` or `network` and snap visuals.
- Route changes cancel hover and clear pointer cursor.
- Closing a tray cancels its piece animations and snaps all uncommitted pieces home.
- Page hide may pause presentation but not alter deadlines stored by the server.
- On page resume, online state must resync before input returns.
- A skipped animation invokes its completion state exactly once.
- Never allow double-click, pointerdown + click, or tap + drag-end to submit the same move twice.

---

## 20. Reduced motion and accessibility

Reduced motion is not “turn animations off and flash between unrelated scenes.” It preserves ordering and meaning with shorter travel.

Required behavior:

- Entry/menu fades: about 10–20 where production uses longer decorative fades.
- Clean entry reference: 1150 instead of 2650.
- Room reveal: 700 instead of 2200.
- Second wall: 850 instead of 2050.
- Maintain selection confirmation, route locking, and final camera pose.
- Loading star may use a slower 1100–1200 cycle with reduced squash/rotation if desired.
- Win result must still identify exact winning pieces; a short opacity pulse or outline is acceptable.
- Setup and reset may snap after a minimal confirmation frame, but state order remains unchanged.
- All controls need semantic labels and keyboard/focus equivalents when rendered as DOM/UI widgets.
- Color names, turn owner, timer, network state, errors, winner, and draw must be available as text.
- Touch targets must remain usable on portrait mobile layouts.

---

## 21. Developer-screen completeness contract

The developer screen is a review tool, not the rules source. It must nevertheless expose enough granularity to inspect every important state.

### Required journeys

- Entry
- Main menu/routes
- Local setup
- Online setup/lobby
- Tutorial
- Normal gameplay
- Win/draw/reset
- Network degradation/recovery
- Components and responsive layouts

### Every scene card must provide

- stable `sceneId`;
- human Arabic name;
- exact entry state/trigger;
- visible objects and hidden objects;
- camera pose or camera motion ID;
- input policy and lock owner;
- duration/easing when animated;
- next valid scenes;
- current production preview;
- alternative reviewed versions;
- desktop, compact, and portrait preview where relevant;
- reduced-motion preview;
- source branch/commit;
- approval status: `production`, `approved-reference`, `experimental`, or `deprecated`.

### Missing cards that must be added to the developer inventory

At minimum:

- loader handoff
- room reveal
- menu route transition
- setup exit
- online loading/error
- lobby and rematch wait
- tutorial repeat prompt
- tray open/close
- selected size and legal targets
- drag in progress
- invalid drop
- move travel
- last move
- bot thinking
- timeout
- no-legal-move skip
- network pending
- version conflict/resync
- reconnecting
- score award
- draw reset
- round reset
- resize/refit
- reduced-motion variants

A static screenshot of the start or end of a transition is not sufficient; the preview must be able to replay the transition.

---

## 22. Version reconciliation

| Version | Keep | Do not copy blindly |
|---|---|---|
| `v121` | Route choices and overview target | DOM overlay dependency and duplicate setup UI |
| `v122` | Diegetic wall concept, camera interpolation, locks | Neon styling if rebuilding current white visual language |
| `v123` | Table-integrated setup and explicit lock | Polling presentation state instead of direct state events |
| `v124` | In-room service states and side-wall camera | Hidden legacy dialog as the real controller |
| `v125` | Current production white wall, menu timing, routing | Wrapper-on-wrapper architecture |
| `v126 rules` | Portable move/win/draw/skip logic | None; this is the preferred rules baseline |
| `v126 entry` | Smooth loader/logo wall handoff | Board hidden forever if the intended route is gameplay |
| `v128` | Correct star silhouette | Cruder 500 ms motion superseded by v129 |
| `v129` | Approved bounce/squash/shadow motion | Standalone blank-page implementation |
| `v130` | Integrated wall star and room-camera continuity | Sample text placeholder and experimental final destination |

The new engine should implement a clean state machine from this document, not reproduce the historical import/patch chain.

---

## 23. Acceptance tests

A rebuild is not equivalent until all tests below pass.

### Rules

1. Each color has 3 pieces of each size.
2. Placing `s` does not block `m` or `l` in the same zone.
3. Placing a second `s` in that zone is rejected.
4. A fourth piece of the same color/size is impossible.
5. All 8 lines detect same-size wins.
6. All 8 lines detect `s,m,l` and `l,m,s` wins.
7. Every zone detects complete-cell win.
8. A non-winning combination does not win.
9. A player with no legal moves is skipped.
10. No legal move for any player produces a draw.
11. Score increments exactly once per win.
12. Scores persist after reset.

### Spatial

13. Zone centers are exactly 48 apart.
14. Base centers are radius 135 from board center.
15. Every home stack returns to its exact transform after reset.
16. All sizes share one zone center and remain visually nested.
17. Score markers do not overlap for the supported visible score sequence.

### Interaction

18. Opening a stack reveals only remaining pieces.
19. Largest remaining size is selected first.
20. Legal markers depend on selected size.
21. Tap and drag call one validator.
22. Invalid drop changes no rule state.
23. Double input cannot create two moves.
24. Camera orbit is disabled while dragging.
25. Tray closes on turn handoff and reset.

### Motion

26. Intro is deterministic with seed 4128.
27. Intro ends with an exact snap at 4010.
28. Piece placement ends exactly at Y=2.
29. Round reset moves all active pieces home over the same transition.
30. Only winning pieces blink.
31. Reduced motion reaches the same terminal state.
32. Resizing does not restart or corrupt a transition.

### Online

33. Two clients cannot commit to the same revision/slot.
34. `version_conflict` causes full resync.
35. Refresh restores a valid seat and board.
36. Pending input remains locked until response or timeout.
37. Cancelled rooms cannot accept moves.
38. Rematch starts only under the room's readiness rule.
39. Rebuilt piece transforms exactly match server board state.

### Scene coverage

40. Every scene ID in section 8 can be entered through a test or preview fixture.
41. Every animated scene can replay from a clean initial state.
42. Developer previews identify production versus experimental sources.
43. Desktop, compact, portrait, and reduced-motion terminal poses are verified.

---

## 24. Replaceable versus fixed

### Fixed

- inventory;
- colors as player identities;
- player count range;
- turn ring;
- board/slot model;
- legality;
- win patterns;
- score persistence;
- skip/draw resolution;
- authoritative state separation;
- world ratios and anchors;
- deterministic unboxing contract;
- complete scene meanings and transition ordering.

### Replaceable

- engine and renderer;
- UI framework;
- backend framework and transport;
- polling versus WebSocket, provided semantics remain identical;
- model file formats;
- shaders and post-processing;
- exact non-semantic text styling;
- optional audio and particles;
- internal scene decomposition;
- how previews are rendered in the developer screen.

A port is successful when a player cannot distinguish its rules, board layout, turn behavior, critical motions, and complete journey from the approved Yakolak experience—even though the implementation is entirely new.