# Sara

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `001-hardening`
- Task ID: `YAK-001-07`
- Status: `READY`
- Task type: `TEST/REVIEW`
- Effort: `M (3 points)`
- Risk: `high-game-state`
- Objective: Independently review Mazen's player/turn contract and map the exact evidence needed to prevent a false-green D4 state preview.
- Why now: Player counts and turn ownership affect real game correctness, and static contract checks alone may miss broken rendered state.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; observed `2026-07-28T16:16Z`.
- Base branch: read-only latest source/integration and Mazen PR if available.
- Allowed files: Mazen PR/diff/checks; D4 registry/state/contract tests; actual game player/turn runtime; workflows and browser evidence scripts.
- Forbidden files / conflicts: no repository writes except this report block; no code changes; no online lifecycle review assigned to Nada.
- Change budget: read-only.
- Acceptance criteria:
  1. Verify `three-players` activates exactly three players/bases/piece sets/HUD entries.
  2. Verify all four turn variants use `turnIndex` and visibly identify the correct active color.
  3. Search changed D4 scope for stale `currentIndex` and distinguish unrelated legacy occurrences.
  4. Issue `PASS`, `CONDITIONAL`, or `FAIL` on Mazen's PR.
  5. Map static, deterministic, browser, desktop/mobile, and real-game evidence still required before release.
- Required validation: exact paths/symbols/assertions, Mazen PR/commit/check IDs, and current workflow/script behavior.
- Independent reviewer: none; Hakam audits this review.
- Expected artifact: review verdict plus compact release-evidence matrix.
- Context links: `AGENTS.md`, `ops/ai-team/BOARD.md`, Mazen task/PR, current game runtime, D4 registry/state/tests/audit.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `BLOCKED`
- Summary / verdict: `CONDITIONAL — no Mazen implementation PR or commit exists to review. Current integration baseline still fails the task contract: gameplay/HUD expose only two/four-player variants; `playersFor(3)` returns four players; setup and turn previews write `currentIndex`; the static contract verifier checks URL/key round-trips only and cannot prove rendered player/HUD/turn state.`
- Observed head / freshness: integration/PR #36 head `746dc8ab727907bc257e2913e586d10900517234`; source/PR #35 head `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; checked during cycle `001-hardening`. No PR matching `YAK-001`, `agent/mazen/`, or a Mazen implementation was found.
- Commit / PR / evidence reviewed: PR #35, PR #36, current `agent/yakolak-team-os` files; no Mazen PR/check IDs available.
- Files and symbols inspected: `src/developer-d4-registry.js` (`gameplay-ready`, `game-hud`, `turn-state`); `src/developer-scene-d4-states.js` (`playersFor`, `setupPlay`, `configureGameplay`, `configureTurn`, `configureHudElement`); `scripts/verify-developer-d4-contract.mjs`.
- Validation/evidence matrix: `Static contract: currently insufficient—must assert gameplay/HUD variants exactly [two,three,four] and sourceKey=gameState.turnIndex; deterministic state test: required—instantiate/mock game and assert players, visible bases, visible piece sets, HUD rows, turnIndex, activeColor for every variant; browser functional: required—load each preview URL and inspect __yakolakDeveloperD4State plus live game state/DOM; desktop/mobile visual: required—screenshots for 2/3/4 HUD and four active colors; real-game parity: required—compare preview player ordering and turn ownership with actual local setup/runtime; release verdict cannot become PASS from syntax/static URL tests alone.`
- Residual risks: HUD rows may remain four even when meshes are hidden; `turnIndex` may be set but active glow/timer/caption may still reflect another player; three-player color ordering could diverge from production runtime; static checks can produce a false green without browser assertions.
- Required merge checks: Mazen PR must stay within 3 files/180 lines; zero stale `currentIndex` in changed D4 player/turn scope; focused deterministic assertions for 2/3/4 players and all four turns; browser evidence on desktop/mobile; current D4 contract and journey audit green; Hakam `MERGE_OK`.
- Recommended next task: keep Sara on HOLD until Mazen publishes a bounded PR, then review its exact diff/checks and issue a final PASS/CONDITIONAL/FAIL.
- Team note: No code, no verdict theatre 😄 — the baseline tells us what must be proven, but there is nothing mergeable yet.
<!-- WORKER REPORT:END -->