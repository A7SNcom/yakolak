# Yakolak Agent Evaluation

## Purpose
Measure verified engineering value, not message length, confidence, or number of commits. **Hakam** is the independent cycle auditor. Hakam is read-only, cannot implement, cannot merge, and may reject the manager's assignments or a worker's completion claim.

## Worker score (100)
- Correctness and acceptance criteria: 30
- Evidence quality and traceability: 20
- Scope discipline and ownership compliance: 15
- Code/design quality: 15
- Validation depth appropriate to risk: 15
- Honest handoff and residual-risk reporting: 5

Verdict:
- `PASS`: 85–100 and no tripwire.
- `CONDITIONAL`: 70–84; manager must assign a bounded correction or stronger verification.
- `FAIL`: below 70 or any tripwire.

## Manager score (100)
- Freshness of repository/CI snapshot: 20
- Task fit to worker capability and hourly effort: 20
- Non-overlap and lock quality: 15
- Priority/bottleneck judgment: 15
- Review and merge judgment: 15
- Measurable product progress: 10
- Concise, accurate communication: 5

A manager cycle below 85 cannot merge worker PRs. Hakam records the failure and the next cycle must be process-repair only.

## Tripwires
Any one of these is an automatic `FAIL`:
- stale-base writing after the assigned head moved materially;
- editing outside allowed files;
- disabling, skipping, weakening, or deleting a regression check for green CI;
- fabricated testing, screenshots, IDs, commits, or results;
- self-approval or manager merge without independent review;
- fake preview state replacing available native runtime behavior;
- direct `main` write, production deployment, secrets/schema/destructive action without user approval;
- hidden conflict, unresolved critical error, or knowingly misleading status.

## Capability ledger
Hakam maintains a rolling evidence-based capability table in the latest audit report. For each worker and domain, use:
- `PROVEN`: two recent PASS results at this effort level;
- `TRIAL`: no sufficient evidence yet;
- `REDUCE`: a conditional/failure requires a smaller next task;
- `PAUSE`: repeated failure or a tripwire; no code task until two successful read-only tasks.

Domains: repository/CI, JavaScript runtime, Three.js/UI, online lifecycle, testing/evidence, architecture/review.

Names do not create permanent specialties. The manager uses the ledger only to match current task risk and effort to demonstrated capability.

## Effort adaptation
- After `PASS >= 92`, the worker may receive the same or one higher effort class next cycle.
- After `PASS 85–91`, keep the same maximum effort.
- After `CONDITIONAL`, reduce one effort class and assign explicit acceptance checks.
- After `FAIL`, assign read-only diagnosis or a tiny correction reviewed by another worker.
- Never give an `L` task to an hourly worker. Split it first.

## Merge verdict
For each implementation PR Hakam records:
- task contract valid: yes/no;
- diff within budget: yes/no;
- independent reviewer verdict: pass/conditional/fail;
- CI/evidence sufficient for risk: yes/no;
- audit verdict: `MERGE_OK | HOLD | REJECT`.

Only `MERGE_OK` permits Rashed to merge into `agent/yakolak-team-os`. Human gates still apply afterward.
