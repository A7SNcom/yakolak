# Sara

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `004-canonical-entry-contract`
- Task ID: `YAK-004-04`
- Status: `READY`
- Task type: `TEST/REVIEW`
- Effort: `S (2 points)`
- Risk: `high-human-interface`
- OBSERVED: PR #38 head at manager snapshot is `dae593e6d5fb458295ee91f46722655f8a1d7f1e`; the READY Vercel Preview was built from older `07d61c82c9d876fd1942e9c9e4ac14aa02cb7257`; PR #38 is not merged and the President channel is inactive.
- Single outcome: determine whether PR #38 now has exact-head CI and exact-head Preview evidence sufficient to leave HOLD or advance to independent review.
- Allowed scope: PR #38 metadata/diff/comments/checks/artifacts; Vercel deployment metadata and desktop/mobile evidence.
- Forbidden scope: no repository edits, merge, portal activation, API reconciliation, or claims based on stale Preview.
- Acceptance criteria: confirm exact current head; list all exact-head check conclusions; verify Preview commit equals head; inspect desktop/mobile artifact or report missing; state `PASS_TO_REVIEW | HOLD | FAIL` with exact evidence.
- Stop conditions: checks still running, Preview mismatch/unavailable, artifact unavailable, or head moves.
- Expected artifact: concise evidence verdict. This is not reviewer PASS or Hakam MERGE_OK.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `HOLD`
- Summary / verdict: PR #43 has exact-head Preview and real desktop/mobile artifacts, but it is not eligible for `PASS_TO_REVIEW` because the exact-head `Verify AI Team OS` required check is failing and no independent reviewer/manager/Hakam gate set exists.
- Observed head / freshness: PR #43 remains open Draft at exact head `201d8b5b835c53b7b80b89ca5d31d56e03ca28bb`; prior PR #38/#42 evidence is closed history and was not reused.
- Evidence reviewed: PR #43 metadata/comments; workflow runs `30388444716` President Portal, `30388442937` Architecture Guardrails, `30388445266` AI Team OS; artifact `president-portal-visuals` ID `8699923139`; Vercel deployment `dpl_DtWj6u3YC3ym1SoBdrK85mQwWEud`.
- Exact-head checks: President Portal `success`; Architecture Guardrails `success`; Build 126, v112, v118, v125, and D3 `success`; Developer D1 `failure` on the known baseline; AI Team OS `failure` at validation step, therefore the required exact-head check set is not green.
- Preview / desktop-mobile evidence: Vercel deployment is `READY` and metadata `githubCommitSha` exactly equals `201d8b5b...`; inspected four exact-head PNGs: desktop reviews/directives are `1440×1000`, mobile reviews/directives are `390×844`. The layouts are readable and responsive; no obvious clipping or horizontal overflow is visible in the captured states.
- Residual risks: static team-contract failure remains unresolved; screenshots use seeded review/directive data and do not by themselves prove live President API persistence; reviewer PASS, Rashed personal PASS, and Hakam MERGE_OK are absent. President channel must remain inactive and unmerged.
- Recommended next task: repair or formally reconcile the AI Team OS verifier against the current contract without weakening it, rerun exact-head checks, then obtain an independent portal review before Hakam re-audits.
- Team note: الصورة وصلت واضحة، لكن البوابة ما زالت حمراء—ما نمشيها بالمجاملة.
<!-- WORKER REPORT:END -->
