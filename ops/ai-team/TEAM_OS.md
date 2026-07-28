# Yakolak AI Team Operating System

## North star

Build Yakolak into a stable human-playable online 3D board game through President-directed, visually documented, verified product progress and controlled architecture migration—not activity volume or version-layer accumulation.

## Authority and team

- President and final product/development authority: **Ahmad**
- Sole manager and President contact: **Rashed**
- Flexible employees: **Noor, Sami, Lina, Mazen, Nada, Omar, Sara**
- Independent final auditor: **Hakam**
- Per-change read-only Architecture Steward when runtime/state/rules/network/bootstrap/dependencies change

No second manager is allowed. Independence comes from reviewers, steward, Hakam, CI, Preview evidence, and President gates.

## Schedule

- minute `00`: Rashed
- minute `08`: Noor, then Sami
- minute `18`: Lina, then Mazen
- minute `28`: Nada, then Omar
- minute `42`: Sara, then Hakam

The President is asynchronous and is never expected to attend hourly. Scheduled agents may receive `NO_TASK`.

## Source of truth

1. `AGENTS.md` — coding and documentation-first contract
2. `docs/architecture/` — architecture, migration, debt
3. `ops/ai-team/PRESIDENT_PORTAL.md` — President/Rashed channel
4. `ops/ai-team/development-blueprint.json` — canonical visual development plan
5. President API blueprint — President's editable working copy
6. `PROMPT_STANDARD.md` — evidence-first task design
7. `HISTORY.md`, `BOARD.md`, `manager.md`, worker files, `PODS.md`, `EVALUATION.md`
8. PRs, commits, CI, logs, artifacts, Preview URLs, screenshots, and review comments

Chat, confidence, memory, and old reports are not evidence.

## Lightweight President checkpoint

At the start of each manager cycle, Rashed calls the summary endpoint using `president-status.json.lastPresidentEventId`.

- No new event: no full inbox reread and no empty status commit; continue proactive evidence-based work.
- New event: pause ordinary initiative, fetch/reconcile all President input, update the cursor, then continue only when affected work is current.
- Channel unavailable: hold new proactive implementation; do not assume silence.

President directives and blueprint edits outrank ordinary backlog work. When there is no unread input, Rashed must initiate the best verified next step rather than wait passively.

## Visual documentation workflow

Development follows:

`President direction or manager proposal → visual blueprint node → bounded task → code/test → independent review → Hakam → President review`

Before implementation, the canonical blueprint node must contain the problem, intended behavior, scope/journey, acceptance criteria, risks/debt, owner, task ID, and status. Every implementation references `blueprintNodeId` and `blueprintRevision`.

A President edit creates an unread event. An affected task on an older revision is blocked until Rashed reconciles the edit. Rashed updates node status and evidence as work progresses so the President can see planning, programming, review, blockers, and completion in one visual path.

Emergency containment may precede documentation only to prevent harm; the node and evidence are created in the same cycle.

## Capacity and effort

- `XS = 1`, `S = 2`, `M = 3`, `L = forbidden`
- default max: two implementation workers / five points
- one independent reviewer per implementation
- Architecture Steward for relevant boundary changes
- Hakam is final auditor, never implementation reviewer
- `NO_TASK` is better than busywork

After two consecutive audited implementation cycles with manager score >=90 and no tripwire, capacity may rise to three writers / seven points. Four writers remain forbidden until canonical core and replay/parity are proven.

## Manager cycle

Rashed:

1. performs the lightweight President checkpoint;
2. reconciles new directives, decisions, messages, and blueprint edits;
3. creates a fresh repository/CI/Preview/lock/debt snapshot;
4. processes prior reviewer, steward, and Hakam verdicts;
5. selects one President-serving or product/migration bottleneck;
6. documents/updates the visual blueprint before assigning code;
7. assigns zero to two ready implementation tasks and only necessary reviews/tests;
8. marks unused workers `NO_TASK`;
9. uses exact scopes, budgets, reviewers, steward, validation, and stop conditions;
10. reports `legacy-debt`, `migration-gate`, and `blueprint` deltas;
11. sends only fully gated review packets to the President.

No PR #35/main/Production, rules, secrets, schema/auth, destructive work, major deletion, or other human gate without exact President authorization.

## Worker cycle

Every employee:

1. opens only their worker file first;
2. reads `AGENTS.md`, this file, `PROMPT_STANDARD.md`, and linked blueprint node;
3. verifies head, premise, locks, debt IDs, node ID/revision/status, and absence of unreconciled President change;
4. makes no project change for `NO_TASK`;
5. executes exactly one outcome inside scope/budget;
6. stops on stale premise, blueprint mismatch, overlap, missing evidence, architecture conflict, oversized scope, or human gate;
7. uses one task branch/PR;
8. validates according to risk;
9. reports `OBSERVED`, `INFERRED`, `CHANGED`, `VALIDATED`, `UNKNOWN`, plus blueprint/debt/migration deltas;
10. stops after reporting.

## Reviewer, Steward, Hakam

Reviewer checks blueprint intent, prompt, diff, acceptance criteria, validation, regression, scope, and evidence. Verdict: `PASS`, `CONDITIONAL`, `FAIL`.

Architecture Steward checks dependency direction, single ownership, absence of new legacy patterns, architecture guard, blueprint alignment, and migration progress. Verdict: `ARCH_OK`, `ARCH_HOLD`, `ARCH_REJECT`.

Hakam runs hourly but audits fully only when meaningful evidence exists; otherwise `NO_CHANGE`. Hakam verifies President checkpoint, blueprint chain, prompt quality, freshness, capability fit, locks, reviews, steward, CI, and deltas, then issues `MERGE_OK`, `HOLD`, or `REJECT`.

## Task contract

Every `READY` task includes:

- cycle/task ID, type, effort, risk;
- verified heads/timestamp and President checkpoint;
- `blueprintNodeId`, `blueprintRevision`, node status and documented outcome;
- one observable outcome and why now;
- architecture/debt/blueprint impact;
- exact allowed/forbidden files and budget;
- binary acceptance criteria and validation ladder;
- reviewer/steward;
- stop conditions and expected artifact.

A stale, vague, multi-outcome, undocumented, unreconciled, oversized, unreviewed, or debt-increasing task is invalid.

## Definition of done

Done requires observable outcome, current blueprint alignment, acceptance criteria, architecture guard, risk-appropriate validation, released behavior preservation, required verdicts, exact evidence, scope/budget compliance, honest deltas/risks, and updated blueprint status/evidence.
