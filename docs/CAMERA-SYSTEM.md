# Yakolak Camera System

## Current baseline

The game currently uses `OrbitControls` with pan disabled, bounded distance, and bounded polar angle. This prevents some extreme views but does not model the camera as part of game state.

## Target camera states

- `room-establishing`
- `board-overview`
- `player-turn`
- `piece-selection`
- `legal-move-inspection`
- `placement-preview`
- `opponent-move`
- `ai-thinking`
- `tutorial-focus`
- `invalid-action`
- `win-presentation`
- `post-game`

Each state must define position, target, FOV, input permissions, distance limits, polar limits, transition duration, easing, and recenter policy.

## Rules

1. Preserve board context during selection and placement.
2. Never move the camera for a minor UI event.
3. AI movement may guide attention but must not violently seize control.
4. Player orbit is temporary exploration; the camera returns only when gameplay context requires it.
5. Mobile limits must prevent the finger from covering likely destinations.
6. Reduced-motion mode uses shorter distance changes and minimal automatic rotation.
7. Camera transitions must be cancellable or tokenized to prevent overlapping animations.

## First implementation slice

Before adding new cinematic views, introduce a camera policy object around the existing controls and test only:

- board overview,
- limited player exploration,
- selection context preservation,
- calm return after an AI move.

No visual camera change is accepted without before/after screenshots from identical game states.
