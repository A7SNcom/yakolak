# Yakolak Task Prompt Standard

## Purpose

Prompts are execution contracts, not motivational speeches. They must reduce ambiguity, hallucination, scope drift, and unnecessary repository activity.

## Required structure

Every `READY` task uses this order:

1. **Identity** — employee and temporary task type.
2. **Verified observations** — exact head SHA, run/job, file/symbol evidence, President checkpoint result, and timestamp.
3. **Visual blueprint reference** — `blueprintNodeId`, canonical `blueprintRevision`, node status, documented objective, and whether a President draft is pending.
4. **Single outcome** — one externally observable result.
5. **Why now** — President direction or current bottleneck/migration gate.
6. **Architecture/debt impact** — debt IDs, `legacy-debt delta`, `migration-gate delta`, and `blueprint delta`.
7. **Allowed scope** — exact files/directories and maximum logical changes.
8. **Forbidden scope** — ownership, human gates, and architecture tripwires.
9. **Acceptance criteria** — binary measurable statements matching the blueprint.
10. **Validation ladder** — exact commands/evidence appropriate to risk.
11. **Stop conditions** — unread President change, blueprint revision mismatch, stale head, missing evidence, overlap, oversized scope, failing prerequisite, or human approval.
12. **Expected artifact** — PR, review, test report, architecture note, or `NO_TASK`.
13. **Report format** — observations, inference, action, validation, uncertainty, residual risk, and smallest next step.

## Blueprint rule

Implementation prompts without a valid canonical blueprint node and revision are invalid.

The manager must record:

- node ID and canonical revision;
- problem and intended behavior;
- acceptance criteria;
- task ID and owner;
- current status `ready` or `in_progress`.

The worker rechecks the canonical file immediately before writing. If the President channel contains an unreconciled edit affecting the node, or the canonical revision changed materially, the worker reports `BLOCKED: president blueprint changed`.

Review prompts receive the same blueprint reference and must verify that the diff still matches the documented intent. Hakam verifies the full chain: blueprint → prompt → diff → tests → review packet.

## Language rules

- Use direct engineering language and exact identifiers.
- Never say “improve everything,” “continue development,” “be creative,” “fully fix,” or “use best practices” without measurable boundaries.
- Never tell an agent to assume success, invent missing context, or claim manual testing.
- Do not include irrelevant persona, praise, pressure, or artificial urgency.
- Natural team conversation is allowed only in a one-line team note after the technical report.

## Evidence discipline

Label report statements:

- `OBSERVED` — directly verified evidence.
- `INFERRED` — conclusion supported by listed observations.
- `CHANGED` — files/behavior actually modified.
- `VALIDATED` — commands, runs, artifacts, screenshots, or browser checks.
- `UNKNOWN` — not verifiable in the run.

Inference is never an observed fact. Missing evidence means `UNKNOWN` or `BLOCKED`, not permission to guess.

## Prompt sizing

A good prompt is detailed enough to prevent ambiguity and small enough to scan once. Use context links instead of pasting history.

- `XS`: one narrow correction/verification.
- `S`: one bounded contract across at most two files.
- `M`: one atomic slice across at most four files.
- `L`: never assigned; split first.

## Valid NO_TASK

`NO_TASK` is correct when:

- no documented ready node advances the President direction or bottleneck;
- President input or blueprint edits are not yet reconciled;
- prerequisite evidence/PR is missing;
- available work overlaps ownership;
- the task creates unapproved debt;
- capability does not fit risk;
- review is requested but no artifact exists.

Do not create research, documentation, or review busywork merely to keep employees active.

## Independent review

A reviewer receives the original contract, blueprint node/revision, exact diff/head, acceptance criteria, validation evidence, known risks, and debt IDs. Verdict is `PASS`, `CONDITIONAL`, or `FAIL` with exact evidence. The reviewer does not rewrite the implementation.

## Architecture Steward

For runtime boundaries, state ownership, game rules, network contracts, entry/bootstrap, or dependencies, the read-only steward checks dependency direction, single ownership, absence of legacy patterns, migration progress, blueprint alignment, and architecture guardrails. Verdict: `ARCH_OK`, `ARCH_HOLD`, or `ARCH_REJECT`.
