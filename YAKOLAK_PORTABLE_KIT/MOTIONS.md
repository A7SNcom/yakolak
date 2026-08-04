# Motion Contract

## General

- Use monotonic time.
- Default interpolation: cubic ease-in-out.
- Camera rotations use shortest-path orientation interpolation; camera target and FOV move with the camera.
- State is committed before presentation begins, or by the authoritative server online.
- Input stays locked until the motion reaches or snaps to its exact end state.
- A cancelled or skipped motion applies its final transform once.

## Main movements

| Movement | Duration | Required result |
|---|---:|---|
| loading-star cycle | 820 | bounce, impact squash, rebound, 24° total turn |
| menu selected hold | 140 | one route may be selected once |
| menu route preparation | 160 | destination starts while menu remains stable |
| menu fade | 520 | wall menu disappears without a blank frame |
| setup-set spin | continuous | slow Y rotation; static offsets in low-performance mode |
| setup exit | 520 | ±7 X drift, +18 Y, -14 Z, scale to 18%, +0.62 rad Y |
| setup panel in/out | 460 / 420 | table instruction and lock appear/disappear |
| stack open | 360 | remaining large/medium/small separate by 19 Y |
| stack close | 360 | uncommitted pieces return home; arc 10 |
| invalid drop return | 300 | return to selected stack; arc 8 |
| normal piece placement | 520 | end at selected cell center; arc 18 |
| tutorial piece placement | 460 | arc 18; 110 pause between moves |
| bot thinking | 420–740 | no board mutation during thinking |
| inactive-player fade | 620 | opacity to zero and scale to 92% |
| round reset | 620 | all active pieces return home together; arc 16 |
| win blink | 3000 | 5 pulses on winning pieces only |
| score confirmation | 900 | new score point remains visible |
| draw confirmation | 1200 | no score point is added |
| tutorial/overview camera | 520 | exact play-overview pose |

## Loading star

| Progress | Y | Scale X,Y | Rotation | Shadow scale / opacity |
|---:|---:|---|---:|---|
| 0% | 0 | 1,1 | 0° | 0.66 / 0.055 |
| 43% | 33 | 1.01,0.99 | 10° | 1.02 / 0.105 |
| 50% | 36 | 1.17,0.72 | 12° | 1.28 / 0.14 |
| 58% | 30 | 0.94,1.09 | 14° | 1.04 / 0.105 |
| 78% | 5 | 1.01,0.99 | 20° | 0.72 / 0.065 |
| 100% | 0 | 1,1 | 24° | 0.66 / 0.055 |

The loader must hand off into the room without disappearing into a blank screen.

## Approved room entry

1. Render the star on the wall and one complete room frame.
2. Remove the loading overlay.
3. Hold 280.
4. Move from wall-star view to play overview over 2200.
5. Hold 620.
6. When a side-wall route is required, turn to it over 2050.
7. Side-wall content exists before the camera turns; hide the star only after it leaves view.

Reduced values: 120 hold, 700 room reveal, 180 hold, 850 side-wall turn.

## Unboxing intro

Intro order is **white/right → gold/left → green/front → blue/back**; this is not the turn ring.

| Parameter | Value |
|---|---:|
| lid shake | 420 |
| lid lift | 900 |
| lid lift height | 740 |
| delay between bases | 360 |
| base lift | 260 |
| base travel | 620 |
| base drop | 280 |
| piece lead | 360 |
| piece travel | 850 |
| piece arc | 30 |
| stack-side stagger | 42 |
| scatter seed | 4128 |
| final snap | 4010 |

Initial lid: position `0,62.5,0`, rotation `-90,180,0` degrees.

Initial base positions and rotations:

- white/right: `81,35,0`; `-90,-90,0`
- gold/left: `-81,35,0`; `-90,90,180`
- green/front: `0,35,81`; `-180,0,90`
- blue/back: `0,35,-81`; `-180,180,-90`

Sequence:

1. Shake lid with decaying rotation for 420.
2. Lift it 740 over 900; hide after lift.
3. Each base starts after `420 + color index × 360`: rise 20, travel to final base, drop 20.
4. Each piece begins before its base finishes, staggered by stack side.
5. Piece path is start-to-home plus a vertical sine arc of 30.
6. Scatter is deterministic: seed 4128, radius under 78, Y from 10 to 28, varied rotation.
7. At 4010 snap board, bases, pieces, and lid visibility exactly.

Skipping the intro calls the same final snap.

## Drag motion

- Disable camera control.
- Keep the piece at Y 14 over a plane parallel to the board.
- Show only the nearest candidate cell.
- Legal target uses the player's marker color; occupied same-size target is red.
- On release, commit only inside drop radius and only through the shared validator.
- Otherwise return the piece; never change board state.

## Reduced motion

Keep the same state order, locks, messages, and exact final values. Shorten decorative travel; do not replace continuity with unrelated cuts. Win identification, invalid feedback, and route confirmation must remain visible.
