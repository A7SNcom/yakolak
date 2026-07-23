# Yakolak Improvement Log

## v111 — Clean player shell

### Problem

The production page always displayed a large `مسح` cache-maintenance control above the game.

### Hypothesis

Removing technical recovery UI from the normal player shell will improve first-impression quality, reduce visual competition, and prevent accidental destructive local cleanup without affecting gameplay.

### Player effect before

- A developer-looking button is visible from the first screen.
- The button competes with the game and suggests an unfinished build.
- Accidental activation clears caches, service workers, and IndexedDB before reloading.

### Smallest change

- Keep the existing maintenance implementation.
- Render the control hidden by default.
- Show and enable it only when the URL contains `?debug=1`.
- Preserve all v110 gameplay, rendering, camera, lighting, AI, rules, and performance code.

### Files affected

- `index.html`
- `app.js`
- `src/app-game-v111.js`
- `version.json`
- documentation under `docs/`

### Test method

1. Fetch normal Preview HTML and verify build 111.
2. Verify `clearCacheBtn` is emitted with `hidden`.
3. Verify normal-mode script sets `hidden=true`.
4. Fetch `?debug=1` and verify debug-mode logic permits the control.
5. Verify `app.js` loads `src/app-game-v111.js`.
6. Verify v111 imports v110 gameplay unchanged.
7. Check Vercel build state and runtime errors.
8. Run desktop/mobile browser playthrough when browser automation is available.

### Result

Pending Preview deployment verification.

### Keep or revert

Pending. Keep only after Preview build and source checks pass.

### Preview deployment

Pending.

### Next step

Reduce first-session friction by making the mandatory three-part tutorial skippable and action-led, using time-to-first-legal-move as the primary measure.
