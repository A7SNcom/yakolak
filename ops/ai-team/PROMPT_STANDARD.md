# Yakolak Task Prompt Standard

## Purpose

Prompts are execution contracts, not motivational speeches. They must reduce ambiguity, hallucination, scope drift, and unnecessary repository activity.

## Required structure

Every assigned task uses this order:

1. **Identity** — employee name and temporary task type.
2. **Verified observations** — exact head SHA, failing run/job, file/symbol evidence, and timestamp.
3. **Single outcome** — one externally observable result.
4. **Why now** — how it moves the current bottleneck or migration gate.
5. **Architecture/debt impact** — affected debt IDs, expected `legacy-debt delta`, and `migration-gate delta`.
6. **Allowed scope** — exact files/directories and maximum logical changes.
7. **Forbidden scope** — owned files, human gates, and architectural tripwires.
8. **Acceptance criteria** — binary, measurable statements.
9. **Validation ladder** — exact commands/evidence appropriate to risk.
10. **Stop conditions** — stale head, missing evidence, overlap, oversized work, failing prerequisite, or required human approval.
11. **Expected artifact** — PR, review, test report, architecture note, or `NO_TASK`.
12. **Report format** — observations, inference, action, validation, uncertainty, residual risk, and smallest next step.

## Language rules

- Use direct engineering language and exact identifiers.
- Do not say “improve everything,” “continue development,” “be creative,” “fully fix,” or “use best practices” without measurable boundaries.
- Do not tell an agent to assume success, invent missing context, or claim manual testing.
- Do not include irrelevant persona, praise, pressure, or artificial urgency.
- Natural team conversation is allowed only in the one-line team note after the technical report.

## Evidence discipline

Workers must label their reasoning:

- `OBSERVED` — directly verified from repository/tool evidence.
- `INFERRED` — a conclusion supported by listed observations.
- `CHANGED` — actual files/behavior modified.
- `VALIDATED` — commands, runs, artifacts, or screenshots that passed/failed.
- `UNKNOWN` — facts not verifiable in the current run.

An inference must never be written as an observed fact. A missing tool result is `UNKNOWN` or `BLOCKED`, not permission to guess.

## Prompt sizing

A good task prompt is detailed enough to prevent ambiguity but small enough to scan once. Context links replace pasted history. Include only facts required for the current outcome.

Task classes:

- `XS`: one narrow correction or verification.
- `S`: one bounded contract across at most two files.
- `M`: one atomic slice across at most four files.
- `L`: never assigned; split into contracts/slices first.

## Valid NO_TASK

`NO_TASK` is correct when:

- no ready work advances the current bottleneck;
- prerequisite evidence or another PR is missing;
- the only available work would overlap ownership;
- the task would create architectural debt;
- the worker's proven capability does not fit the risk;
- review is requested but no reviewable artifact exists.

Do not create research, documentation, or review busywork merely to keep every worker active.

## Review prompt

An independent reviewer receives:

- the original task contract;
- exact base/head SHAs and diff;
- acceptance criteria;
- required tests/evidence;
- known risks and debt IDs.

The reviewer must return `PASS`, `CONDITIONAL`, or `FAIL` with exact evidence. They do not rewrite the implementation.

## Architecture steward prompt

For changes affecting runtime boundaries, state ownership, game rules, network contracts, entry/bootstrap, or module dependencies, the manager names a read-only Architecture Steward who checks:

1. canonical dependency direction;
2. single ownership of state/rules/camera/network/rendering;
3. absence of new legacy patterns;
4. migration-gate progress;
5. architecture guardrail status.

The steward issues `ARCH_OK`, `ARCH_HOLD`, or `ARCH_REJECT`. Hakam remains the final independent cycle auditor.
