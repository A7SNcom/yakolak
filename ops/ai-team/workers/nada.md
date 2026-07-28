# Nada

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `001-hardening`
- Task ID: `YAK-001-05`
- Status: `READY`
- Task type: `REVIEW/RESEARCH`
- Effort: `S (2 points)`
- Risk: `high-runtime-loading`
- Objective: Review Lina's import fix and define the smallest subsequent deterministic seam for the native online dialog lifecycle.
- Why now: The wrapper must load safely before online states can be implemented, and the implementer needs independent review.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; observed `2026-07-28T16:16Z`.
- Base branch: read-only latest source/integration and Lina PR if available.
- Allowed files: Lina PR/diff/checks; D4 wrapper; online client; room APIs; D4 state/registry files; relevant HTML, audit, and tests.
- Forbidden files / conflicts: no repository writes except this report block; no online implementation this cycle; no player/turn implementation review.
- Change budget: read-only.
- Acceptance criteria:
  1. Verify Lina removes Blob-relative resolution without duplicate bootstrap or production side effects.
  2. Issue `PASS`, `CONDITIONAL`, or `FAIL` with exact evidence.
  3. Enumerate native online lifecycle states and exact controlling DOM/state/function symbols.
  4. Propose one smallest deterministic fixture/adapter seam for the next cycle.
  5. State desktop/mobile and readiness evidence needed before merge/next implementation.
- Required validation: cite exact paths/symbols, Lina commit/PR/checks, and compare the seam against D4 audit gaps.
- Independent reviewer: none; Hakam audits this review.
- Expected artifact: import-review verdict plus concise implementation-ready online seam matrix.
- Context links: `AGENTS.md`, `ops/ai-team/BOARD.md`, Lina task/PR, `src/online-client-v114.js`, room APIs, D4 state/registry/audit.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary / verdict: —
- Observed head / freshness: —
- Commit / PR / evidence reviewed: —
- Files and symbols inspected: —
- Online seam matrix: —
- Validation: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->
