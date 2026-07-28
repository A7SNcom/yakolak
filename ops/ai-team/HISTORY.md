# Yakolak Durable Project History

_Last verified: 2026-07-28. Refresh all facts against GitHub before acting._

## Product objective
Yakolak is a 3D board game intended to become fully playable online with stable rules, a polished understandable first-run journey, responsive desktop/mobile UX, and an evidence-driven developer/review workspace.

## Repository and active lines
- Repository: `A7SNcom/yakolak`
- Production branch: `main`
- Production version file identifies Build 125: `v125-white-wall-continuity`.
- PR #35: draft `Developer D4: variant-aware AI development workspace`.
- PR #35 head branch: `agent/developer-d2-workbench`; verified head `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2` on 2026-07-28.
- PR #35 targets `agent/developer-d1-scene-gallery`, not `main`; it is a layered development PR, not a production release PR.
- Team integration branch: `agent/yakolak-team-os`.
- PR #36 carries the AI team operating system from the team branch back toward the active D integration source; it remains draft and is not a production release.

## Released product line
- Builds through v120 focused on online play, mobile clarity, rules/round behavior, and visual stability.
- Builds v121–v125 introduced and refined the room/wall entry journey.
- Build 125 unifies loader and menu on a neutral white wall and reveals the table only after a player choice.
- The current D branch includes Build 126 clean entry rebuilt from the stable room/table foundation with a continuous wall-to-wall camera path and official logos.

## Developer workspace line
- D1 established isolated scene/element previews and persisted reviews.
- D2 added a three-area workbench, before/after comparison, review queue, and mobile navigation.
- D3 simplified the workflow around one content list, one central preview, and an on-demand evidence-oriented work drawer.
- D4 adds a unified registry, variants, deterministic preview URLs, per-variant review/comparison keys, broader game-state coverage, and journey auditing.

## Current D4 contract
`definition -> variant -> preview URL -> review key -> comparison key`

Key files:
- `src/developer-d4-registry.js`
- `src/developer-d4.js`
- `src/developer-scene-d4-router.js`
- `src/developer-scene-d4-states.js`
- `src/developer-scene-d4-variants.js`
- `src/app-game-developer-d4.js`
- `developer.html`
- `developer-scene.html`

## Current product/workspace blockers
1. Remove the nested Blob-relative module failure around `./online-client-v114.js` and prove game plus online hooks load.
2. Add true three-player preview support and use runtime-correct `turnIndex` for all turn variants.
3. Render real `yakolakOnlineDialog` lifecycle states rather than only the launcher or substitute overlays.
4. Close journey gaps for draw, bot thinking, turn timeout, piece tray, last move, full online lifecycle, and online status pill.

## Verified CI state at source head `d8d2a50f...`
- Success: Verify v112 tutorial — run `30377398185`.
- Success: Verify v118 round selection — run `30377398301`.
- Success: Verify v125 white wall — run `30377398038`.
- Success: Verify Build 126 Clean Entry — run `30377398026`.
- Success: Verify Developer D3 UX — run `30377398175`.
- Success: Audit Developer D4 Journey — latest observed success in the same head sequence.
- Failure: Verify Developer D1 — run `30377398315`, job `90336466217`, first failing step `Verify D1 structure and syntax`.

The earlier statement that all shared regressions were failing is now stale. Agents must reproduce the current D1 failure instead of repeating the completed shared-CI repair.

## Preview/deployment state
- Vercel reported free-plan deployment rate-limit failures during PR #35 activity.
- A later Vercel update reported a branch preview Ready.
- Always verify current preview/deployment state before relying on either claim.

## Repository hygiene risks
- Multiple open draft PRs represent overlapping experiments and historical branches.
- Some PRs are stacked on non-main bases.
- Version naming spans D1–D4 and Builds 121–128, which can confuse product runtime work with developer-workspace work.
- The manager must verify the active integration path and current head before every assignment.

## Durable engineering decisions
- Preserve existing game rules and released behavior unless the user explicitly changes them.
- Native runtime correctness is P0; visual completeness follows.
- Never silence, skip, weaken, or delete a regression workflow to obtain green CI.
- Use deterministic fixtures for retained historical surfaces rather than pointing old verifiers at a new active shell.
- Use one shared preview contract rather than duplicated state-specific URL/key logic.
- Keep PR #35 draft until P0 blockers and regression/evidence gates are resolved.
- Do not merge PR #35, write to `main`, or deploy production without explicit user authorization.

## Durable team-system decisions
- Rashed is the only manager; duplicate manager automations are forbidden.
- Team: seven flexible workers plus independent read-only auditor Hakam.
- Scheduling uses one manager and four two-person pods because the platform permits five active tasks.
- Every employee still receives exactly one separate task, report, evidence trail, and evaluation per cycle.
- At most four workers write code; code effort is capped at eight points per hour; L tasks must be split.
- Root `AGENTS.md` defines mandatory coding, scope, validation, and branch rules.
- Every implementation needs a separate reviewer and Hakam `MERGE_OK`; no self-approval.
- Hakam scores manager/workers, maintains an evidence-based capability ledger, and can veto unsafe/stale/overlapping work.
- A stale premise or materially moved head blocks the task; agents do not repeat completed work.

## Immediate sequence
1. Repair the current D1 structural failure without weakening retained D1 coverage.
2. Remove Blob/import failure mode and prove both runtime hooks load.
3. Correct 2/3/4-player and `turnIndex` previews.
4. Implement deterministic native online lifecycle states after the seam is independently reviewed.
5. Promote the journey audit to strict and close real coverage gaps.
6. Run desktop/mobile functional evidence and real two-client online validation before proposing a release path.
