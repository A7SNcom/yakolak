# Yakolak Game UX Research

## Purpose

Turn established HCI and game-design principles into small, testable decisions for Yakolak. Every item below must map to a player problem, an implementation hypothesis, and a measurable outcome.

## Applied principles

| Principle | Yakolak problem | Application decision | Success measure | Source |
|---|---|---|---|---|
| Error prevention | A destructive cache control is always visible beside the game and can be pressed accidentally. | Hide maintenance controls in the normal player shell; expose them only in explicit debug mode. | No maintenance control in normal mode; recovery remains available with `?debug=1`. | Nielsen Norman Group, usability heuristic: error prevention — https://www.nngroup.com/articles/ten-usability-heuristics/ |
| Visual hierarchy | Technical controls compete with the board and turn information. | Only controls related to the current player task may remain visible. | First glance contains game state, not developer tooling. | Apple HIG, hierarchy and designing for games — https://developer.apple.com/design/human-interface-guidelines/designing-for-games/ |
| Teach through play | The current tutorial runs three demonstrations before normal play and asks for confirmation after each. | Replace passive mandatory demonstrations incrementally with a short, skippable, state-linked tutorial. | Lower time to first legal move; tutorial can be skipped and replayed. | Apple HIG, designing for games — https://developer.apple.com/design/human-interface-guidelines/designing-for-games/ |
| Progressive disclosure | New players receive several win patterns before making a move. | Introduce one concept at a time when it becomes relevant. | Fewer instructions shown before the first action; reduced first-session hesitation. | Cognitive Load Theory; Sweller (1988), DOI: https://doi.org/10.1207/s15516709cog1202_4 |
| Direct manipulation and alternatives | Dragging can conflict with camera movement and precision on touch. | Preserve tap-select/tap-place as a complete alternative to drag. | Every drag action has a single-pointer non-drag equivalent. | WCAG 2.2, 2.5.7 Dragging Movements — https://www.w3.org/TR/WCAG22/ |
| Target size | Small or crowded controls create touch errors. | Use at least 44×44 pt for frequent mobile controls and avoid overlap with safe areas. | No important mobile control below the target threshold. | Apple HIG game controls — https://developer.apple.com/design/human-interface-guidelines/game-controls |
| Flow | A challenge that is too hard or too easy breaks engagement. | Difficulty must vary by decision quality, search depth, and tolerance, not only response speed. | New players complete early rounds without obvious AI stupidity; experts still face meaningful prevention. | Sweetser & Wyeth, GameFlow, DOI: https://doi.org/10.1145/1077246.1077253 |
| Mechanics–Dynamics–Aesthetics | A code change is not valuable unless it changes player experience. | Record the player-facing effect of every mechanics or presentation change. | Improvement log contains a problem, hypothesis, before/after evidence, and keep/revert decision. | Hunicke, LeBlanc & Zubek, MDA — https://users.cs.northwestern.edu/~hunicke/MDA.pdf |
| Reduced motion | Camera and win animation can cause discomfort. | Respect reduced-motion preference and provide a lower-camera-motion option. | Essential information remains clear with motion reduced. | WCAG 2.2, animation from interactions — https://www.w3.org/TR/WCAG22/ |
| Fitts’s Law | Distant or small targets slow selection and increase misses. | Keep frequent actions close to the board decision area without covering legal destinations. | Lower pointer travel and fewer wrong selections on mobile. | Fitts (1954), DOI: https://doi.org/10.1037/h0055392 |
| Hick’s Law | Too many simultaneous choices increase decision time. | Show only actions relevant to the current state. | Reduced number of visible controls during a turn. | Hick (1952), DOI: https://doi.org/10.1080/17470215208416600 |

## Current research-backed priorities

1. Remove developer and maintenance UI from the normal player shell.
2. Make the first tutorial skippable, shorter, and action-led.
3. Replace generic camera behavior with explicit game-state camera policies.
4. Ensure tap-based play is complete and reliable on touch devices.
5. Add non-color-only indicators for players and legal moves.

## Measurement baseline

The project should add privacy-preserving local measurements before external analytics:

- Time from ready state to first legal move.
- Number of invalid attempts before the first legal move.
- Tutorial skipped, completed, or replayed.
- Selection cancellation count.
- Turn duration and frame-time spikes.
- Completed round and replay action.

No personal identifiers or unnecessary external tracking should be added.

## Applied in v114 — online rooms and mobile framing

| Principle | Observed problem | v114 application | Measurement | Source |
|---|---|---|---|---|
| Server authority | Two clients could otherwise disagree about turns, occupied slots, or wins. | The server validates the move against a versioned room state; stale writes are rejected. | Two simultaneous requests cannot both update the same version. | Vercel realtime guidance and established optimistic-concurrency practice — https://vercel.com/kb/guide/real-time-chat-websockets |
| Minimize shared mutable infrastructure | Permanent sockets still require durable cross-instance state on Vercel. | Use bounded HTTP polling with the existing Turso database for the first turn-based release. | Room survives Function instance changes and client reloads. | Vercel WebSocket durability guidance — https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections |
| Error recovery | Mobile networks pause, resume, and reorder requests. | Request timeout, exponential retry, visibility-aware polling, and room versions. | A stale client reloads state and never duplicates a move. | Nielsen Norman Group, error recovery — https://www.nngroup.com/articles/ten-usability-heuristics/ |
| Fitts's Law and drag alternative | Small pieces and camera dragging share the mobile canvas. | Online play uses tap-piece then tap-zone with a 9px tap/drag threshold and enlarged legal rings. | Camera drag is not submitted as a move; every move is possible without dragging. | WCAG 2.2, 2.5.7 — https://www.w3.org/TR/WCAG22/ |
| Visual hierarchy | The phone framed table legs and gray surfaces more strongly than the pieces. | Use a portrait overview aimed at the play surface, warmer table value, cooler board value, and a bounded DPR increase. | Board and pieces occupy more of 390x844 without body overflow or a major GPU-cost increase. | Apple HIG, designing for games — https://developer.apple.com/design/human-interface-guidelines/designing-for-games/ |
