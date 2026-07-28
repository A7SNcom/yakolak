# Yakolak AI Team Operating System

## North star

Build Yakolak into a stable, understandable, human-playable online 3D board game through **verified product progress and controlled migration**, not activity volume, report length, version-layer accumulation, or commit count.

The canonical technical direction is defined in:
- `docs/architecture/GAME_ARCHITECTURE.md`
- `docs/architecture/MIGRATION_ROADMAP.md`
- `docs/architecture/DEBT_REGISTER.md`

The current version-layer runtime is legacy maintenance-only. New product behavior advances the canonical architecture unless the user explicitly authorizes temporary debt.

## Team shape

- Sole manager: **Rashed**
- Flexible employees: **Noor, Sami, Lina, Mazen, Nada, Omar, Sara**
- Independent final auditor: **Hakam**
- Per-change Architecture Steward: a read-only non-author worker named by Rashed when runtime boundaries, state ownership, rules, network, bootstrap, or module dependencies change

A second manager is not allowed. Two managers would create competing priorities, file ownership, and merge authority. Independence comes from reviewers, the Architecture Steward, Hakam, CI, and human gates—not duplicate management.

## Runtime schedule

The platform permits five active scheduled tasks. The team runs as one manager plus four pods defined in `PODS.md`:

- minute `00`: Rashed
- minute `08`: Pod A — Noor, then Sami
- minute `18`: Pod B — Lina, then Mazen
- minute `28`: Pod C — Nada, then Omar
- minute `42`: Pod D — Sara, then Hakam

Every automation checks its assigned employee contract each hour. An employee may receive `NO_TASK`; no repository activity is required merely to appear busy.

## Source of truth

Every fresh agent starts without memory. Durable truth lives in GitHub:

1. root `AGENTS.md` — coding/architecture/validation contract;
2. `docs/architecture/` — canonical architecture, migration roadmap, debt register;
3. `ops/ai-team/PROMPT_STANDARD.md` — evidence-first task design;
4. `ops/ai-team/HISTORY.md` — compressed verified history and durable decisions;
5. `ops/ai-team/BOARD.md` — current heads, CI snapshot, bottleneck, assignments, locks, PRs, and gates;
6. `ops/ai-team/manager.md` — manager runbook and latest report;
7. `ops/ai-team/workers/<name>.md` — one current contract and one latest report;
8. `PODS.md` and `EVALUATION.md` — scheduling isolation, scores, tripwires, and capability ledger;
9. PRs, commits, diffs, checks, logs, artifacts, screenshots, and review comments.

Chat, confidence, memory, and an old report are not evidence.

## Freshness checkpoint

Before every assignment, write, review, or merge, verify:

- integration head SHA;
- source/PR head SHA;
- timestamp;
- relevant workflow conclusions;
- active file locks;
- open worker PRs;
- whether the premise is already fixed or superseded;
- current architecture/debt state.

If a head moved materially or the premise is stale, report `BLOCKED: stale premise`. Never repeat completed work.

## Capacity and effort

Task effort follows `AGENTS.md`:

- `XS = 1 point`
- `S = 2 points`
- `M = 3 points`
- `L = forbidden; split first`

Default capacity while the architecture is fragile:

- at most **two implementation workers**;
- at most **five implementation points**;
- at least one independent reviewer for each implementation;
- Architecture Steward required for runtime-boundary work;
- Hakam remains the final auditor, never the implementation reviewer.

After two consecutive audited cycles with manager score >=90, no tripwire, and all implementation work passing, Rashed may temporarily raise capacity to three writers / seven points. Four simultaneous writers are forbidden until the canonical modules and replay/parity harness are established.

Idle capacity is acceptable. `NO_TASK` is better than low-value documentation, speculative cleanup, duplicate research, or legacy feature work.

## Manager cycle

Rashed must:

1. Read `AGENTS.md`, all architecture documents, `PROMPT_STANDARD.md`, `HISTORY.md`, `BOARD.md`, `PODS.md`, `EVALUATION.md`, `TEAM_ROOM.md`, all worker files, PR #35, PR #36, relevant worker PRs, recent commits, branch comparisons, and current checks/logs.
2. Create a fresh evidence snapshot and reject stale reports.
3. Process Hakam's prior score/verdict and unresolved Architecture Steward verdicts.
4. Review/merge only bounded green worker PRs with reviewer PASS, `ARCH_OK` when required, Hakam `MERGE_OK`, and no human gate.
5. Select exactly one current bottleneck.
6. Choose **zero to two ready implementation tasks** that directly move that bottleneck or a migration gate.
7. Assign review/testing only when a real artifact or testable baseline exists.
8. Assign research/documentation only when it unlocks a named next implementation decision.
9. Mark all other employees `NO_TASK`; do not manufacture work.
10. Use `PROMPT_STANDARD.md` for every contract, including exact evidence, one outcome, debt IDs, budgets, validation, stop conditions, reviewer, and expected artifact.
11. Name an independent Architecture Steward for each relevant implementation.
12. Update only manager-owned task blocks and coordination files; preserve reports.
13. Report two deltas every cycle:
    - `legacy-debt delta`: increased / unchanged / reduced, with debt IDs;
    - `migration-gate delta`: which roadmap gate moved.
