# Yakolak Task Prompt Standard

## Purpose

Prompts are execution contracts, not motivational speeches. They reduce ambiguity, hallucination, scope drift, unnecessary repository activity, and invisible progress.

## Required structure

Every assigned task uses this order:

1. **Identity** — employee name and temporary task type.
2. **Verified observations** — exact head SHA, failing run/job, file/symbol evidence, and timestamp.
3. **Blueprint and ledger reference** — `blueprintNodeId`, `blueprintRevision`, initiative ID, and task ID.
4. **Single outcome** — one externally observable result.
5. **Why now** — how it moves the current bottleneck or migration gate.
6. **Architecture/debt impact** — affected debt IDs, expected `legacy-debt delta`, and `migration-gate delta`.
7. **Allowed scope** — exact files/directories and maximum logical changes.
8. **Forbidden scope** — owned files, human gates, and architectural tripwires.
9. **Acceptance criteria** — binary, measurable statements.
10. **Validation ladder** — exact commands/evidence appropriate to risk.
11. **Stop conditions** — stale head/blueprint, missing evidence, overlap, oversized work, failing prerequisite, or required human approval.
12. **Expected artifact** — PR, review, test report, architecture note, or `NO_TASK`.
13. **Checkpoint/report format** — phase, observations, inference, delta, validation, uncertainty, residual risk, and smallest next step.

A normal implementation task is invalid without a current blueprint node and a manager-created ledger task entry.

## Language rules

- Use direct engineering language and exact identifiers.
- Do not say “improve everything,” “continue development,” “be creative,” “fully fix,” or “use best practices” without measurable boundaries.
- Do not tell an agent to assume success, invent missing context, or claim manual testing.
- Do not include irrelevant persona, praise, pressure, or artificial urgency.
- Natural team conversation is allowed only in the one-line team note after the technical report.

## Evidence discipline

Workers label reasoning:

- `OBSERVED` — directly verified from repository/tool evidence.
- `INFERRED` — a conclusion supported by listed observations.
- `CHANGED` — actual files/behavior modified.
- `VALIDATED` — commands, runs, artifacts, or screenshots that passed/failed.
- `UNKNOWN` — facts not verifiable in the current run.

An inference is never an observed fact. A missing tool result is `UNKNOWN` or `BLOCKED`, not permission to guess.

## Visible checkpoint format

Every meaningful worker run reports:

- `Phase`: diagnosis / implementation / validation / blocked / ready_for_review / complete.
- `Progress delta`: what acceptance step changed since the prior report.
- `Evidence`: exact commit, PR, command, run, job, artifact, screenshot, or log reference.
- `Blocker or residual risk`.
- `Next smallest action`.
- `Suggested ledger event`: one concise factual sentence for Rashed to verify and append.

Do not report a guessed time percentage. Progress is derived from verified acceptance steps and gates.

If nothing meaningful changed, return `NO_CHANGE` with the reason and do not manufacture a report, commit, or ledger event.

## Multi-cycle work

A task may span multiple scheduled runs only when it remains one bounded observable outcome. Each meaningful run produces a checkpoint.

Work genuinely requiring many hours is an initiative split into several XS/S/M tasks. It is never one oversized implementation task. Rashed aggregates initiative progress in the ledger.

## Prompt sizing

A good prompt is detailed enough to prevent ambiguity but small enough to scan once. Context links replace pasted history. Include only facts required for the current outcome.

Task classes:

- `XS`: one narrow correction or verification.
- `S`: one bounded contract across at most two files.
- `M`: one atomic slice across at most four files.
- `L`: never assigned; split into contracts/slices first.

## Valid NO_TASK / NO_CHANGE

`NO_TASK` is correct when:

- no ready work advances the bottleneck;
- prerequisite evidence or another PR is missing;
- available work overlaps ownership;
- the task would create architectural debt;
- capability does not fit the risk;
- review is requested but no reviewable artifact exists.

`NO_CHANGE` is correct when a scheduled continuation or review finds no new meaningful evidence or state transition.

Do not create research, documentation, review, or progress busywork merely to keep every worker active.

## Review prompt

An independent reviewer receives:

- original task contract;
- exact blueprint node/revision and ledger task ID;
- exact base/head SHAs and diff;
- acceptance criteria;
- required tests/evidence;
- known risks and debt IDs.

The reviewer returns `PASS`, `CONDITIONAL`, or `FAIL` with exact evidence and a suggested ledger event. They do not rewrite the implementation.

## Architecture Steward prompt

For changes affecting runtime boundaries, state ownership, game rules, network contracts, entry/bootstrap, or module dependencies, Rashed names a read-only Architecture Steward who checks:

1. canonical dependency direction;
2. single ownership of state/rules/camera/network/rendering;
3. absence of new legacy patterns;
4. blueprint alignment and migration-gate progress;
5. architecture guardrail status;
6. whether the ledger claim matches the actual diff.

The steward issues `ARCH_OK`, `ARCH_HOLD`, or `ARCH_REJECT` with exact evidence and a suggested ledger event. Hakam remains the final independent cycle auditor.