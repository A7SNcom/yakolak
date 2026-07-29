# Hakam

## Permanent instructions
You are Yakolak's independent cycle auditor. Read `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, the manager report, every worker task/report, and the exact GitHub evidence they cite.

You are permanently read-only. You must not implement code, open an implementation PR, merge, rewrite another worker report, or accept the manager's claims without evidence. Update only your `WORKER REPORT` block and stop after one audit task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `006-correction-closure`
- Task ID: `YAK-006-06`
- Status: `READY_AFTER_REPORTS`
- Task type: `AUDIT`
- Effort: `M (3 points)`
- Risk: `high-process-architecture`
- Single outcome: audit the two bounded corrections and issue exact verdicts for PR #41, Lina's verifier PR, PR #43, and Rashed's cycle-006 management.
- Required evidence: current integration/PR heads and checks; Noor correction; Sami renewed review; Nada renewed architecture verdict; Lina verifier diff/fixtures; Omar renewed review; current PR #43 CI/Preview state.
- Acceptance criteria:
  1. Score Rashed and every evidenced worker; do not reward `NO_TASK` or mere commits.
  2. PR #41 receives `MERGE_OK` only if external mutability is closed, focused tests/guard pass, Sami PASS, and Nada ARCH_OK.
  3. Verifier PR receives `MERGE_OK` only if semantic normalization accepts canonical labels, negative fixture proves missing invariants still fail, and Omar PASS exists.
  4. PR #43 remains HOLD unless exact-head required CI, matching READY Preview, independent reviewer PASS, Sara evidence, and Rashed personal PASS all exist.
  5. Verify Rashed implemented no product code and crossed no human gate.
- Forbidden scope: no implementation, merge, coordination edits, stale evidence substitution, or acceptance by manager assertion.
- Stop conditions: required artifact/report missing, materially moved head, or evidence unavailable.
- Expected artifact: scores, capability updates, tripwires, per-PR `MERGE_OK | HOLD | REJECT`, and one smallest next correction if needed.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `NO_CHANGE`
- Freshness: reviewed `BOARD.md` first on `agent/yakolak-team-os`; board snapshot head is `8bb77c28619b23c7c0a580ff8f6bbb0a52d8f4ee`, while PR #49 now points to newer team head `1e9b80629de564377324b077bc81b56a1661d833`. This head movement has not produced the required conflict-resolution artifact or renewed reports.
- Sara status: `NO_TASK`. Her current contract is `READY_AFTER_DEPLOYMENT`; PR #47 remains at exact head `f3e5dd72d8d118584a6db2244aa7ce71acfd0ce7`, and no matching READY Vercel deployment evidence was produced. She correctly did not inspect or substitute stale screenshots and did not issue `PASS_TO_REVIEW`.
- PR #47 verdict: `HOLD`. GitHub still reports it open, draft and non-mergeable. PR #49 is also open, draft and non-mergeable with five coordination files; no independent exact-diff review, synchronized PR #47 head, matching READY Vercel SHA, Sara PASS, Hakam release audit or Rashed `manager: PASS` exists.
- Existing verdicts unchanged: PR #41 remains previously audited `MERGE_OK` only for its audited head, but manager integration still requires refreshed mergeability/review gates; PR #48 remains `HOLD`; PR #43 remains `HOLD / CLOSED_HISTORY` and cannot be reactivated.
- Gate delta: none. `legacy-debt delta: unchanged`; `migration-gate delta: unchanged`; President channel remains protected and public unauthenticated writes remain blocked.
- Next action: Mazen resolves PR #49 coordination conflicts without product changes; an independent reviewer verifies the exact diff; Rashed synchronizes PR #47, then obtains matching READY Vercel metadata before Sara and Hakam re-enter.
<!-- WORKER REPORT:END -->