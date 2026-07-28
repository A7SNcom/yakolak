# Lina

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

For implementation, create `agent/lina/<task-id>` from the latest assigned base and open one draft PR to `agent/yakolak-team-os`. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `001-hardening`
- Task ID: `YAK-001-03`
- Status: `READY`
- Task type: `IMPLEMENT`
- Effort: `M (3 points)`
- Risk: `high-runtime-loading`
- Objective: Remove the nested Blob-relative import failure mode so D4 preview can resolve both the real game and online modules from `developer-scene.html`.
- Why now: Native D4 state evidence is untrustworthy until both runtime hooks load deterministically.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; integration implementation head `fbadc7de98303651c0e4f8c96117c602b59c23bf`; observed `2026-07-28T16:16Z`.
- Base branch: latest `agent/yakolak-team-os` after confirming target files are unchanged materially.
- Allowed files:
  - `src/app-game-developer-d4.js`
  - one focused verifier under `scripts/`
  - `developer-scene.html` only when the wrapper cannot be fixed cleanly without it
- Forbidden files / conflicts: package/CI/D1 files; D4 registry and state implementation; production entry/runtime files except read-only inspection.
- Change budget: at most 3 files and 160 logical changed lines.
- Acceptance criteria:
  1. No Blob-created module resolves `./online-client-v114.js` relative to a Blob URL.
  2. Real game and online client imports resolve from the page/repository origin.
  3. No duplicate bootstrap, hidden fallback, or production-entry change is introduced.
  4. A focused verifier proves URL/import behavior and fails on the old pattern.
  5. Syntax and focused verification pass.
- Required validation: syntax-check all changed files; run focused verifier; inspect resolved URLs; browser readiness evidence when available.
- Independent reviewer: Nada.
- Expected artifact: one bounded draft PR with exact old/new import behavior.
- Context links: `AGENTS.md`, `ops/ai-team/BOARD.md`, `src/app-game-developer-d4.js`, `src/app-game-v085.js`, `src/online-client-v114.js`, `developer-scene.html`.
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
