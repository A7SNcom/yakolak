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
- OBSERVED: the original PR #38 was closed after its head branch was reset without merging the portal files. The replacement President Portal PR must be inspected from its own exact current head; older READY Vercel deployments are not sufficient.
- Single outcome: determine whether the replacement President Portal PR has exact-head CI and exact-head Preview evidence sufficient to leave HOLD or advance to independent review.
- Allowed scope: replacement PR metadata/diff/comments/checks/artifacts; Vercel deployment metadata and true desktop/mobile evidence.
- Forbidden scope: no repository edits, merge, portal activation, API reconciliation, or claims based on stale Preview.
- Acceptance criteria: confirm exact current head; list all exact-head check conclusions; verify Preview commit equals head; inspect desktop screenshot dimensions `1440x1000` and mobile dimensions `390x844`; verify the old direct task channel is hidden; state `PASS_TO_REVIEW | HOLD | FAIL` with exact evidence.
- Stop conditions: checks still running, Preview mismatch/unavailable, artifact unavailable, head moves, or the mobile artifact is not truly mobile-sized.
- Expected artifact: concise evidence verdict. This is not reviewer PASS or Hakam MERGE_OK.
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
