# Sara

## Permanent instructions
Open `ops/ai-team/TEAM_OS.md`, then execute exactly the one task in the manager block below. You are a generalist; this task is temporary, not a permanent role.

This task is read-only. Do not create a code branch or edit project files. Update only the `WORKER REPORT` block in this file directly on `agent/yakolak-team-os`. Preserve the manager block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `000-bootstrap`
- Task ID: `YAK-000-07`
- Status: `READY`
- Objective: Build a release-gate coverage matrix showing which current tests prove each critical product and D4 requirement and which gaps remain.
- Why now: The manager needs independent evidence that green checks actually cover playability, online behavior, desktop/mobile UX, and D4 correctness.
- Base branch: `agent/developer-d2-workbench`
- Allowed files: read-only workflows, scripts, package.json, D4 audit/docs, product verification scripts, and current check results.
- Forbidden files / conflicts: no code or workflow edits; do not duplicate Sami's root-cause report.
- Acceptance criteria:
  1. Map every release gate in `BOARD.md` to existing tests/workflows.
  2. Mark coverage as strong, partial, absent, or currently blocked.
  3. Distinguish static syntax checks, deterministic functional checks, browser tests, visual evidence, and real online/manual tests.
  4. Identify the three highest-risk false-green gaps.
  5. Recommend the next smallest test task after CI is repaired.
- Required validation: cite exact workflow/script names and what they actually assert.
- Expected artifact: a compact coverage matrix in your report block.
- Context links: `ops/ai-team/BOARD.md`, PR #35, `.github/workflows/`, `scripts/`.
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
