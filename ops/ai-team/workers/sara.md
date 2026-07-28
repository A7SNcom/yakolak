# Sara

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block when the task becomes executable. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `006-correction-closure`
- Task ID: `YAK-006-07`
- Status: `READY_AFTER_DEPLOYMENT`
- Task type: `TEST/REVIEW`
- Effort: `S (2 points)`
- Risk: `high-human-interface`
- OBSERVED: President Development OS PR #47 exact candidate head is `f3e5dd72d8d118584a6db2244aa7ce71acfd0ce7`. Exact-head President Portal and architecture-related checks passed and artifact `8703302002` exists, but the stable-alias READY Vercel deployment still reports commit `674881388d0db62f74cbbfcbb61028596807f45b`; the protected API signal check currently redirects to Vercel SSO and cannot be read non-interactively.
- Single outcome: when a READY deployment metadata SHA equals the exact PR #47 head, verify the protected stable alias, API availability, desktop `1440x1000`, mobile `390x844`, and all exact-head gates; return `PASS_TO_REVIEW | HOLD | FAIL`.
- Why now: PR #47 cannot receive Rashed personal PASS or Hakam release verdict without an exact-head deployed artifact and independent evidence review.
- Base branch: `agent/president-development-os` / PR #47.
- Allowed scope: PR #47 metadata/checks/artifacts; Vercel deployment metadata for branch `agent/president-development-os`; protected stable alias; exact-head desktop/mobile evidence; API read availability.
- Forbidden scope: no implementation, repository edit, merge, public Production activation, authentication change, stale screenshot substitution, per-deployment URL adoption, or inference that SSO/API inaccessibility means no President input.
- Change budget: read-only.
- Acceptance criteria:
  1. Confirm exact PR #47 head and all required check conclusions.
  2. Confirm READY Vercel metadata SHA equals that exact head.
  3. Inspect true desktop `1440x1000` and mobile `390x844` artifacts from the same head.
  4. Verify the canonical protected stable alias serves the candidate and report API access status separately.
  5. Separate CI/Preview evidence from missing reviewer, Hakam, and Rashed gates.
- Required validation: exact identifiers for PR head, workflow run/artifact, deployment ID/SHA, alias, viewport evidence, and API response.
- Independent reviewer: Hakam audits after Sara's report; Sara does not grant manager approval.
- Stop conditions: no matching deployment, head movement, stale/missing artifacts, inaccessible evidence, or trust-boundary ambiguity. On stop, return `HOLD` without fabrication.
- Expected artifact: concise exact-head evidence verdict for Rashed and Hakam.
- Context links: `ops/ai-team/BOARD.md`, `ops/ai-team/PRESIDENT_PORTAL.md`, PR #47.
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