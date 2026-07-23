# Yakolak v112 Production Baseline

Date: 2026-07-23

## Verified source of truth

- Repository: `A7SNcom/yakolak`
- Default branch: `main`
- Production commit: `584910961d9b69c3263c98b0eafb29daf323fa55`
- Production version: `v112-action-tutorial`
- Production URL: `https://yakolak.vercel.app`
- Vercel deployment: `dpl_Gy6oNi6XaJrcUvdwmwKgLrCe6UQK`
- Deployment state: `READY`
- Runtime error clusters in the checked seven-day window: none

The real runtime path is:

```txt
index.html -> app.js -> src/app-game-v112.js -> generated v085-based runtime
```

The README and some architecture documents still describe older v092 or
`app-live.js` routes. They are historical references, not the current runtime.

## Browser baseline

Desktop production was tested at 1440x900 with pointer input. Chrome production
was also tested at 390x844 portrait and 844x390 landscape. All three viewports:

- reached `body.yakolak-ready`;
- served the v112 version marker;
- had no horizontal or vertical body overflow;
- kept the maintenance control hidden;
- produced no application Console errors on the setup path.

Reference captures are stored locally in `docs/baseline-v112-production/`.

## Highest-impact observed problem

During the first guided move, the normal 18-second turn deadline starts
immediately. If a new player reads the instruction or hesitates, the game ends
their turn, lets every bot move, and returns with the generic `دورك` caption
before the player has made one legal move.

Player-facing formulation:

> The beginner can lose the first guided turn while still learning what to tap,
> with no explicit choice to extend or disable the timer.

This is higher priority than lighting polish because it changes game state,
interrupts onboarding, and can make the first interaction feel unfair.

## Controlled first experiment

Pause the deadline only while `firstMoveGuide` is active and it is the human
player's turn. Show `تعلّم` instead of a misleading countdown. Restore the
normal timer as soon as the first legal human move is recorded.

No rules, AI evaluation, camera, lighting, material, or animation value changes
belong in this experiment.
