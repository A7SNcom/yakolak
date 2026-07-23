# v113 — First-move breathing room

Date: 2026-07-23

## Problem

A beginner could lose the first guided turn while still reading the
instruction. Production v112 started the normal 18-second deadline before the
player had completed one legal move.

## Research

- Apple Human Interface Guidelines: teach onboarding through fast, optional,
  safe interaction.
- WCAG 2.2.1 Timing Adjustable: remove or adjust nonessential time limits so
  users have adequate time.
- Chen et al. (ACM, 2024): slowing tutorial time while keeping player input
  responsive can improve control learnability and reduce cognitive load.

The sources and their application are recorded in
`docs/player-experience-research.md`.

## Hypothesis

Pausing only the first guided human deadline will let a beginner read and act
without losing a turn, while preserving the existing pace everywhere else.

## Implementation

- Added `src/app-game-v113.js`.
- Paused the deadline only when `firstMoveGuide` is active for the human.
- Replaced the frozen seconds display with `تعلّم`.
- Reused the existing first-legal-move path to end the guide and restore the
  normal timer.
- Added release and tutorial-module static contracts plus a dedicated GitHub
  Actions workflow.

No rule, AI, camera, lighting, material, animation, or quality value changed.

## Verification

- Production v112 baseline: desktop 1440x900, mobile 390x844 and 844x390.
- Local v113: first guided turn unchanged after 22 seconds on desktop and
  portrait mobile.
- Preview v113: first guided turn unchanged after 22 seconds on desktop and
  portrait mobile.
- Legal first move accepted; the next human turn displayed the normal
  countdown.
- Preview portrait and landscape document dimensions exactly matched their
  viewports.
- No application Console errors appeared on the tested Preview.
- Vercel deployment READY with a clean build.
- GitHub Actions completed successfully.

Visual evidence is stored in `docs/validation-v113/`.

## Result

Keep. The player can no longer lose the very action the game is trying to
teach, and all later timing remains unchanged.

## Risks

- The first guided turn can remain open indefinitely. This is intentional for
  a solo onboarding action; returning and skip paths remain timed.
- The current v113 wrapper inherits the layered runtime architecture. A future
  maintainability improvement should consolidate version wrappers separately,
  not inside this player-facing experiment.

## Links

- Branch:
  https://github.com/A7SNcom/yakolak/tree/v113-first-move-breathing-room
- Player-facing commit:
  https://github.com/A7SNcom/yakolak/commit/13cd98f559e6d688aa1c246234696d7853bfa093
- Verified head commit:
  https://github.com/A7SNcom/yakolak/commit/2ed6596904463b7bed729c53296b94af17a31d2d
- GitHub Actions:
  https://github.com/A7SNcom/yakolak/actions/runs/30038624423
- Vercel Preview:
  https://yakolak-p4qdrnta9-ahmdkcoms-projects.vercel.app
- Vercel inspector:
  https://vercel.com/ahmdkcoms-projects/yakolak/HhESy9BESErjGv6yFFcGbQLp5oEk

## Next smallest improvement

Separate tap from camera drag using a measured movement threshold, beginning
with a production observation and an isolated input-state experiment.
