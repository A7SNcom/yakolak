# Yakolak Agent Evaluation

## Purpose

Measure verified engineering value, architecture safety, and migration progress—not message length, confidence, scheduled activity, or commit count.

**Hakam** is the independent final auditor. Hakam is read-only, cannot implement or merge, and may reject the manager's assignments, prompts, architecture decisions, or completion claims.

## Worker score (100)

- Correctness and acceptance criteria: 25
- Evidence quality and traceability: 15
- Scope/budget/ownership discipline: 15
- Architecture alignment and debt impact: 20
- Validation depth appropriate to risk: 20
- Honest uncertainty and handoff: 5

Verdict:

- `PASS`: 85–100 and no tripwire.
- `CONDITIONAL`: 70–84; bounded correction or stronger evidence required.
- `FAIL`: below 70 or any tripwire.
- `NO_TASK`: not scored; correct when no ready valuable work exists.
- `NO_CHANGE`: not scored; valid for an auditor/reviewer when no new artifact exists.

## Manager score (100)

- Freshness of repository/CI/architecture snapshot: 15
- Bottleneck and migration-gate judgment: 20
- Task fit to capability and hourly effort: 15
- Non-overlap, locks, reviewer/steward independence: 15
- Prompt precision and anti-hallucination quality: 10
- Review/merge judgment: 10
- Verified product/debt/migration progress: 10
- Concise accurate communication: 5

A manager cycle below 85 cannot merge worker PRs. The next cycle becomes process repair only.

A cycle that manufactures work for idle employees, advances no bottleneck/gate, or reports activity as progress cannot score above 69.

## Architecture Steward verdict

For runtime-boundary changes, the named read-only steward checks:

- canonical dependency direction;
- single ownership of lifecycle, rules, camera, input, network, render, and UI;
- absence of new version layers, source patching, Blob bootstraps, hidden global contracts, or duplicate state/rules;
- architecture guardrail status;
- registered debt and migration deltas.

Verdicts:

- `ARCH_OK`
- `ARCH_HOLD`
- `ARCH_REJECT`

`ARCH_REJECT` blocks merge regardless of functional CI.

## Automatic tripwires

Any one is an automatic `FAIL`:

- stale-base writing after a material head move;
- editing outside allowed scope or budget;
- disabling, skipping, weakening, deleting, or bypassing regression/architecture checks;
- fabricated tests, screenshots, identifiers, commits, results, or manual verification;
- self-approval or merge without independent review;
- fake preview state replacing available native runtime behavior;
- direct `main` write, Production deployment, secrets/schema/destructive action, or rule change without user approval;
- hidden critical conflict/error or misleading status;
- adding another `app-game-vNNN.js` or suffixed version-layer runtime;
- adding source-text runtime replacement, Blob module bootstrap, or hidden `globalThis.__yakolak*` contract;
- creating a second source of truth for rules, turn, state, camera, online lifecycle, or rendering;
- implementing rules in UI/preview/network code instead of the shared game core;
- unregistered structural-debt increase;
- using vague or invented premises after tools return insufficient evidence.

## Capability ledger

Hakam maintains evidence by worker and domain:

- `PROVEN`: two recent PASS results at the same effort/risk;
- `TRIAL`: insufficient evidence;
- `REDUCE`: conditional/failure requires smaller next work;
- `PAUSE`: repeated failure/tripwire; no implementation until two successful read-only tasks.

Domains:

- repository/CI;
- JavaScript/runtime;
- game core/state machine;
- Three.js/input/camera/UI;
- online lifecycle/network;
- testing/replay/evidence;
- architecture/review.

Names never create specialties; the ledger matches demonstrated capability to current risk.

## Effort adaptation

- PASS >=92: same or one higher class next cycle.
- PASS 85–91: keep maximum effort.
- CONDITIONAL: reduce one class and make acceptance checks explicit.
- FAIL: read-only diagnosis or XS correction reviewed by another worker.
- NO_ARTIFACT: retry at same/smaller effort or replace; never call partial completion.
- Never assign `L`; split contracts and slices first.

## Debt and migration accounting

Every implementation/review report records:

- affected debt IDs;
- `legacy-debt delta`: increased / unchanged / reduced;
- `migration-gate delta`: none or exact roadmap gate advanced.

Legacy-only activity with unchanged/increased debt may still be necessary for a production defect, but it must not be scored as migration progress.

## Merge verdict

For each implementation PR, Hakam records:

- task/prompt valid: yes/no;
- premise fresh: yes/no;
- diff within scope/budget: yes/no;
- independent reviewer verdict;
- Architecture Steward verdict when required;
- architecture guardrail status;
- CI/evidence sufficient for risk: yes/no;
- debt/migration delta honest: yes/no;
- audit verdict: `MERGE_OK | HOLD | REJECT`.

Only `MERGE_OK` permits Rashed to merge into `agent/yakolak-team-os`. Human gates still override all automation.
