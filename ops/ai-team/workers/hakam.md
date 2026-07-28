# Hakam

## Permanent instructions
You are Yakolak's independent cycle auditor. Read `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, the manager report, every worker task/report, and the exact GitHub evidence they cite.

You are permanently read-only. You must not implement code, open an implementation PR, merge, rewrite another worker report, or accept the manager's claims without evidence. You may reject assignments before execution and veto merges after execution.

Update only your `WORKER REPORT` block. Preserve the manager task block. Stop after one audit task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `001-hardening`
- Task ID: `YAK-001-08`
- Status: `READY`
- Task type: `AUDIT`
- Effort: `M (3 points)`
- Risk: `high-process`
- Objective: Independently score cycle 001, detect stale/oversized/overlapping work, and issue merge verdicts for every implementation PR.
- Why now: The previous system had duplicate managers, stale tasks, no effort control, no independent veto, and an impossible schedule.
- Observed base/head: source `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`; cycle integration snapshot recorded in `BOARD.md`; observed `2026-07-28T16:16Z`, to be refreshed before audit.
- Base branch: latest `agent/yakolak-team-os`, read-only except this report block.
- Allowed files: read-only repository, PR, commit, workflow, task/report, and evidence inspection; write only this report block.
- Forbidden files / conflicts: all implementation and coordination files outside this report block; no merge or code change.
- Change budget: read-only inspection plus this report block only; no implementation lines or PR.
- Acceptance criteria:
  1. Score Rashed using `EVALUATION.md`.
  2. Score every worker with completed evidence; mark missing work unverified, not failed by invention.
  3. Check task freshness against the observed head SHA and current CI.
  4. Check file locks, effort/change budgets, reviewer independence, and tripwires.
  5. Issue `MERGE_OK`, `HOLD`, or `REJECT` for each implementation PR.
  6. Record a capability-ledger update and one process correction if evidence supports it.
- Required validation: exact PR/commit/run/job/file references; compare claims to current GitHub state.
- Independent reviewer: none; Hakam is the final independent auditor and cannot be replaced by or review himself.
- Expected artifact: a compact independent audit in this report block.
- Context links: `AGENTS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, PR #35, PR #36, all cycle-001 worker reports.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `DONE`
- Manager score / verdict: `91/100 PASS`. Freshness 18/20; task fit 19/20; non-overlap/locks 15/15; bottleneck judgment 14/15; review/merge judgment 15/15; measurable product progress 5/10 because no implementation artifact exists yet; communication 5/5. No manager merge is permitted yet because the cycle lacks implementation PRs and reviewer evidence.
- Worker scores: `Sara 90/100 PASS`—she correctly refused to invent a Mazen verdict, inspected exact current baseline symbols, and produced a risk-appropriate evidence matrix. `Noor, Sami, Lina, Mazen, Nada, Omar: UNVERIFIED/PENDING`; their reports contain no completed evidence, so no score is assigned. Hakam is not self-scored.
- Merge verdicts: `Noor YAK-001-01: HOLD—no PR/commit/check artifact`; `Lina YAK-001-03: HOLD—no PR/commit/check artifact`; `Mazen YAK-001-04: HOLD—no PR/commit/check artifact`; `PR #36: HOLD—process design is coherent and mergeable, but one completed worker review is insufficient to prove the hourly operating loop`; `PR #35: HOLD—human-gated draft with unresolved D4 P0/release gates, not a worker integration candidate`. No `MERGE_OK` is issued this cycle.
- Tripwires or conflicts: `None observed in completed evidence.` Locks are disjoint: D1/CI→Noor, wrapper/import→Lina, player/turn→Mazen; reviewers are separate; Hakam remained read-only. Source head `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2` still matches PR #35. Integration head advanced only through coordination/report commits to `128aa83fb6e62974729546223f0fa6abe32aa211`, which does not invalidate implementation-file premises. Sara found no Mazen branch/PR and did not fabricate one.
- Capability ledger changes: `Sara/testing-evidence: TRIAL → PROVEN-1` (one PASS; a second recent PASS is still required for formal PROVEN). `Rashed/architecture-review: TRIAL with one PASS manager cycle`. All other worker/domain entries remain `TRIAL` because no completed artifacts exist.
- Evidence inspected: `EVALUATION.md`, `PODS.md`, `BOARD.md`, manager report, all cycle task/report files; PR #35 head `d8d2a50...`; PR #36 head `128aa83...`; current D4 baseline `src/developer-d4-registry.js` still has only two/four-player variants and `gameState.currentIndex`; `src/developer-scene-d4-states.js` still maps count 3 to four players and writes `currentIndex`; `scripts/verify-developer-d4-contract.mjs` verifies contract round-trips but not rendered state; CI snapshot includes D1 failure run `30377398315` / job `90336466217` while v112, v118, v125, Build 126, D3 and D4 audit were green at the recorded source head.
- Required correction: Next cycle must reconcile each pod report and open worker PR against the current integration head before any reassignment or merge. Add an explicit rule: an implementation task with no PR by audit time becomes `NO_ARTIFACT`; its reviewer performs baseline-only analysis; the manager retries at the same/smaller effort or replaces it—never treats it as partial completion.
- Team note: The guardrails worked: “nothing to review” stayed nothing to merge. Boring is beautiful when the alternative is imaginary green CI 😄
<!-- WORKER REPORT:END -->