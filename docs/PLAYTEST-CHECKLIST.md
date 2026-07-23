# Yakolak Playtest Checklist

## Before each test

- Record commit SHA, deployment URL, viewport, DPR, browser, input method, and quality profile.
- Clear only the game's own test state when necessary; do not rely on the player-facing shell for maintenance.
- Capture console and runtime errors.

## Desktop

- Load to ready state.
- Choose every player color at least once.
- Start two-, three-, and four-player configurations.
- Complete a legal move by click-select/click-place.
- Cancel selection.
- Attempt an illegal placement.
- Click rapidly and double-click during animation.
- Orbit to each boundary and verify recovery.
- Complete an AI turn, win, replay, and restart.

## Mobile and touch

- Test small portrait, tall portrait, landscape, and tablet sizes.
- Verify safe areas and no clipped RTL text.
- Verify finger-sized targets and no accidental adjacent selection.
- Separate tap, piece drag, and camera drag.
- Rotate during setup, a player turn, AI thinking, and game over.
- Background and restore the page.
- Confirm stable frame pacing and responsive input.

## Accessibility

- Reduced motion.
- Motion-reduced camera.
- Sound off and independent sound level when available.
- Color-vision simulation and non-color indicators.
- Keyboard/focus behavior for HTML controls.
- No rapid flashing.

## Visual captures

Use identical camera/game states for:

- loader,
- setup color choice,
- player-count choice,
- empty board,
- selected S/M/L pieces,
- legal destinations,
- invalid action,
- AI move,
- full board,
- win pattern,
- post-game.

## Pass conditions

- No uncaught errors.
- No illegal move accepted.
- No duplicated turn or animation.
- No stale highlight or AI task after restart.
- Normal player mode contains no developer/maintenance controls.
- Debug mode retains the recovery control.
- Build/version markers agree.

## v111 release verification — 2026-07-23

Passed for the v111 change scope:

- Desktop Chromium, real pointer input, setup through one legal player move and AI response.
- Mobile emulation 390×844 / DPR 2, Android user agent, real touch input, setup through one legal player move and AI response.
- No Console errors during the tested paths.
- No mobile overflow.
- Normal mode hides maintenance UI.
- `?debug=1` exposes maintenance UI.
- Visual evidence: `docs/screenshots/v111/`.

Broader game regression items such as every color, all player counts, win/replay, rotation, and accessibility remain recurring release checks; they were not changed by v111 and are not claimed as newly validated by this shell-only release.
