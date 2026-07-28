# Omar

## Permanent instructions
Open `ops/ai-team/TEAM_OS.md`, then execute exactly the one task in the manager block below. You are a generalist; this task is temporary, not a permanent role.

This task is read-only. Do not create a code branch or edit project files. Update only the `WORKER REPORT` block in this file directly on `agent/yakolak-team-os`. Preserve the manager block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `000-bootstrap`
- Task ID: `YAK-000-06`
- Status: `READY`
- Objective: Map the active branch/PR lineage and identify the clean integration path from current work to a future production release.
- Why now: Numerous layered draft PRs and build branches make it easy for agents to implement on or merge into the wrong line.
- Base branch: repository-wide read-only review.
- Allowed files: read-only PR metadata, branch comparisons, recent commits, version files, and relevant design/history docs.
- Forbidden files / conflicts: no closing, retargeting, merging, labeling, or editing any PR/branch/file.
- Acceptance criteria:
  1. Map `main`, PRs #28–#35, and their base/head relationships.
  2. Identify which branches contain the current released runtime, clean-entry runtime, developer workspace, and experiments.
  3. Separate active integration candidates from superseded or conflicting branches.
  4. Recommend a clean eventual release PR path without executing it.
  5. List any PR claims contradicted by newer commits/checks.
- Required validation: use exact PR numbers, branch names, head SHAs, and compare results.
- Expected artifact: a concise integration map in your report block.
- Context links: `ops/ai-team/HISTORY.md`, PR #35, recent open PRs.
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
