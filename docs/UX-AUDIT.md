# Yakolak UX Baseline Audit

Date: 2026-07-23  
Production baseline: `v110-readable-charcoal`  
Production deployment: `yakolak.vercel.app`  
Branch under test: `111`

## Verified baseline

- Production deployment is `READY` on Vercel.
- Vercel reported no grouped runtime errors during the previous seven days.
- Current load path is `index.html -> app.js -> src/app-game-v110.js -> src/app-game-v085.js`.
- v110 rewrites the v085 source at runtime through exact string and regular-expression replacements.
- The game uses Three.js `0.165.0` from jsDelivr.
- Shadows are disabled in v110; the room is unlit and the board/pieces use a restrained three-light rig.
- Camera input uses `OrbitControls`, with pan disabled and distance/polar bounds, but no explicit camera state machine.
- Setup asks for player color and player count.
- The first session runs three scripted tutorial demonstrations and confirmation dialogs before normal play.

## Baseline findings by priority

### P0 — crashes and rules

No production runtime error cluster was detected. Rules and turn resolution still require automated scenario coverage before being considered fully protected.

### P1 — first-session friction

**Finding:** The tutorial is mandatory, passive, and long. It demonstrates three win patterns and asks “هل فهمت؟” after every demonstration. There is no visible skip path.

**Player effect:** Delayed first action, high cognitive load, and a feeling that the game is explaining instead of letting the player play.

**Next hypothesis:** A skippable, action-led first lesson will reduce time to first legal move without reducing comprehension.

### P1 — player shell contamination

**Finding:** A 58×58 px “مسح” cache-maintenance button is always rendered above the game in production.

**Player effect:** It competes with game controls, looks like unfinished developer UI, and can trigger destructive local cleanup accidentally.

**v111 action:** Hide it by default and expose it only with `?debug=1`.

### P1 — camera behavior

**Finding:** The camera has generic orbit bounds but no states for setup, selection, legal-move inspection, AI movement, invalid action, or win presentation.

**Player effect:** Camera behavior cannot consistently protect context or attention across game states.

**Next hypothesis:** A small camera policy layer can preserve board context while reducing accidental extreme views.

### P1 — architecture fragility

**Finding:** v110 dynamically fetches v085 source text and patches exact strings at runtime.

**Player effect:** A harmless base-source edit can cause startup failure if a replacement match changes.

**Engineering effect:** Testing and debugging are harder because the executed module is generated at runtime.

**Recommendation:** Do not rewrite immediately. First add automated bootstrap checks, then migrate one subsystem at a time to direct modules.

### P2 — mobile interaction

- `touch-action:none` prevents browser gestures and makes the game fully responsible for touch behavior.
- Dragging and camera orbit share the same canvas and require targeted conflict tests.
- Mobile quality tiers exist, but device-width detection is fixed at initial load.
- Safe-area handling is present in the viewport declaration but requires visual verification for every overlay.

### P2 — accessibility

- Reduced-motion support must be verified across camera transitions, tutorial animation, win blinking, and intro animation.
- Player information appears strongly color-led and needs non-color identifiers.
- Drag actions require a complete tap alternative.

## Visual baseline notes

The v110 code intentionally preserves:

- Neutral gray room surfaces.
- Medium charcoal board and player bases.
- White, gold, green, and blue pieces with restrained emissive support.
- No shadow map.
- Desktop DPR capped at 1.0 and mobile DPR tiered up to 1.15.

A visual screenshot matrix is still required for fixed desktop and mobile viewports before lighting or camera changes are accepted.

## Baseline test matrix

| Area | Status | Evidence |
|---|---|---|
| Production HTTP response | Pass | Vercel fetch returned HTTP 200 |
| Version consistency | Pass | Production HTML reports build 110 |
| Vercel deployment state | Pass | READY |
| Runtime error cluster | Pass | None in last seven days |
| Desktop visual playthrough | Pending | Requires browser screenshot/playback run |
| Mobile visual playthrough | Pending | Requires browser screenshot/playback run |
| Rules scenarios | Pending | Automated scenarios not yet located or added |
| Input race tests | Pending | Requires pointer/touch automation |

## First retained change

v111 removes the maintenance control from the normal player experience while preserving the recovery function in explicit debug mode. This is intentionally isolated from gameplay, lighting, camera, rules, AI, and performance.
