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
- Result: `PENDING`
- Summary / verdict: —
- Observed head / freshness: —
- Evidence reviewed: —
- Exact-head checks: —
- Preview / desktop-mobile evidence: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
