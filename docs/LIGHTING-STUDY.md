# Yakolak Lighting Study

## v110 baseline

- Neutral tone mapping with exposure near `0.98`.
- Uniform unlit room surfaces.
- Charcoal board with restrained emissive support.
- Three-light playfield rig: hemisphere, directional key, and camera-attached viewer light.
- Shadows disabled for performance and consistency.
- Desktop pixel ratio capped at 1.0; mobile uses tiered caps.

## Visual goals

1. The board is the primary focal point.
2. Grooves and ring sizes remain readable without making the board pale.
3. Dark materials retain internal detail.
4. No wall becomes dramatically brighter than the others.
5. White pieces avoid clipping; blue and green remain distinguishable.
6. Materials appear matte and physical, not glossy plastic.
7. The result remains stable across desktop and mobile quality tiers.

## Controlled test protocol

- Use fixed camera transforms and fixed board states.
- Change one variable or one tightly related group per experiment.
- Capture empty board, mid-game, full board, every selected player color, and win state.
- Compare normal and reduced display brightness.
- Record exposure, light intensity, roughness, emissive values, DPR, FPS, and frame time.
- Revert any change that improves beauty but reduces piece or groove readability.

## Current decision

v111 makes no lighting change. The v110 lighting and material values are frozen until a repeatable screenshot matrix is available.
