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
- `scripts/verify-player-shell.mjs`
- `.github/workflows/verify-player-shell.yml`
- documentation under `docs/`

### Test method

1. Fetch normal Preview HTML and verify build 111.
2. Verify `clearCacheBtn` is emitted with `hidden`.
3. Verify normal-mode script sets `hidden=true`.
4. Verify debug-mode logic permits the control only with `?debug=1`.
5. Verify `app.js` loads `src/app-game-v111.js`.
6. Verify v111 imports v110 gameplay unchanged.
7. Run the player-shell contract in GitHub Actions.
8. Check Vercel build state and preview runtime logs.
9. Run desktop/mobile browser playthrough when interactive browser automation is available.

### Result

Partial pass with automated contract success:

- GitHub Actions run `30009949587` completed successfully for `Verify player shell`.
- The automated contract verifies release/build consistency, hidden maintenance markup, debug-only visibility and execution guards, the v111 bootstrap path, and unchanged v110 gameplay import.
- Latest tested branch deployment `dpl_CUHj5t7DKgTUXtWVFMbYYA1Kg8zS` reached `READY`.
- Preview root returned HTTP 200 and reported `v111-clean-player-shell` / build 111.
- Preview HTML contains the maintenance button with the `hidden` attribute and the normal-mode guard.
- Preview `app.js` returned HTTP 200 and loads the v111 entrypoint.
- GitHub source confirms v111 imports v110 gameplay unchanged.
- No preview warning or error runtime logs were found in the checked one-hour range.
- Vercel preview protection prevented independent stateless fetching of some nested assets; this is not treated as an application failure.
- A full visual and interactive desktop/mobile WebGL playthrough remains pending because browser automation was unavailable in this execution environment.

### Keep or revert

Keep on branch `111` and in draft PR `#8`. Do not merge to `main` or deploy to Production until the interactive desktop/mobile checklist passes.

### Preview deployment

- Branch alias: https://yakolak-git-111-ahmdkcoms-projects.vercel.app
- Latest tested deployment: https://yakolak-e2lonfmjv-ahmdkcoms-projects.vercel.app

### Next step

Reduce first-session friction by making the mandatory three-part tutorial skippable and action-led, using time-to-first-legal-move as the primary measure.
