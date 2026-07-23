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
