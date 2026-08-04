# YAKOLAK — Engine-Agnostic Core Specification

Canonical minimum contract for rebuilding the current game in Unity, Godot, Unreal, Babylon.js, another Three.js codebase, or any future engine.

**Production reference:** `v125-white-wall-continuity`, Git commit `3f3378c19401daaa528063ea2f2a28bbf25bcd26`.

## 1. Non-negotiable identity

- 3×3 board, 9 cells.
- 4 colors: `right` (white), `back` (blue), `left` (gold), `front` (green).
- 3 sizes: `s`, `m`, `l`.
- Each color owns 3 pieces of every size: 9 pieces/color, 36 total.
- A cell has three independent slots: one `s`, one `m`, one `l`.
- Different sizes may coexist/nest in the same cell, even when owned by different players.
- A move is illegal only when that cell's slot for the chosen size is already occupied.
- Placed pieces never move again during that round.

```ts
type Color = 'right' | 'back' | 'left' | 'front';
type Size = 's' | 'm' | 'l';
type Cell = { s: Color|null; m: Color|null; l: Color|null };
type Move = { color: Color; size: Size; zone: number };

const COLORS: Color[] = ['right','back','left','front']; // turn ring
const SIZES: Size[] = ['s','m','l'];
const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];
```

## 2. World coordinates and object anchors

Coordinate convention: `+Y` up, board center at `(0,0,0)`. Uniform scaling is allowed, but preserve all ratios.

```ts
const GRID_STEP = 48;
const BASE_RADIUS = 135;
const PIECE_Y = 2;
```

### Board cells

Zone IDs are row-major in X/Z space:

```ts
const ZONES = [
  [-1,-1],[0,-1],[1,-1],
  [-1, 0],[0, 0],[1, 0],
  [-1, 1],[0, 1],[1, 1]
].map(([gx,gz], id) => ({ id, x:gx*48, y:2, z:gz*48 }));
```

All three size slots share the same cell center; the meshes are concentric/nested.

### Board and four player bases

| Object | Position `(x,y,z)` | Rotation degrees `(x,y,z)` |
|---|---:|---:|
| board `9` | `(0,6,0)` | `(-90,0,0)` |
| right base | `(135,6,0)` | `(-90,0,0)` |
| left base | `(-135,6,0)` | `(-90,0,180)` |
| front base | `(0,6,135)` | `(-90,0,90)` |
| back base | `(0,6,-135)` | `(-90,0,-90)` |

### Piece home positions

Each base has three stack centers spaced by 48. Every stack initially contains nested `l+m+s`.

- `right`: `(135,2,-48)`, `(135,2,0)`, `(135,2,48)`
- `left`: `(-135,2,-48)`, `(-135,2,0)`, `(-135,2,48)`
- `front`: `(-48,2,135)`, `(0,2,135)`, `(48,2,135)`
- `back`: `(-48,2,-135)`, `(0,2,-135)`, `(48,2,-135)`
- Piece rotation: `(-90,0,0)`.

Equivalent formula:

```ts
home = {
  x: base.x + cos(baseAngle) * 48 * side,
  y: 2,
  z: base.z + sin(baseAngle) * 48 * side
}; // side = -1,0,1; front/back angle=0°, right/left angle=90°
```

## 3. Player setup and turn order

Entry choices:

1. Online
2. Computer
3. Learn

Computer game:

1. Choose one available color.
2. Choose total players: 2, 3, or 4.
3. The remaining seats are bots: 1, 2, or 3.

Online game:

- Create a room or join using a 6-character code.
- Creator chooses color and target player count: 2–4.
- Joiners choose from remaining colors.
- Start only with the configured player list synchronized.

Turn order rotates from the chosen starting color through:

```ts
const TURN_RING = ['right','back','left','front'];
players = rotate(TURN_RING, selectedColor).slice(0, playerCount);
```

A round starts with `turnIndex = 0`. Default turn time is 18 seconds; expiration skips the move and advances the turn. The optional first-move tutorial may pause the timer only for the first guided human turn.

## 4. Legal move and round state

```ts
interface GameState {
  players: Color[];
  turnIndex: number;
  board: Cell[];          // exactly 9
  scores: Record<Color,number>;
  round: number;
  winner: Color|null;
  locked: boolean;
}

function isLegal(state:GameState, move:Move):boolean {
  return !state.locked
    && state.players[state.turnIndex] === move.color
    && state.board[move.zone][move.size] === null
    && remainingInventory(move.color, move.size) > 0;
}
```

After a legal move:

1. Consume that physical piece.
2. Set `board[zone][size] = color`.
3. Detect victory for that color.
4. Otherwise advance `turnIndex = (turnIndex + 1) % players.length`.
5. If no player has any legal move, declare a draw and start a fresh round.

Scores persist between rounds. The current game has no fixed match-ending score; it continues round by round.

## 5. Victory detection

The first completed condition after a move wins.

### A. Same-size line

The same player owns `s`, `m`, or `l` in all three cells of any `WIN_LINES` line.

### B. Graded line

Across any `WIN_LINES` line, the player owns either:

- `s → m → l`, or
- `l → m → s`.

### C. Complete cell

The player owns `s + m + l` inside one cell.

