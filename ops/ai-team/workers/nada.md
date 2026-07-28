# Nada

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `004-canonical-entry-contract`
- Task ID: `YAK-004-03`
- Status: `READY`
- Task type: `ARCHITECTURE_STEWARD`
- Effort: `S (2 points)`
- Risk: `high-architecture-state`
- Blueprint Node ID: `track-canonical-architecture`
- Blueprint Revision: `2`
- Objective: Issue `ARCH_OK`, `ARCH_HOLD`, or `ARCH_REJECT` on Noor's first canonical entry-state slice.
- Why now: Runtime-boundary and state-ownership work requires an independent Architecture Steward before Hakam can permit integration.
- Observed base/head: inspect only Noor's exact artifact for `YAK-004-01`, based on `agent/yakolak-team-os` at or after `5d3871544031a84c553b27768ef00ef2a382b55d`, and canonical blueprint `track-canonical-architecture@2`; if absent, report `NO_ARTIFACT`.
- Base branch: repository-wide read-only inspection of the current integration head and exact Noor artifact.
- Allowed files: architecture documents, debt register, blueprint node, Noor task/diff/tests, architecture guard and focused-test evidence.
- Forbidden files / conflicts: no implementation, alternative rewrite, merge, task reassignment, other worker report edits, or approval from summaries.
- Change budget: read-only inspection plus Nada's report block.
- Acceptance criteria:
  1. Verify canonical dependency direction and one state owner.
  2. Verify named actions and deterministic transitions match the blueprint node.
  3. Verify no DOM, Three.js, network, storage, timer, global, Blob, source patch, or feature-file mixing.
  4. Verify architecture guard passes and debt/migration/blueprint deltas are honest.
  5. Issue an exact `ARCH_OK`, `ARCH_HOLD`, or `ARCH_REJECT` verdict with file/symbol evidence.
- Required validation: exact PR/commit/diff references; current blueprint node/revision; focused test evidence; `npm run test:architecture` or exact workflow evidence.
- Independent reviewer: `none; Nada is the independent Architecture Steward and Hakam audits the verdict`.
- Stop conditions: no artifact, stale base, unread President blueprint edit, blueprint revision mismatch, missing focused tests, unclear ownership, or inaccessible evidence.
- Expected artifact: concise steward verdict with exact evidence and required correction when not `ARCH_OK`.
- Context links: `AGENTS.md`, `ops/ai-team/development-blueprint.json`, Noor task/report and exact PR, architecture documents, debt register, and `ops/ai-team/BOARD.md`.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary / verdict: —
- Observed head / freshness: —
- Blueprint node / revision: —
- Commit / PR / evidence reviewed: —
- Files and symbols inspected: —
- Validation: —
- Blueprint / debt / migration deltas: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
