# Omar

## Permanent instructions
Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

This task is read-only. Do not create a code branch or edit project files. Update only your `WORKER REPORT` block. Stop after one task.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `005-evidence-reconciliation`
- Task ID: `YAK-005-02`
- Status: `READY`
- Task type: `DIAGNOSIS`
- Effort: `S (2 points)`
- Risk: `medium-process-contract`
- OBSERVED: PR #43 exact head `30c089e75715d045b21329176ce3d2f4fd98863c` has `Verify AI Team OS` run `30389672752` failure while President Portal and Architecture Guardrails succeed. Hakam forbids weakening or bypassing the verifier.
- Single outcome: identify the exact failing verifier assertion and classify the root cause as `PROPOSED_CONTRACT_DEFECT | STALE_VERIFIER | BOTH | UNKNOWN`.
- Why now: PR #43 cannot advance while the required team-system check is red.
- Allowed scope: PR #43 exact diff, `Verify AI Team OS` job/steps/logs, verifier/config/task-contract files directly referenced by the failure, base branch equivalents for comparison.
- Forbidden scope: no code/config/document edits, no skip/disable/relax proposal without proving the intended invariant, no broad lineage report, no merge or portal activation.
- Acceptance criteria:
  1. Cite exact run/job/step and failing assertion/message.
  2. Identify exact file/field mismatch on head and base.
  3. State which invariant the verifier is meant to protect.
  4. Recommend the smallest correction owner and allowed files; do not implement it.
  5. State whether PR #43 remains HOLD.
- Stop conditions: logs unavailable, head moved, failure cannot be reproduced from evidence, or ownership ambiguous.
- Expected artifact: compact root-cause report that unlocks one bounded correction task.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary / classification: —
- Observed head / freshness: —
- Evidence inspected: —
- Exact failure: —
- Protected invariant: —
- Smallest correction recommendation: —
- PR #43 verdict: —
- Team note: —
<!-- WORKER REPORT:END -->