```ts
function detectWin(board:Cell[], color:Color) {
  for (const line of WIN_LINES) {
    for (const size of SIZES)
      if (line.every(z => board[z][size] === color))
        return { type:'same-size', cells:line.map(zone=>({zone,size})) };

    for (const seq of [['s','m','l'],['l','m','s']] as Size[][])
      if (seq.every((size,i) => board[line[i]][size] === color))
        return { type:'graded', cells:line.map((zone,i)=>({zone,size:seq[i]})) };
  }

  for (let zone=0; zone<9; zone++)
    if (SIZES.every(size => board[zone][size] === color))
      return { type:'cell', cells:SIZES.map(size=>({zone,size})) };

  return null;
}
```

Win presentation: lock input, blink only the winning pieces 5 times over 3000 ms, add one score point, then begin the next round. Draw reset delay: 1200 ms. Win-to-next-round delay after scoring: 900 ms.

## 6. Current bot behavior

A bot evaluates every legal move:

```ts
score = 0;
if (moveWinsNow) score += 10000;
if (moveBlocksOpponentImmediateWinAtSameSlot) score += 5200;
score += ownSameSizeLineProgress * 18;
if (zone === 4) score += 18;
score += size === 'l' ? 8 : size === 'm' ? 5 : 3;
score += random(0,8);
```

Round skill cycle: `[0.94,0.56,0.86,0.68,0.78]`.
Color multipliers: white `0.74`, blue `0.88`, gold `0.66`, green `0.80`; clamp final skill to `0.35–0.97`.

Choose the best move with probability `skill`; otherwise choose randomly among the top five. Bot thinking delay: `420–740 ms`.

## 7. Interaction contract

- On the human turn, selecting a home stack opens its remaining sizes.
- Largest available size is selected first; the player may switch size.
- Highlight only cells whose same-size slot is empty.
- Tap/click a legal cell to place; drag-and-drop may be supported but must call the same move validator.
- Lock input during animations, network submission, bot turns, wins, and resets.
- Never let presentation code mutate board state directly.

## 8. Canonical unboxing intro

Intro animation order is **not** the turn order:

```ts
const INTRO_ORDER = ['right','left','front','back'];
const T = {
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
  pieceStagger:42
};
```

### Initial lid and wall transforms

```ts
lid = { pos:[0,62.5,0], rot:[-90,180,0] };
wallStart = {
  right:{pos:[ 81,35,  0],rot:[ -90,-90,  0]},
  left: {pos:[-81,35,  0],rot:[ -90, 90,180]},
  front:{pos:[  0,35, 81],rot:[-180,  0, 90]},
  back: {pos:[  0,35,-81],rot:[-180,180,-90]}
};
```

Use cubic ease-in-out for all interpolation.

1. `0–420 ms`: lid shakes with decaying amplitude.
2. After `420 ms`: lid rises `740` units over `900 ms`; hide it at `1320 ms`.
3. Wall `i` starts at `420 + i×360 ms`:
   - rise `20` units in `260 ms`;
   - move to its final player-base transform in `620 ms`;
   - drop to final Y in `280 ms`.
4. Piece start time:

```ts
pieceStart = 420 + colorIndex*360 + 260 + 620 - 360 + (side+1)*42;
```

5. Every piece travels from its deterministic scattered start to its home position over `850 ms`, with vertical arc `sin(progress×π)×30`.
6. Deterministic scatter seed: `4128`; radius `<78`, Y `10–28`, randomized rotations.
7. Snap every object to exact final transforms at `4010 ms`.

## 9. Current entry/menu framing

White-wall entry modes are shown before setup. Selection pauses `140 ms`, route preparation pauses `160 ms`, then the wall menu fades over `520 ms`.

Camera poses:

| View | Position | Target | FOV |
|---|---|---|---:|
| Desktop | `(0,250,-820)` | `(0,250,-2386)` | 42 |
| Compact landscape | `(0,245,-560)` | `(0,245,-2386)` | 46 |
| Portrait | `(0,250,-260)` | `(0,250,-2386)` | 48 |

Play overview:

| View | Position | Target | FOV |
|---|---|---|---:|
| Desktop | `(520,430,520)` | `(0,0,0)` | 43 |
| Compact landscape | `(245,325,285)` | `(0,0,0)` | 45 |
| Portrait, 2 players | `(330,560,455)` | `(0,18,0)` | 46 |
| Portrait, 3–4 players | `(380,620,510)` | `(0,18,0)` | 48 |

Setup choices exit over `520 ms`: slight sideways drift, `+18 Y`, `-14 Z`, scale to 18%, and rotate `+0.62 rad` around Y.

## 10. Visual reference, not game logic

- Room wall: `#f7f7f4`; floor: `#deddd7`.
- Board: `#4a5562`.
- White: `#f1eee6`; blue: `#3769a5`; gold: `#b78a44`; green: `#2f856a`.
- Table: `#aeb2b6`.
- Current assets: board/lid `9.stl`, player base `3.stl`, pieces `s.stl`, `m.stl`, `l.stl`, score marker `p.stl`, table footprint `table.svg`.

The engine, renderer, physics system, UI toolkit, networking library, and file formats are replaceable. The coordinates, inventory, move legality, player order, win detector, scoring continuity, and intro timeline above are the portable game contract.