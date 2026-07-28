# Sara

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `005-evidence-reconciliation`
- Task ID: `YAK-005-03`
- Status: `READY`
- Task type: `TEST/REVIEW`
- Effort: `S (2 points)`
- Risk: `high-human-interface`
- OBSERVED: PR #43 exact head is now `30c089e75715d045b21329176ce3d2f4fd98863c`; your prior report inspected older `201d8b5b...` and is stale for merge purposes. Current workflows show President Portal and Architecture Guardrails success, AI Team OS failure, and Vercel failure from daily deployment limit.
- Single outcome: refresh exact-head CI, Preview, and visual-evidence readiness for PR #43 and return `PASS_TO_REVIEW | HOLD | FAIL`.
- Allowed scope: PR #43 metadata/comments/checks/artifacts; Vercel deployment metadata; exact-head desktop/mobile evidence only.
- Forbidden scope: no repository edits, merge, portal activation, API reconciliation, reusing stale screenshots as exact-head proof, or treating a quota failure as code success.
- Acceptance criteria:
  1. Confirm exact current head.
  2. List all exact-head workflow conclusions.
  3. Verify whether a READY Vercel deployment commit equals exact head.
  4. Verify exact-head desktop/mobile artifact availability and inspect it, or explicitly report stale/missing.
  5. State missing reviewer/Rashed/Hakam gates separately from CI/Preview.
- Stop conditions: head moves, checks pending, Preview mismatch/unavailable, artifact stale/missing, or evidence inaccessible.
- Expected artifact: concise exact-head evidence verdict; this is not reviewer PASS or Hakam MERGE_OK.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `HOLD`
- Summary / verdict: `HOLD` for PR #43 at exact head `30c089e75715d045b21329176ce3d2f4fd98863c`. Exact-head static and visual artifacts exist, but the required AI Team OS check is red and no READY Vercel deployment matches the exact head.
- Observed head / freshness: PR #43 remains open/draft at exact head `30c089e75715d045b21329176ce3d2f4fd98863c`; no head movement was observed during this review.
- Evidence reviewed: PR #43 metadata; exact-head workflow runs; President Portal artifact `president-portal-visuals` (artifact `8700399028`, run `30389672510`, head SHA matches exact PR head); current Vercel deployment list for branch `agent/president-portal-v3`.
- Exact-head checks: PASS — President Portal, Architecture Guardrails, Build 126, v112, v118, v125, and Developer D3. FAIL — Verify AI Team OS run `30389672752`; Developer D1 remains the known baseline failure and is not counted as proof of this PR. No required check was treated as green by inference.
- Preview / desktop-mobile evidence: artifact contains and was inspected at the required dimensions: `desktop-reviews.png` and `desktop-directives.png` at `1440x1000`; `mobile-reviews.png` and `mobile-directives.png` at `390x844`. The layouts render legibly and show the President review/directive flows. However, the newest READY Vercel deployment for PR #43 is commit `4a16a2c158fb0321d60473eab2816c001f104c7e`, not exact head `30c089e7...`; therefore exact-head Preview PASS is absent.
- Missing gates separate from CI/Preview: no independent reviewer PASS for PR #43, no Hakam `MERGE_OK`, and no Rashed personal `manager: PASS`. Visual artifact inspection does not substitute for these gates.
- Residual risks: screenshots are workflow artifacts, not proof that an exact-head deployed Preview is reachable; AI Team OS remains red; portal/channel must remain inactive.
- Recommended next task: correct the stale verifier without weakening invariants, rerun exact-head CI, obtain a READY Vercel deployment whose metadata SHA equals the current PR head, then repeat independent evidence review before Hakam/Rashed gates.
- Team note: الصور موجودة وواضحة، لكن المفتاح ما زال بعيدًا عن القفل الصحيح—ننتظر رأسًا مطابقًا وكل البوابات. 🔒
<!-- WORKER REPORT:END -->