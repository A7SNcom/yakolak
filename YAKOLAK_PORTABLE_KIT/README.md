# YAKOLAK — Portable Rebuild Kit

Use this kit to rebuild the same game in any engine, framework, language, renderer, or networking stack.

## Read in this order

1. [`GAME.md`](GAME.md) — rules, players, turns, wins, bots.
2. [`WORLD.md`](WORLD.md) — coordinates, room, table, cameras, colors.
3. [`SCENES.md`](SCENES.md) — every required player-visible state.
4. [`MOTIONS.md`](MOTIONS.md) — every important movement and duration.
5. [`EVENTS.md`](EVENTS.md) — engine-neutral event contract.
6. [`ONLINE.md`](ONLINE.md) — authoritative multiplayer and match rules.
7. [`ASSETS.md`](ASSETS.md) — included models, logos, textures, and room specification.
8. [`CHECKLIST.md`](CHECKLIST.md) — equivalence tests.
9. [`AUDIT.md`](AUDIT.md) — what was accepted, corrected, or discarded.

## Non-negotiable principles

- Game state is authoritative; meshes, UI, particles, camera, and animation never decide rules.
- A move is committed once through one validator. Tap, click, drag, bot, and network input use that same rule.
- A completed animation snaps to exact final values. A skipped animation reaches the same final state.
- Uniform world scaling is allowed. Relative positions, slot logic, order, and timings remain unchanged.
- Do not reproduce the historical chain of wrapper files. Build a clean state machine from this kit.

## Game in ten lines

- 3×3 board; 9 cells.
- Four identities: white, blue, gold, green.
- Three sizes: small, medium, large.
- Each color owns three pieces of each size: 9 pieces per color, 36 total.
- Each cell has one independent slot for each size; different sizes may share a cell.
- A placed piece never moves again until the round resets.
- Win by a same-size line, a small-medium-large line, or all three sizes in one cell.
- Local play supports 2–4 players and continues round by round.
- Online play supports 2–4 players and a fixed match of 3 or 5 rounds.
- The included assets and coordinates define the visual and spatial identity.
