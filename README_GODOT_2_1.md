# YAKOLAK 2.1 — Godot + GDScript

This is the first clean implementation in the 2.x series. It is rebuilt from `YAKOLAK_PORTABLE_KIT` and does not copy the historical Three.js wrapper chain.

## Engine

- Godot 4.7.1 stable
- GDScript only
- GL Compatibility renderer for Web, Windows, Android, and iOS compatibility
- Procedural 3D board and pieces for a small, portable baseline

## Included in 2.1

- Arabic-first setup: preferred color → 2/3/4 players → human/computer seats → 3/5 rounds.
- One deterministic rules engine for all seat types.
- The exact 3×3 board, three sizes per cell, three pieces per size and color, 18-second turns, legal-move validation, skips, draws, score persistence, rotating round starter, rematch, and return to setup.
- All three win conditions: same-size line, graded line, and complete cell.
- Playable 3D presentation with responsive camera, home stacks, accepted-move travel, win pulse, score markers, and round reset.
- Web export automation and Vercel static deployment configuration.

## Deliberate 2.1 boundary

Online transport is not falsely simulated. The gameplay state and rules are already separated from presentation so 2.2 can add a server-authoritative adapter without forking gameplay. Local humans and computer players already use the same move intent, validator, commit, victory, round, and score path.

## Project structure

- `project.godot` — engine and renderer configuration.
- `scenes/main.tscn` — single composition root.
- `scripts/game_rules.gd` — engine-independent authoritative rules.
- `scripts/main.gd` — setup, presentation, input, bot, turns, rounds, and recovery to setup.
- `export_presets.cfg` — Web export preset.
- `YAKOLAK_PORTABLE_KIT/` — approved product contract and source assets.
- `.github/workflows/export-godot-web.yml` — exports the Godot project to `web/`.
- `vercel.json` — serves the generated Web build.

## Run locally

1. Install Godot 4.7.1 stable.
2. Import `project.godot`.
3. Press F6/F5.

## Export Web

Install the 4.7.1 export templates, then run:

```bash
godot --headless --path . --export-release "Web" web/index.html
```

The generated `web/` directory is the Vercel output directory.

## Version policy

- `2.1.x`: stabilize the local/shared gameplay core and Web presentation.
- `2.2.x`: server-authoritative online invitations, reconnect, snapshots, and idempotent move IDs.
- `2.3.x`: asset-fidelity pass using the approved STL/table/room assets and complete intro/tutorial choreography.
