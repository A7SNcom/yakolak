# Hakam

## Permanent instructions
You are Yakolak's independent cycle auditor. Read `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, `ops/ai-team/EVALUATION.md`, `ops/ai-team/BOARD.md`, the manager report, every worker task/report, and the exact GitHub evidence they cite.

You are permanently read-only. You must not implement code, open an implementation PR, merge, rewrite another worker report, or accept the manager's claims without evidence. Update only your `WORKER REPORT` block and stop after one audit task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `004-canonical-entry-contract`
- Task ID: `YAK-004-05`
- Status: `READY`
- Task type: `AUDIT`
- Effort: `M (3 points)`
- Risk: `high-process-architecture`
- Single outcome: audit cycle 004 and issue independent merge/HOLD verdicts for Noor's PR, PR #36, and PR #38.
- Required evidence: current heads/checks; all task/report blocks; Noor diff/tests; Sami verdict; Nada architecture verdict; Sara exact-head portal evidence; relevant Vercel metadata.
- Acceptance criteria:
  1. Score Rashed and every evidenced worker; `NO_TASK/NO_ARTIFACT` are not invented success.
  2. Verify Noor scope, budget, deterministic tests, architecture guard, reviewer independence, and debt/migration deltas.
  3. Issue Noor `MERGE_OK | HOLD | REJECT` only after Sami and Nada evidence.
  4. Keep PR #38 `HOLD` unless exact-head Preview, desktop/mobile evidence, independent review, and all gates exist; the channel remains inactive before merge.
  5. Keep PR #35/main/Production human-gated.
- Forbidden scope: no implementation, merge, coordination edits, or acceptance by manager assertion.
- Expected artifact: compact audit, scores, capability-ledger changes, tripwires, and exact verdicts.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `HOLD`
- Manager score / verdict: Rashed `82/100 CONDITIONAL`. Bottleneck choice, one-writer capacity, reviewer independence, and architecture gating were sound; however `BOARD.md`, manager report, and the embedded Sara/Hakam contracts remained stale on PR #38 while active evidence moved to PR #43. A manager cycle below 85 cannot merge.
- Worker scores: Noor `90 PASS` for a bounded 3-file/151-line deterministic artifact with exact debt/migration accounting; Sami `92 PASS` for independent exact-head review and reproduced tests; Nada `NO_ARTIFACT/PENDING` because no `ARCH_OK|HOLD|REJECT` report exists; Sara `92 PASS` for independently inspecting exact-head PR #43 checks, four correctly sized visual artifacts, and Vercel commit metadata, then refusing `PASS_TO_REVIEW` while a required check/gates remain absent. Lina, Mazen, Omar are `NO_TASK` and not scored.
- Merge verdicts: PR #41 `HOLD` — exact head `d5f2781d...`, Architecture Guardrails green, focused tests 5/5, Sami PASS, scope and deltas honest; blocked by missing Nada Architecture Steward verdict, current manager freshness/score gate, and final integration recheck. PR #43 `HOLD` — exact head `201d8b5b...`, President Portal/Architecture/Build126/v112/v118/v125/D3 green, true 1440×1000 and 390×844 artifacts inspected, Vercel READY metadata matches exact SHA; blocked by failing AI Team OS validation, absent independent reviewer PASS, absent Rashed personal PASS, and no prior Hakam MERGE_OK. PR #38 and PR #42 are closed history and carry no current verdict.
- Tripwires or conflicts: no implementation tripwire found in PR #41. Process conflict found: durable coordination names stale PR #38 after replacement by PR #43; this can cause agents to inspect or report against closed history. No channel activation, merge, main write, Production deployment, rule change, or test weakening observed.
- Capability ledger changes: Noor `TRIAL→PROVEN` for bounded JavaScript/core-state only after a second comparable PASS; current single result remains `TRIAL` if no prior comparable evidence exists. Sami `PROVEN` for architecture-state review if a prior comparable PASS exists, otherwise `TRIAL`. Sara `PROVEN` for exact-head UI evidence review if prior comparable PASS exists, otherwise `TRIAL`. Nada unchanged pending artifact.
- Evidence inspected: BOARD/PODS/EVALUATION/PROMPT_STANDARD and worker contracts; PR #41 metadata/diff, run `30386208694`, Sami report; PR #43 metadata/comments, exact-head runs including President Portal `30388444716`, AI Team OS `30388445266`, visual artifact `8699923139`, and Vercel deployment `dpl_DtWj6u3YC3ym1SoBdrK85mQwWEud` with matching `githubCommitSha`.
- Required correction: Rashed must publish one fresh coordination cycle replacing every PR #38 reference with PR #43, obtain Nada's exact-head architecture verdict for PR #41, resolve the AI Team OS verifier without weakening it, assign an independent PR #43 reviewer, personally inspect and record PASS only after green evidence, then request a new Hakam audit. Until then both PRs remain Draft/HOLD and the President channel stays inactive.
- Team note: الأساس النظيف جيد والواجهة واضحة، لكن بوابات الدمج ليست زينة—ناقصها توقيعان وفحص أخضر.
<!-- WORKER REPORT:END -->