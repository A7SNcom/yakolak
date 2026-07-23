# Yakolak Improvement Log

## v112 — Short, skippable, action-led tutorial

### Problem

Every new match forced the player to watch three complete win demonstrations and confirm each one before making a real move.

### Hypothesis

A short choice followed by guidance during the player's actual first move will reduce time-to-first-action and cognitive load while preserving access for players who want help.

### Smallest change

- Replace the three passive demonstrations with one short prompt.
- Provide `ابدأ اللعب` and `تخطي التعليم` choices.
- Guide the player through a real legal first move instead of a scripted example.
- Mark onboarding complete after that legal move.
- Skip the prompt automatically for returning players.
- Preserve v111 game rules, AI, rendering, controls, camera, lighting, and performance.

### Files affected

- `index.html`
- `app.js`
- `src/app-game-v112.js`
- `version.json`
- `package.json`
- `scripts/verify-tutorial-v112.mjs`
- `.github/workflows/verify-tutorial-v112.yml`

### Test method

1. Run the static and syntax contract in GitHub Actions.
2. Verify Preview reaches `READY` and loads build 112.
3. First-time path: choose setup, select `ابدأ اللعب`, confirm no scripted demonstrations, complete a legal move, and confirm onboarding is stored.
4. Skip path: select `تخطي التعليم` and confirm immediate normal play.
5. Returning path: reload with stored completion and confirm no prompt.
6. Repeat first-time and skip paths on desktop and mobile touch.
7. Check Console errors, viewport overflow, AI response, and unchanged visual presentation.

### Result

Pending Preview and interactive verification.

### Keep or revert

Pending. Keep only if all three onboarding paths work on desktop and mobile without gameplay regression.

### Preview deployment

Pending.

### Next step

After validation, measure the remaining delay and friction between setup completion and the first legal move.

---

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

1. Verify release/build consistency and the v111 bootstrap path.
2. Verify the maintenance control is hidden and inert in normal mode.
3. Verify `?debug=1` exposes the existing maintenance control.
4. Run the automated player-shell contract in GitHub Actions.
5. Confirm the Vercel Preview build and runtime logs.
6. Run complete desktop interaction using real pointer events.
7. Run complete mobile interaction at 390×844 / DPR 2 using real touch events.
8. Capture setup and post-move screenshots on both sizes.
9. Check Console errors, viewport overflow, a legal move, and the AI response.

### Result

Full pass:

- GitHub Actions `Verify player shell` completed successfully.
- Vercel Preview reached `READY`, served build 111, and reported no application runtime errors in the checked range.
- Desktop: loaded, selected a color and two-player mode, completed the existing tutorial, opened a piece tray, placed a legal large piece, and received an AI response.
- Mobile: repeated the same path using real touch events at 390×844 / DPR 2.
- Mobile viewport remained exactly within 390×844 with no horizontal or vertical overflow.
- No uncaught Console errors were observed during the tested desktop, mobile, and debug paths.
- Normal mode kept `clearCacheBtn` hidden; `?debug=1` displayed the 58×58 maintenance control.
- Screenshots are stored in `docs/screenshots/v111/`.

### Keep or revert

Keep. The change is isolated, reversible, tested on desktop and mobile, and does not alter game rules or rendering behavior.

### Preview deployment

- Branch alias: https://yakolak-git-111-ahmdkcoms-projects.vercel.app
- Visually tested source commit: `487ff596706194a5c342fe859e6c2024914584da`
- Final evidence commit: `5a9ae2b6062e38873ed02beef6aba1ec0ba65cf0`
