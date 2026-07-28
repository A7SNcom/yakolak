# Hakam

## Permanent instructions
You are Yakolak's independent cycle auditor. Read `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, the manager report, every worker task/report, and the exact GitHub evidence they cite.

You are permanently read-only. You must not implement code, open an implementation PR, merge, rewrite another worker report, or accept the manager's claims without evidence. Update only your `WORKER REPORT` block and stop after one audit task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `005-evidence-reconciliation`
- Task ID: `YAK-005-04`
- Status: `READY_AFTER_REPORTS`
- Task type: `AUDIT`
- Effort: `M (3 points)`
- Risk: `high-process-architecture`
- Single outcome: audit the refreshed cycle and issue exact verdicts for PR #41, PR #43, and Rashed's process recovery.
- Required evidence: current integration/PR heads and checks; Sami PASS; Nada exact-head Architecture Steward verdict; Omar verifier diagnosis; Sara exact-head PR #43 evidence; task/report freshness and scope.
- Acceptance criteria:
  1. Score Rashed and every evidenced worker; do not score `NO_TASK` as success.
  2. For PR #41, verify exact head, reviewer PASS, Nada verdict, focused tests, architecture guard, budget, debt/migration deltas, and issue `MERGE_OK | HOLD | REJECT`.
  3. For PR #43, keep HOLD unless AI Team OS is green, exact-head Preview/evidence exists, independent reviewer PASS exists, and no trust-boundary or human-gate defect remains.
  4. Verify no product implementation was performed by Rashed and no verifier was weakened.
  5. Keep PR #35/main/Production and other human gates protected.
- Forbidden scope: no implementation, merge, coordination edits, acceptance from manager assertion, or substitution of stale evidence.
- Stop conditions: any required worker report remains pending, head moved materially, or evidence is unavailable.
- Expected artifact: scores, capability updates, tripwires, required correction, and per-PR verdicts.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `COMPLETE`
- Manager score / verdict: Rashed `92/100 PASS`. Freshness `13/15` (manager snapshot became stale through report-only integration commits but PR heads remained exact); bottleneck/migration judgment `19/20`; capability/effort fit `15/15`; locks/reviewer independence `15/15`; prompt precision `9/10`; review/merge judgment `10/10`; verified progress `7/10` (gates clarified, no migration merge); communication `4/5`. No merge is authorized by this score alone.
- Worker scores: Noor `82/100 CONDITIONAL` — implementation is bounded/tested but externally mutable `VALID_MODES` breaks the intended immutable legality contract. Sami `80/100 CONDITIONAL` — reproduced tests and identified the Set risk, but issued PASS despite the exact architectural consequence later confirmed by the steward. Nada `96/100 PASS` — exact-head architecture review found the decisive contract flaw with a minimal correction. Omar `94/100 PASS` — exact run/job/assertion diagnosis classified `STALE_VERIFIER` without proposing a bypass. Sara `93/100 PASS` — exact-head checks, artifact dimensions/inspection, Vercel SHA mismatch, and missing gates were separated honestly; verdict correctly remained HOLD. NO_TASK employees are not scored.
- Merge verdicts: PR #41 `HOLD` — task/prompt fresh and bounded; diff 3 files/151 additions; focused tests 5/5 and Architecture Guardrails green; Sami report exists, but Nada issued `ARCH_HOLD` because exported `Object.freeze(new Set(...))` remains mutable through `.add/.delete/.clear`. No `ARCH_OK`, so no `MERGE_OK`. PR #43 `HOLD` — exact head `30c089e75715d045b21329176ce3d2f4fd98863c`; President Portal, Architecture Guardrails, Build 126, v112, v118, v125, and D3 pass; AI Team OS run `30389672752` fails; newest READY Vercel deployment for PR #43 is SHA `4a16a2c1...`, not exact head; exact-head 1440x1000 and 390x844 artifacts exist and were inspected, but no matching deployed Preview, independent reviewer PASS, Rashed personal PASS, or prior Hakam MERGE_OK exists. PR #35/main/Production remain human-gated. PR #38/#42 are closed history.
- Tripwires or conflicts: no product implementation by Rashed; no verifier weakening, skip, fake Preview, stale screenshot substitution, merge, portal activation, or human-gate crossing observed. Process conflict found: current task contracts use canonical semantic labels while `verify-ai-team-os.mjs` hard-codes obsolete literal labels; this is a verifier-maintenance defect, not permission to relax invariants.
- Capability ledger changes: Nada architecture/review `PROVEN` for S exact-head stewardship; Omar repository/CI diagnosis `PROVEN` for S; Sara testing/evidence `PROVEN` for S exact-head visual/deployment evidence; Noor game-core/state remains `REDUCE` until an XS immutable-contract correction passes renewed review; Sami architecture review `REDUCE` for the next high-risk state contract because a known mutability risk was accepted too early.
- Evidence inspected: BOARD cycle 005; manager report; PR #41 and #43 exact metadata/heads; Noor/Sami/Nada/Omar/Sara reports; PR #43 workflow runs; artifact `8700399028` with desktop `1440x1000` and mobile `390x844` images; current Vercel deployments and commit metadata; evaluation/prompt/architecture gates.
- Debt / migration: legacy-debt delta `unchanged`; migration-gate delta `none` because PR #41 is not merge-ready; leadership-system delta remains isolated/inactive because PR #43 is HOLD.
- Required correction: (1) Noor receives one XS correction that makes accepted modes externally immutable and adds a mutation-resistance test; then Sami or another independent reviewer plus Nada re-review exact new head. (2) Team OS maintainer updates the verifier with a versioned semantic-field normalizer and positive/negative fixtures without weakening required invariants. (3) PR #43 reruns all checks and obtains a READY Vercel deployment whose metadata SHA equals its exact head; Sara repeats evidence review, an independent reviewer issues PASS, then Rashed personally inspects before a future Hakam verdict.
- Team note: لا دمج اليوم؛ عرفنا البابين المفتوحين بالضبط، وإغلاقهما أصغر وأأمن من استعجال الأساس أو واجهة الرئيس. 🛡️
<!-- WORKER REPORT:END -->