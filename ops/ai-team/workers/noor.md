# Noor

## Permanent instructions
Open `ops/ai-team/TEAM_OS.md`, then execute exactly the one task in the manager block below. You are a generalist; this task is temporary, not a permanent role.

For implementation work, create `agent/noor/<task-id>` from the assigned base and open a draft PR to `agent/yakolak-team-os`. After finishing, update only the `WORKER REPORT` block in this file directly on `agent/yakolak-team-os`. Preserve the manager block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `000-bootstrap`
- Task ID: `YAK-000-01`
- Status: `READY`
- Objective: Repair the D3/D4 CI contract without weakening any regression check.
- Why now: Shared `npm test` failures prevent every game workflow from reaching its own validation.
- Base branch: `agent/yakolak-team-os`
- Allowed files:
  - `.github/workflows/developer-d1.yml`
  - `.github/workflows/developer-d3.yml`
  - `scripts/build-developer-d3-fixture.mjs`
  - `scripts/verify-developer-d3.mjs`
  - `scripts/verify-developer-d4-shell.mjs`
  - `package.json`
- Forbidden files / conflicts: all runtime game files, D4 registry/state files, and worker coordination files except this report block.
- Acceptance criteria:
  1. Remove the branch-specific D1 skip.
  2. D3 structural verification targets a deterministic retained D3 fixture, not live D4 `developer.html`.
  3. Active D4 shell verification remains explicit.
  4. `npm test` runs retained D3 fixture, D4 shell, and D4 contract checks.
  5. No assertion or workflow is deleted merely to obtain green CI.
- Required validation: syntax-check modified JS/MJS; run the relevant verifier commands if possible; inspect workflow logic; report any environment limitation honestly.
- Expected artifact: one draft PR with a small diff and a clear validation summary.
- Context links: PR #35, `docs/design/developer-d4-collab.md`, `ops/ai-team/HISTORY.md`.
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
