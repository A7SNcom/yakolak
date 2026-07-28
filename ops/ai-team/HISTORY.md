# Yakolak Durable Project History

_Last verified: 2026-07-28. Refresh facts against GitHub before acting._

## Product objective
Yakolak is a 3D board game intended to become fully playable online with a polished, understandable first-run journey, stable game rules, responsive desktop/mobile UX, and an evidence-driven developer/review workspace.

## Repository
- Repository: `A7SNcom/yakolak`
- Production branch: `main`
- Production version file currently identifies Build 125: `v125-white-wall-continuity`.
- PR #35 head branch: `agent/developer-d2-workbench`
- PR #35 title: `Developer D4: variant-aware AI development workspace`
- PR #35 is draft and targets `agent/developer-d1-scene-gallery`, not `main`.
- `agent/developer-d2-workbench` currently contains `main` and is 163 commits ahead of it at the last comparison, so it is not code-behind `main`; however, its PR target is a layered branch and must not be mistaken for a production release PR.
- Team integration branch: `agent/yakolak-team-os`.

## Released product line
- Builds through v120 focused on online play, mobile clarity, rules/round behavior, and visual stability.
- Builds v121–v125 introduced and refined the room/wall entry journey.
- Build 125 unifies the loader and menu on a neutral white wall and reveals the table only after a player choice.
- The D4 branch includes a Build 126 clean-entry journey rebuilt from the stable room/table foundation, with a continuous wall-to-wall camera path and official logos.

## Developer workspace line
- D1 established isolated scene and element previews plus persisted reviews.
- D2 added a three-area workbench, before/after comparison, review queue, and mobile navigation.
- D3 simplified the workflow around one content list, one central preview, and an on-demand work drawer with evidence-oriented tasks.
- D4 adds a unified scene/element registry, variants, deterministic preview URLs, per-variant review keys, comparison keys, broader game-state coverage, and journey auditing.

## Current D4 contract
The intended contract is:

`definition -> variant -> preview URL -> review key -> comparison key`

Key implementation files include:
- `src/developer-d4-registry.js`
- `src/developer-d4.js`
- `src/developer-scene-d4-router.js`
- `src/developer-scene-d4-states.js`
- `src/developer-scene-d4-variants.js`
- `src/app-game-developer-d4.js`
- `developer.html`
- `developer-scene.html`

## Verified current blockers
PR #35 documents four P0 blockers:

1. Add a true three-player variant.
2. Replace stale `currentIndex` preview behavior with runtime-correct `turnIndex` behavior.
3. Render the real `yakolakOnlineDialog` and full native online states, not only the `yakolakOnlineEntry` launcher or a substitute overlay.
4. Remove or correctly resolve the nested Blob relative-module import failure around `./online-client-v114.js`.

The journey audit also records missing or incomplete coverage for draw, bot thinking, turn timeout, piece tray, last move, full online lifecycle, and the online status pill.

## CI state at PR #35 head `62c8c2f...`
- `Audit Developer D4 Journey`: success.
- `Verify Developer D1`: skipped due a branch-specific workflow guard; this is rejected as a valid solution.
- `Verify Developer D3 UX`: failure at the D3 structural verifier because the live shell is now D4.
- v112, v118, v125, and Build 126 workflows: failure through the shared `npm test` chain at the same current contract problem.
- Required repair: preserve a real D3 fixture verifier, add an explicit D4 shell verifier, remove the D1 skip, keep the D4 contract verifier, and restore all game regression execution.

## Preview/deployment state
- Vercel reported free-plan deployment rate-limit failures during PR #35 activity.
- A later Vercel bot update on the PR reported the branch preview as Ready.
- Always verify the latest deployment/check state before relying on either statement.

## Repository hygiene risks
- Multiple open draft PRs represent overlapping experiments and historical branches.
- Some PRs are stacked on non-main bases.
- Branch/version naming spans D1–D4 and Builds 121–128, which can cause agents to confuse product runtime work with developer-workspace work.
- The manager must identify the active integration path before assigning code changes and must not revive abandoned experiments without evidence.

## Durable decisions
- Preserve existing game rules and released behavior unless the user explicitly changes them.
- Native runtime correctness is P0; visual completeness follows.
- Never silence, skip, weaken, or delete a regression workflow merely to make CI green.
- Use deterministic fixtures for historical surfaces such as D3 instead of pointing old verifiers at the active D4 shell.
- Use one shared preview contract rather than duplicated state-specific URL/key logic.
- Keep PR #35 draft until P0 blockers and regression gates are resolved.
- Do not merge PR #35 or deploy production without explicit user authorization.
- Workers are generalists. Assign roles per task, not permanently.
- At most five workers modify code in one hourly cycle; the others independently verify.

## Immediate recommended sequence
1. Repair the D3/D4 CI contract and restore all regression workflows.
2. Remove the Blob/import failure mode and prove game plus online hooks load.
3. Correct player-count and turn-state variants using `turnIndex`.
4. Render native online lifecycle states deterministically.
5. Promote the D4 journey audit to strict and close real coverage gaps.
6. Run desktop/mobile functional and visual evidence before proposing a release path.
