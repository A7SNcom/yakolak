# Omar

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `006-correction-closure`
- Task ID: `YAK-006-05`
- Status: `READY_AFTER_ARTIFACT`
- Task type: `REVIEW`
- Effort: `S (2 points)`
- Risk: `medium-process-contract`
- OBSERVED: your cycle-005 diagnosis classified the PR #43 AI Team OS failure as `STALE_VERIFIER`; Lina is assigned `YAK-006-02` to add semantic-field normalization without weakening invariants.
- Single outcome: independently verify the correction accepts current canonical task labels and still rejects genuinely incomplete contracts.
- Allowed scope: Lina draft PR exact diff/head; `scripts/verify-ai-team-os.mjs`; focused positive/negative fixture; current task contracts and original failing assertion.
- Forbidden scope: no implementation, no workflow skip, no PR-specific exception, no acceptance from summary alone, no portal/game changes.
- Acceptance criteria: reproduce positive pass and negative failure; verify all semantic invariants remain required; verify scope/budget; inspect for special-cases or weakened checks; issue `PASS | CONDITIONAL | FAIL` with exact evidence.
- Stop conditions: no artifact, stale head, missing negative fixture, or correction changes unrelated files.
- Expected artifact: exact-head independent review for Hakam; `NO_ARTIFACT` if Lina has not produced a PR.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `COMPLETE`
- Summary / classification: `STALE_VERIFIER`. PR #43 did not weaken the team invariant; the required verifier still hard-codes an older task-field vocabulary while the active contracts use the newer evidence-first vocabulary already present on the base branch. The check is correctly red, but its parser is rejecting semantically complete task contracts by field name rather than validating their meaning.
- Observed head / freshness: PR #43 remains at exact head `30c089e75715d045b21329176ce3d2f4fd98863c`. Run `30389672752`, job `90377769695`, step 4 `Validate team configuration, tasks, effort and review gates` completed `failure`. The integration branch moved only through worker-report commits during this pod; PR #43 head and diagnosis inputs did not move.
- Evidence inspected: exact PR #43 diff and changed-file list; run `30389672752` / job `90377769695`; `.github/workflows/verify-ai-team-os.yml`; `scripts/verify-ai-team-os.mjs`; `team.config.json`; PR-head/base `BOARD.md`; PR-head/base `workers/sara.md` and `workers/hakam.md`.
- Exact failure: `scripts/verify-ai-team-os.mjs` lines 111–122 unconditionally emits messages such as `<worker>: missing Objective`, `missing Observed base/head`, `missing Base branch`, `missing Allowed files`, `missing Forbidden files / conflicts`, `missing Change budget`, `missing Required validation`, `missing Independent reviewer`, and `missing Context links`. On both PR #43 head and its base, Sara uses `OBSERVED`, `Single outcome`, `Allowed scope`, `Forbidden scope`, `Stop conditions`, and `Expected artifact`; Hakam uses `Single outcome`, `Required evidence`, `Acceptance criteria`, `Forbidden scope`, and `Expected artifact`. These contracts follow the current `PROMPT_STANDARD.md` semantic structure but do not contain the verifier's obsolete literal labels. The failure therefore reproduces from repository evidence without relying on a summary.
- Protected invariant: every READY task must remain bounded, current, evidence-backed, independently reviewed when applicable, budgeted, validated, and traceable to one artifact; task fields must not silently disappear. The invariant is valid. The defect is that the verifier equates one historical spelling with the invariant and has no schema version or accepted semantic aliases.
- Smallest correction recommendation: owner `Rashed / Team OS verifier maintainer`; one bounded non-product correction limited to `scripts/verify-ai-team-os.mjs` plus a focused verifier fixture/test file. Introduce a versioned normalized task parser that accepts the current canonical labels (`OBSERVED` or `Verified observations`; `Single outcome`; `Allowed scope`; `Forbidden scope`; `Validation`; `Stop conditions`) while still requiring every semantic invariant and rejecting genuinely missing content. Do not skip the workflow, reduce required fields, or special-case PR #43. Re-run the verifier against both a valid cycle-005 fixture and an intentionally incomplete fixture.
- PR #43 verdict: `HOLD`. Even after the verifier correction, PR #43 still requires exact-head green CI, a matching available Vercel Preview, Sara's refreshed evidence, independent reviewer PASS, Hakam `MERGE_OK`, and Rashed personal inspection.
- Team note: الحارس صاحي، لكنه ما زال يطلب أسماء البطاقات القديمة؛ نحدّث قاموسه ولا نفتح البوابة. 🙂
<!-- WORKER REPORT:END -->