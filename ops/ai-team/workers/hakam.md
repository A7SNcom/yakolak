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
- Result: `COMPLETE`
- Manager score / verdict: Rashed `88/100 PASS`. The cycle chose the two proven blockers, respected two-writer/three-point capacity, assigned independent review and Architecture Steward roles, and crossed no product or human gate. Freshness lost points because `manager.md` still describes the pre-authorization PR #43 state while `BOARD.md` now makes PR #47 the official protected President surface; the next manager cycle must reconcile that record rather than infer from stale prose.
- Worker scores: Noor `94/100 PASS` — exact two-file XS correction, 6/6 tests and green Architecture Guardrails close the mutable accepted-mode defect. Sami `93/100 PASS` — exact-head independent reproduction and scope review. Nada `96/100 PASS` — renewed exact-head `ARCH_OK` with deterministic single-owner and forbidden-dependency checks. Lina `84/100 CONDITIONAL` — bounded schema-v2 normalizer and positive/negative fixtures are directionally correct, but exact-head repository validation is still red. Omar `88/100 PASS` for diagnosis/review quality, but his artifact verdict remains `CONDITIONAL`, not merge approval. Sara is not scored this cycle: BOARD overrides her stale PR #43 task and PR #47 remains `READY_AFTER_DEPLOYMENT`, so no honest evidence-review task existed.
- PR #41 verdict: `MERGE_OK` at exact head `9da9afc4e2690feab03e66ad1a19bb8621cc5f7e`. External mutability is closed through a module-private Set and frozen `has(mode)` facade; focused tests pass 6/6; Architecture Guardrails run `30395085282` is green; Sami issued `PASS`; Nada issued `ARCH_OK`; scope remains three files/173 additions with the correction limited to the authorized two files. `legacy-debt delta: unchanged`; `migration-gate delta: Slice 1 becomes eligible for Rashed's integration decision`.
- PR #48 verifier verdict: `HOLD` at exact head `78a28d06645d0cbefde734055a27cfe57a31d36e`. The semantic normalizer does not special-case PR #43 and the fixtures prove canonical acceptance plus rejection for missing `validation`, but Omar correctly found the exact-head workflow still red because real stale Mazen/Sara task contracts remain. No Omar `PASS` and no green verifier exist; do not weaken the parser. Smallest correction: Rashed refreshes only those stale contracts, rebases/reruns PR #48, then Omar issues a fresh exact-head verdict.
- PR #43 verdict: `HOLD / CLOSED_HISTORY`. PR #43 is closed unmerged at head `29522ec964f3a80f794a04e65984d5e95585c8a3`; it is superseded by PR #47 and cannot be reactivated by stale automation instructions. PR #38 and PR #42 remain closed history.
- President Development OS / PR #47 verdict: `HOLD`. Exact candidate head `f3e5dd72d8d118584a6db2244aa7ce71acfd0ce7` has green President Portal, Architecture Guardrails, Build 126, v112, v118, v125 and D3 checks plus exact-head desktop/mobile artifact `8703302002`; however the READY stable-alias deployment metadata is still commit `674881388d0db62f74cbbfcbb61028596807f45b`, not the candidate head. Sara therefore must not issue `PASS_TO_REVIEW`; no matching deployment, Sara PASS, independent final review, Rashed personal `manager: PASS`, or Hakam release verdict exists. Protected operation may continue only at the already authorized stable alias; public unauthenticated write activation remains blocked.
- Prompt / process audit: Noor, Sami, Nada and Lina contracts are bounded and measurable. The scheduled Pod D premise naming PR #43 is stale against BOARD; BOARD correctly overrides it. Sara performed no write, avoiding a fabricated review. No architecture/debt tripwire, product implementation by Rashed, verifier weakening, merge, Production action, public write activation, or human-gate crossing was observed.
- Capability updates: Noor game-core/state `PROVEN` for XS correction; Sami exact-head state review returns to `PROVEN` for XS; Nada architecture/review remains `PROVEN`; Lina process-guard implementation remains `TRIAL/REDUCE` until green exact-head validation; Omar repository/CI review remains `PROVEN`; Sara evidence capability unchanged because no current artifact was eligible.
- Debt / migration: `legacy-debt delta: unchanged`; PR #41 advances the first canonical entry contract to manager-integration eligibility; verifier and President platform gates remain pending and are not migration progress.
- Team note: عقد الدخول جاهز لقرار راشد؛ أما الحارس والمنصة فالبوابات ما زالت حمراء بوضوح، فلا اختصار ولا ادعاء. 🛡️
<!-- WORKER REPORT:END -->