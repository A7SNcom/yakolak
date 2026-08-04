# World and Coordinates

Coordinate system: Y is up; board center is `(0,0,0)`. Use any unit scale, but scale everything uniformly. The same data is available in `assets/layout/world-layout.json`.

## Fixed measurements

| Item | Value |
|---|---:|
| Cell spacing | 48 |
| Player-base radius | 135 |
| Board/base Y | 6 |
| Final piece Y | 2 |
| Drag piece Y | 14 |
| Home-stack lift per size | 19 |
| Normal drop radius | 31 |
| Current forgiving drop radius | 42 |

## Cell centers

| ID | Position X,Y,Z |
|---:|---|
| 0 | `-48, 2, -48` |
| 1 | `0, 2, -48` |
| 2 | `48, 2, -48` |
| 3 | `-48, 2, 0` |
| 4 | `0, 2, 0` |
| 5 | `48, 2, 0` |
| 6 | `-48, 2, 48` |
| 7 | `0, 2, 48` |
| 8 | `48, 2, 48` |

All three size slots share the same center.

## Board and player bases

| Object | Position X,Y,Z | Rotation X,Y,Z degrees |
|---|---|---|
| board | `0,6,0` | `-90,0,0` |
| white/right base | `135,6,0` | `-90,0,0` |
| gold/left base | `-135,6,0` | `-90,0,180` |
| green/front base | `0,6,135` | `-90,0,90` |
| blue/back base | `0,6,-135` | `-90,0,-90` |

## Home stack centers

- White/right: `(135,2,-48)`, `(135,2,0)`, `(135,2,48)`
- Gold/left: `(-135,2,-48)`, `(-135,2,0)`, `(-135,2,48)`
- Green/front: `(-48,2,135)`, `(0,2,135)`, `(48,2,135)`
- Blue/back: `(-48,2,-135)`, `(0,2,-135)`, `(48,2,-135)`
- Piece rotation: `-90,0,0` degrees.

Each home center initially contains a nested large, medium, and small piece.

## Score markers

Marker radius from center: 85. Gap: 11. Placement order from each row center: `0,-1,+1,-2,+2,-3,+3` gaps.

- Green/front row: center `(0,7,85)`, spread on X.
- Blue/back row: center `(0,7,-85)`, spread on X.
- White/right row: center `(85,7,0)`, spread on Z.
- Gold/left row: center `(-85,7,0)`, spread on Z.

## Room

The room is generated geometry, not a missing model file.

| Boundary | Value |
|---|---:|
| floor Y | -650 |
| ceiling Y | 1250 |
| left/right X | -2400 / 2400 |
| back/front Z | -2400 / 2400 |
| table top Y | -16 |

Place the table at room center. Align the complete game group to the detected table top with about `0.8` clearance.

## Main camera poses

| View | Position | Target | FOV |
|---|---|---|---:|
| desktop play | `520,430,520` | `0,0,0` | 43 |
| compact landscape play | `245,325,285` | `0,0,0` | 45 |
| portrait 2-player play | `330,560,455` | `0,18,0` | 46 |
| portrait 3–4-player play | `380,620,510` | `0,18,0` | 48 |
| desktop menu wall | `0,250,-820` | `0,250,-2386` | 42 |
| compact menu wall | `0,245,-560` | `0,245,-2386` | 46 |
| portrait menu wall | `0,250,-260` | `0,250,-2386` | 48 |
| desktop side wall | `1080,260,0` | `2386,260,0` | 43 |
| compact side wall | `980,250,0` | `2386,250,0` | 47 |
| portrait side wall | `820,280,0` | `2386,280,0` | 49 |

## Approved loader-to-room poses

| View | Position | Target | FOV |
|---|---|---|---:|
| desktop wall star | `0,250,-1534` | `0,250,-2354` | 42 |
| compact wall star | `0,250,-1534` | `0,250,-2354` | 46 |
| portrait wall star | `0,250,-1534` | `0,250,-2354` | 48 |
| desktop second wall | `1050,275,0` | `2354,260,0` | 42 |
| compact second wall | `820,285,0` | `2354,255,0` | 46 |
| portrait second wall | `650,350,0` | `2354,260,0` | 48 |

The room-reveal destination is the matching play pose above.

## Reference palette

Wall `#f7f7f4`; floor `#deddd7`; table `#aeb2b6`; board `#4a5562`; white `#f1eee6`; blue `#3769a5`; gold `#b78a44`; green `#2f856a`; dark ink/loading star `#3f3f3f`.

Lighting implementation is replaceable. Keep the room neutral, the board readable, and all four colors clearly separated on mobile and desktop.
