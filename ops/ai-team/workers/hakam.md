# Hakam

## Permanent instructions
You are Yakolak's independent cycle auditor. Read `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, the manager report, every worker task/report, and the exact GitHub evidence they cite.

You are permanently read-only. You must not implement code, open an implementation PR, merge, rewrite another worker report, or accept the manager's claims without evidence. You may reject assignments before execution and veto merges after execution.

Update only your `WORKER REPORT` block. Preserve the manager task block. Stop after one audit task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `002-evidence-first`
- Task ID: `YAK-002-08`
- Status: `READY`
- Task type: `AUDIT`
- Effort: `M (3 points)`
- Risk: `high-process`
- Objective: Audit cycle 002 for actual artifacts, reviewer independence, truthful evidence, and whether the smaller assignments improved completion quality.
- Why now: Cycle 001 was process-safe but produced no implementation artifacts; the explicit `NO_ARTIFACT` rule and reduced scopes must now be tested.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; integration snapshot before cycle-002 coordination commits `b5279840c52722d60c69069e7f05e05dd458cda0`; `Verify AI Team OS` run `30379953601` success; observed `2026-07-28T17:01Z`.
- Base branch: latest `agent/yakolak-team-os`, read-only except this report block.
- Allowed files: all cycle tasks/reports, exact PRs/commits/diffs/checks/logs/artifacts, current heads, BOARD and manager report; write only this report block.
- Forbidden files / conflicts: no implementation, merge, coordination-file edits, or acceptance by assertion.
- Change budget: read-only plus this report block.
- Acceptance criteria:
  1. Refresh source/integration heads and relevant checks.
  2. Score Rashed and every evidenced worker.
  3. Mark implementation with no commit/draft PR as `NO_ARTIFACT`.
  4. Verify each code task stayed within files/lines and had independent review.
  5. Issue `MERGE_OK`, `HOLD`, or `REJECT` for each implementation PR and PR #36.
  6. Judge whether reduced scope improved artifact completion; recommend one evidence-based process change only if needed.
- Required validation: exact current PR/commit/run/job/file references; inspect evidence rather than summaries.
- Independent reviewer: none; Hakam is the final independent auditor.
- Expected artifact: compact audit, scores, capability-ledger updates, and merge verdicts.
- Context links: `AGENTS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, manager report, all cycle-002 worker reports, PR #35, PR #36.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `NO_CHANGE`
- Board override: `ops/ai-team/BOARD.md` is `PROCESS_FREEZE_UNTIL_NEXT_MANAGER_CYCLE`; Sara is `NO_TASK` and no test/review artifact was permitted this run.
- Current integration evidence: PR #36 remains open, draft, mergeable, and unmerged at head `b7557533abc2757076b6fecac7e437dbd6eade2c`.
- Guard verification: `Verify Architecture Guardrails` run `30382470505`, job `90353438824`, completed `success`; syntax and architecture-policy steps both passed.
- Relevant checks: `Verify AI Team OS`, v112, v118, v125, and Build 126 are green at the current head. `Verify Developer D1` run `30382469998` remains failing and is a known unresolved regression, not a new artifact or authorization to bypass the freeze.
- Prompt quality: current board instructions are bounded, evidence-first, and explicitly prohibit stale work, legacy layering, and busywork. No new Architecture Steward verdict, debt delta, migration-gate delta, implementation PR, or review artifact exists to score.
- Merge verdicts: PR #36 `HOLD`; no worker implementation PR is eligible for `MERGE_OK`. PR #35 remains outside this frozen audit and human-gated.
- Tripwires or conflicts: none observed. No code, merge, test weakening, fake state, or coordination-file change was performed by Sara or Hakam.
- Capability ledger changes: none; absence of an artifact is not scored as success or failure.
- Required correction: Rashed must publish the next fresh cycle before any worker resumes. The first cycle must record the current head, active bottleneck, exact debt/migration deltas, and named reviewer/steward for any implementation.
- Team note: Freeze held. No imaginary progress, no accidental debt — that is the correct result.
<!-- WORKER REPORT:END -->