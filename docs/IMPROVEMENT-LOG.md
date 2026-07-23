# Yakolak Improvement Log

## v114 — Authoritative online rooms and mobile framing

### Problem

Production v113 supported only local seats/bots. Mobile portrait spent too much
of the viewport on the table body, compact landscape made the board too small,
and the initial online status pill collided with the turn HUD.

### Hypothesis

A two-player server-authoritative room using durable state and a small
tap-piece/tap-cell interaction can provide a reliable first online experience.
Device-specific overview framing and restrained board/table contrast should
improve mobile readability without expensive post-processing.

### Smallest changes

- Add private six-character rooms with bearer tokens stored only in each tab.
- Validate every move and turn on the server with versioned compare-and-swap.
- Poll only while needed, with abort, backoff, hidden-tab throttling, and
  reconnect recovery.
- Reframe portrait and compact landscape separately.
- Bound mobile pixel ratio and separate the cool board from the warm table.
- Move the mobile connection pill below the turn HUD.
- Use the official fetch-only Turso serverless driver on Node 22 LTS.

### Test method

1. Run syntax and authoritative-rule contracts.
2. Verify direct, graded, and same-cell wins plus wrong-turn, occupied-slot,
   stale-version, rematch, token, safe-area, touch-threshold, and DPR cases.
3. Open a real Vercel Preview at 390x844 and 844x390.
4. Create a room, join from a second tab, place a legal move, and verify the
   other client receives the move and turn.
5. Reload a connected client and verify session recovery.
6. Inspect browser Console, build output, and Vercel Runtime logs.

### Result

Keep. Final Preview `dpl_EEBBBjknvMnP77d9e7iGK8eT2j5e` reached `READY`.
The two-client room and move path passed, portrait/landscape framing remained
readable, no final-origin Console issues were found, and Vercel returned no
Runtime warning/error/fatal entries after the acceptance playtest.

### Preview

https://yakolak-jye7emtev-ahmdkcoms-projects.vercel.app

---

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
- `scripts/capture-v112-evidence.mjs`
- `scripts/verify-v112-multiplayer-restart.mjs`
- `.github/workflows/verify-tutorial-v112.yml`
- `.github/workflows/capture-v112-evidence.yml`
- `.github/workflows/verify-v112-multiplayer-restart.yml`
- `docs/screenshots/v112/`

### Test method

1. Run the static and syntax contract in GitHub Actions.
2. Verify Preview reaches `READY` and loads build 112.
3. First-time path: choose setup, select `ابدأ اللعب`, confirm no scripted demonstrations, complete a legal move, and confirm onboarding is stored.
4. Skip path: select `تخطي التعليم` and confirm immediate normal play.
5. Returning path: reload with stored completion and confirm no prompt.
6. Repeat onboarding paths on desktop and mobile touch.
7. Complete a full human-plus-bots turn cycle with three players on desktop and mobile.
8. Complete a full human-plus-bots turn cycle with four players on desktop and mobile.
9. Trigger a valid win and verify automatic round restart, score increment, and removal of board pieces, highlights, winner, lock, and last-move state.
10. Reload the page and verify clean setup, retained onboarding completion, and a fresh four-player match at round 1 with zero scores.
11. Check Console errors and viewport overflow throughout.
12. Store screenshots and machine-readable results in the repository.

### Result

Full pass:

- GitHub Actions `Verify v112 tutorial` completed successfully.
- GitHub Actions `Capture v112 visual evidence` completed successfully on desktop and mobile.
- GitHub Actions `Verify v112 multiplayer and restart` run `30022731792` passed its desktop and mobile matrix.
- The first-time path showed one short prompt, then guided the player's actual first legal move.
- The explicit skip path entered normal play without scripted demonstrations.
- The returning-player path showed no tutorial prompt after completion was stored.
- Three-player cycles completed with one human and two bot moves before control returned to the human.
- Four-player cycles completed with one human and three bot moves before control returned to the human.
- Automatic post-win restart advanced to round 2, incremented the winner to one point, and cleared the board, placed pieces, highlights, winner, lock, and all last-move state.
- Full reload returned to color setup, retained onboarding completion, and started a fresh four-player match at round 1 with zero scores.
- Desktop viewport stayed at 1440×900 with no overflow.
- Mobile viewport stayed at 390×844 / DPR 2 with no overflow.
- No application Console or page errors were observed.
- Vercel Preview served `v112-action-tutorial` / build 112 and reported no warning, error, or fatal Runtime logs in the checked range.
- Evidence is stored in `docs/screenshots/v112/`, including onboarding results and separate desktop/mobile multiplayer results with `ok == true`.

### Keep or revert

Keep. The change is isolated, reversible, and passed onboarding, three-player, four-player, post-win restart, and full-reload restart paths on desktop and mobile without changing game rules or visual presentation.

### Preview deployment

- Branch alias: https://yakolak-git-112-ahmdkcoms-projects.vercel.app
- Onboarding visual source commit: `386f31b957e0861c3ec2bdca4230ec38e3d2b827`
- Onboarding evidence commit: `a7a156fd4560b85812215a54ed7d478483cf37ca`
- Multiplayer/restart matrix run: `30022731792`
- Multiplayer/restart evidence commit: `d2294d2694431b5ff6124e7901417ef0b148d19b`

### Next step

Measure and reduce any remaining delay between setup completion and the first legal move, then extend the first-move guide only when the player hesitates or makes repeated invalid attempts.

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