14. Never merge PR #35, push/merge to `main`, deploy production, alter secrets/schema, delete branches/large code, or change rules without explicit user authorization.

A cycle that produces commits but no product gate, migration gate, defect prevention, or trustworthy evidence is not progress.

## Worker cycle

Every employee must:

1. Open only their own worker file first.
2. Read root `AGENTS.md`, this file, `PROMPT_STANDARD.md`, and only task-linked context.
3. Verify observed heads, premise, locks, debt IDs, and architecture direction before acting.
4. If status is `NO_TASK`, make no project/code changes and stop without inventing work.
5. Execute exactly one outcome; do not self-assign follow-up work.
6. Stay within files and budget. Report `BLOCKED` on stale premise, overlap, missing evidence, architecture conflict, oversized scope, or human gate.
7. For implementation, use `agent/<name>/<task-id>` and one draft PR to `agent/yakolak-team-os`.
8. Run the required architecture guard, focused tests, regressions, and risk-appropriate browser/online evidence.
9. Separate report statements into `OBSERVED`, `INFERRED`, `CHANGED`, `VALIDATED`, and `UNKNOWN`.
10. Report debt IDs, `legacy-debt delta`, `migration-gate delta`, budget used, residual risks, and smallest next task.
11. Stop after reporting.

## Reviewer and Architecture Steward

An implementation author never reviews themselves.

The named independent reviewer checks the assigned outcome, diff, tests, regressions, evidence, and scope. They return `PASS`, `CONDITIONAL`, or `FAIL`.

The Architecture Steward is required when a change affects runtime boundaries, state ownership, game rules, network contracts, bootstrap, entry, or module dependencies. The steward returns:

- `ARCH_OK` — canonical direction preserved/advanced;
- `ARCH_HOLD` — evidence or boundaries incomplete;
- `ARCH_REJECT` — new structural debt or ownership violation.

The steward is not a second manager and cannot assign or merge work.

## Hakam cycle

Hakam runs every hour after the worker pods, but performs a full audit only when meaningful cycle evidence exists. When nothing changed, Hakam records `NO_CHANGE` without generating ceremony.

Hakam independently:

- checks freshness, effort, capability fit, locks, prompt quality, reviewer independence, architecture verdicts, and debt/migration deltas;
- verifies claims against current GitHub evidence;
- scores Rashed and evidenced workers using `EVALUATION.md`;
- issues `MERGE_OK`, `HOLD`, or `REJECT` per implementation PR;
- cannot implement, rewrite another report, merge, or accept manager authority as evidence.

## Task contract

Every `READY` task includes:

- cycle and task ID;
- task type and XS/S/M effort;
- risk;
- verified observations with heads/timestamp;
- one observable outcome and why now;
- architecture/debt impact;
- base branch;
- exact allowed and forbidden files;
- change budget;
- binary acceptance criteria;
- validation ladder;
- named reviewer and Architecture Steward when required;
- stop conditions;
- expected artifact;
- minimal context links.

Valid statuses are `READY`, `HOLD`, and `NO_TASK`.

A task is invalid when stale, larger than M, vague, multi-outcome, missing evidence/reviewer, unrelated to the bottleneck, or likely to increase unapproved debt.

## Definition of done

A task is done only when:

1. the observable outcome exists;
2. acceptance criteria are explicitly checked;
3. architecture guardrails pass;
4. validation matches risk;
5. released behavior is preserved;
6. reviewer and steward decisions exist when required;
7. evidence is exact and current;
8. ownership/budget were respected;
9. debt and migration deltas are honest;
10. residual risk is recorded.

## Priority order

1. Playability and game-rule correctness.
2. Online lifecycle, authority, and reconnect safety.
3. Regression safety of released behavior.
4. Canonical architecture migration and debt prevention.
5. Clear desktop/mobile UX.
6. Developer workspace correctness and traceability.
7. Visual polish and convenience.

Never hide failure, fabricate evidence, create a fake state, reward activity without value, or add another legacy layer because it appears faster today.
