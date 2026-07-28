# Yakolak Agent Evaluation

## Purpose

Measure verified engineering value, responsiveness to the President, visual-documentation integrity, architecture safety, and migration progress—not scheduled activity or commit count.

Hakam is independent/read-only and may reject manager assignments, prompts, blueprint handling, architecture decisions, or completion claims.

## Worker score (100)

- Correctness and acceptance criteria: 25
- Blueprint/prompt alignment and President-direction fidelity: 15
- Evidence and traceability: 15
- Scope/budget/ownership discipline: 10
- Architecture alignment and debt impact: 15
- Validation depth appropriate to risk: 15
- Honest uncertainty and handoff: 5

Verdicts: `PASS` 85–100 with no tripwire; `CONDITIONAL` 70–84; `FAIL` below 70/tripwire; `NO_TASK` and `NO_CHANGE` are not scored.

## Manager score (100)

- Lightweight President checkpoint and unread-input reconciliation: 15
- Blueprint quality, revision control, and visible progress: 15
- Fresh repository/CI/Preview/architecture snapshot: 10
- President/bottleneck/migration judgment: 15
- Task fit to capability/effort: 10
- Non-overlap and reviewer/steward independence: 10
- Prompt precision and anti-hallucination quality: 10
- Review/merge judgment: 10
- Verified product/debt/migration progress: 5

A manager score below 85 blocks merges and makes the next cycle process repair. A cycle that ignores unread President input, manufactures busywork, or advances no documented gate cannot score above 69.

## Architecture Steward

For boundary changes, check canonical dependency direction, single ownership, absence of new version layers/source patches/Blob/globals/duplicate state, architecture guard, blueprint alignment, and debt/migration deltas.

Verdicts: `ARCH_OK`, `ARCH_HOLD`, `ARCH_REJECT`. `ARCH_REJECT` blocks merge.

## Automatic tripwires

Any one is automatic `FAIL`:

- coding without a valid canonical `blueprintNodeId` and `blueprintRevision`;
- coding from a node not `ready`/`in_progress`;
- continuing affected work after an unread/unreconciled President blueprint edit;
- silently overwriting or reinterpreting President direction;
- marking a node `review` without an artifact or `completed` without gates;
- stale-base writing or scope/budget violation;
- weakening/bypassing tests or architecture checks;
- fabricated testing, screenshots, IDs, commits, results, or manual verification;
- self-approval or merge without independent review;
- fake preview state replacing native runtime behavior;
- unauthorized `main`, Production, rules, secrets, schema/auth, destructive action, or major deletion;
- hidden critical conflict/error or misleading status;
- new `app-game-vNNN.js`, wrapper/source replacement, Blob bootstrap, hidden `globalThis.__yakolak*`, duplicate state/rules, or rules in UI/preview/network;
- unregistered structural debt increase;
- vague/invented premise after insufficient evidence.

## Capability ledger

Statuses: `PROVEN` (two recent PASS at risk/effort), `TRIAL`, `REDUCE`, `PAUSE`.

Domains: repository/CI; JavaScript/runtime; game core/state machine; Three.js/input/camera/UI; online/network; testing/replay/evidence; architecture/review; visual planning/blueprint discipline.

Names do not create specialties. Evidence matches capability to risk.

## Effort adaptation

- PASS >=92: same or one higher class
- PASS 85–91: same maximum
- CONDITIONAL: reduce one class
- FAIL: read-only diagnosis or XS correction
- NO_ARTIFACT: retry same/smaller or replace
- `L` is never assigned

## Required accounting

Every implementation/review records:

- `blueprintNodeId` and `blueprintRevision`;
- `blueprint delta`: unchanged / updated status / revised intent;
- affected debt IDs;
- `legacy-debt delta`;
- `migration-gate delta`.

## Merge verdict

For every implementation PR Hakam records:

- President checkpoint current: yes/no;
- blueprint node/revision valid and current: yes/no;
- task/prompt valid and premise fresh: yes/no;
- diff inside scope/budget: yes/no;
- reviewer verdict;
- Architecture Steward verdict when required;
- architecture guard and CI/evidence sufficient: yes/no;
- blueprint/debt/migration deltas honest: yes/no;
- audit verdict: `MERGE_OK | HOLD | REJECT`.

Only `MERGE_OK` permits Rashed to merge into `agent/yakolak-team-os`. President human gates override all automation.
