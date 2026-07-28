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
- Result: `CONDITIONAL`
- Summary / verdict: `CONDITIONAL` for PR #48 at exact head `78a28d06645d0cbefde734055a27cfe57a31d36e`. The semantic normalization is bounded and does not special-case PR #43 or weaken writer, effort, reviewer, auditor, lock, architecture, or human-gate checks; however the exact-head workflow remains red, so the artifact cannot receive final PASS yet.
- Evidence reviewed: PR #48 exact two-file diff; `scripts/verify-ai-team-os.mjs`; `scripts/verify-ai-team-os-fixtures.json`; workflow run `30396163994`, job `90399469434`, failing validation step.
- Positive/negative fixture result: the run emitted no positive-fixture or negative-fixture error, proving the canonical schema-v2 fixture was accepted and the intentionally incomplete fixture was rejected for missing `validation`. The new aliases normalize current labels rather than bypassing required semantics.
- Invariant review: implementation tasks still require observed evidence, outcome, why-now, base, allowed/forbidden scope, budget, acceptance, validation, independent reviewer, artifact, and stop conditions. Existing capacity, effort, reviewer independence, Hakam, ownership, architecture and human-gate enforcement remains present.
- Scope/budget: exactly two allowed files; no workflow, portal, game, or PR-specific exception was changed.
- Exact blocker: run `30396163994` failed only because integration data contains stale contracts: Mazen still declares cycle `002-evidence-first` and lacks schema-v2 `stop`; Sara declares cycle `005-evidence-reconciliation`, while BOARD is cycle `006-correction-closure`.
- Required correction: Rashed must refresh only the stale Mazen and Sara task contracts on the integration branch, then rebase/rerun PR #48. Lina's parser should not be loosened to hide those real coordination defects.
- PR decision: keep `HOLD`; after a green rerun on a fresh base, this review can become `PASS` without redesign.
- Team note: القاموس الجديد صحيح؛ الفشل الحالي كشف بطاقات قديمة حقيقية بدل أن يخفيها. 🔍
<!-- WORKER REPORT:END -->