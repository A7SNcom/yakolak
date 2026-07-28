# Lina

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

For implementation, create `agent/lina/<task-id>` from the latest assigned base and open one draft PR to `agent/yakolak-team-os`. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `002-evidence-first`
- Task ID: `YAK-002-03`
- Status: `READY`
- Task type: `IMPLEMENT`
- Effort: `S (2 points)`
- Risk: `high-runtime-loading`
- Objective: Remove only the Blob-relative resolution of `./online-client-v114.js` from the D4 wrapper and prove the resolved URL is origin-based.
- Why now: D4 preview evidence is untrustworthy until the real game and online hooks load deterministically; cycle 001 produced no artifact, so scope is reduced.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; integration snapshot `b5279840c52722d60c69069e7f05e05dd458cda0`; observed `2026-07-28T17:01Z`.
- Base branch: latest `agent/yakolak-team-os` after verifying target files and locks.
- Allowed files: `src/app-game-developer-d4.js` and one focused verifier under `scripts/`.
- Forbidden files / conflicts: `developer-scene.html`, production entry/runtime, D1, registry/state, online lifecycle redesign, dependencies.
- Change budget: at most 2 files / 80 logical changed lines.
- Acceptance criteria:
  1. Reproduce or statically prove the old Blob-relative failure mode.
  2. Resolve the online-client URL from repository/page origin before Blob execution.
  3. Keep one bootstrap path with no hidden fallback.
  4. Focused verifier fails on the old pattern and passes on the new pattern.
  5. Syntax checks pass.
- Required validation: syntax checks, focused verifier, exact old/new resolved URL evidence; browser readiness only if available without relying on rate-limited Vercel.
- Independent reviewer: Nada.
- Expected artifact: bounded draft PR or exact `BLOCKED`; absence is `NO_ARTIFACT`.
- Context links: `AGENTS.md`, `ops/ai-team/BOARD.md`, `src/app-game-developer-d4.js`, `src/online-client-v114.js`, historical PR #26 pattern.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary: —
- Observed head / freshness: —
- Commit / PR / evidence: —
- Files inspected or changed: —
- Budget used: —
- Validation: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->