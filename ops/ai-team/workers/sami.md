# Sami

## Permanent instructions
Open `ops/ai-team/TEAM_OS.md`, then execute exactly the one task in the manager block below. You are a generalist; this task is temporary, not a permanent role.

This task is read-only. Do not create a code branch or edit project files. Update only the `WORKER REPORT` block in this file directly on `agent/yakolak-team-os`. Preserve the manager block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `000-bootstrap`
- Task ID: `YAK-000-02`
- Status: `READY`
- Objective: Produce an evidence-backed map of every current PR #35 check failure and its earliest root cause.
- Why now: Noor needs an independent reviewer to prevent a superficially green but weakened CI patch.
- Base branch: `agent/developer-d2-workbench`
- Allowed files: read-only inspection of workflows, scripts, package.json, PR #35, workflow runs/jobs/logs, and commit history.
- Forbidden files / conflicts: no repository writes except your report block; do not propose deleting or skipping tests.
- Acceptance criteria:
  1. List every current PR #35 workflow and conclusion.
  2. Identify the first failing step and root cause for each failure chain.
  3. Distinguish shared-root failures from independent product failures.
  4. State the minimum acceptance checks for Noor's patch.
  5. Flag any stale or contradictory PR comment.
- Required validation: cite exact run IDs, job IDs, step names, commits, and file paths where available.
- Expected artifact: a compact failure map in your report block.
- Context links: PR #35 checks/comments, `docs/design/developer-d4-collab.md`, `ops/ai-team/HISTORY.md`.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary: —
- Commit / PR / evidence: —
- Files inspected or changed: —
- Validation: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
