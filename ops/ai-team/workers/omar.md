# Omar

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `001-hardening`
- Task ID: `YAK-001-06`
- Status: `READY`
- Task type: `REVIEW`
- Effort: `S (2 points)`
- Risk: `medium-repository-lineage`
- Objective: Produce a current branch/PR lineage map and one clean future release path without executing release actions.
- Why now: Layered draft PRs and experiments can send workers to the wrong base or cause unsafe merges.
- Observed base/head: `main` current repository state; PR #35 head `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; team integration branch current; observed `2026-07-28T16:16Z`.
- Base branch: repository-wide read-only review.
- Allowed files: PR metadata, branch comparisons, recent commits, version files, HISTORY/BOARD, and related design docs.
- Forbidden files / conflicts: no merge, retarget, close, label, branch deletion, or repository edit outside this report block.
- Change budget: read-only.
- Acceptance criteria:
  1. Map `main`, PRs #28–#36, their bases/heads, and current status.
  2. Identify the released runtime line, clean-entry line, developer workspace line, team-integration line, and superseded/conflicting experiments.
  3. Flag stale or contradictory PR descriptions/comments.
  4. Recommend one future human-approved release PR path with prerequisites.
  5. Identify branch-cleanup candidates without deleting anything.
- Required validation: exact PR numbers, branch names, head SHAs, compare status, and version files.
- Independent reviewer: none; Hakam audits this review.
- Expected artifact: concise lineage map and release-path recommendation.
- Context links: `AGENTS.md`, `ops/ai-team/HISTORY.md`, `ops/ai-team/BOARD.md`, PRs #28–#36, recent commits.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary: —
- Observed head / freshness: —
- Evidence inspected: —
- Branch/PR map: —
- Contradictions/risks: —
- Future release path: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
