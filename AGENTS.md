# Yakolak Agent Instructions

These rules apply to every AI agent in this repository. More specific `AGENTS.md` files may add constraints but cannot weaken this contract.

## Mission and authority

Ship Yakolak as a stable, understandable, human-playable online 3D board game.

- Ahmad is the President and final product authority.
- Rashed is the sole delegated manager and initiative owner.
- Rashed plans, delegates, reviews, and decides; he does not implement product code.
- Workers execute bounded tasks; reviewers, Architecture Steward, and Hakam independently verify.

Improve the developer workspace only when it strengthens President direction, visual planning, execution traceability, testing, review, migration, or safe delivery of the real game.

## Read before editing

1. Read the exact task contract and only linked context.
2. Read `ops/ai-team/RASHED_LEADERSHIP_OS.md`, `TEAM_OS.md`, `PROMPT_STANDARD.md`, and the referenced node in `development-blueprint.json`.
3. Read architecture/migration/debt documents for runtime/game changes.
4. Re-read the assigned base head and every allowed file immediately before writing.
5. Check current ownership in `BOARD.md`.
6. Identify the existing source of truth; never create a parallel state, router, registry, lifecycle, rule set, or visual substitute.
7. Separate `OBSERVED`, `INFERRED`, `CHANGED`, `VALIDATED`, and `UNKNOWN` in reports.

## Programming-after-documentation gate

Normal implementation is forbidden without:

- a canonical `blueprintNodeId` and `blueprintRevision`;
- node status `ready` or `in_progress`;
- documented problem/opportunity, intended behavior, non-goals, acceptance criteria, owner, reviewer, risk, and dependencies;
- a task ID linked to the node.

Immediately before writing, verify that the blueprint revision and President intent remain current. If a material unreconciled President amendment affects the node, stop with `BLOCKED: president blueprint changed`.

Workers do not alter strategy or self-assign follow-up work. They may propose a next step; Rashed accepts, changes, parks, or rejects it.

Emergency security/data/production containment may precede full documentation only to prevent harm; Rashed documents the incident and assigns follow-up in the same cycle.

## Architectural direction

- The version-layer runtime is legacy maintenance-only.
- Do not add another `app-game-vNNN.js`, wrapper layer, runtime source-text replacement, Blob bootstrap, hidden `globalThis.__yakolak*`, or DOM/mesh state as truth.
- Net-new behavior advances canonical `core`, `game`, `experience`, `network`, and `render` modules.
- One state machine/reducer owns lifecycle transitions through named actions/commands.
- Game rules are deterministic and headless; no DOM, Three.js, fetch, storage, animation frame, or wall-clock dependency.
- Local, bot, online, tutorial, and developer preview consume the same game commands/results.
- Camera, input, renderer, UI, and network are adapters and never decide legality.
- Stable source filenames are required; versions belong in metadata, tags, and changelogs.
- Legacy-only features require explicit President authorization, registered debt increase, and removal task.

## Scope and effort

- One task produces one observable outcome.
- `XS`: <=15 minutes, one file, <=40 logical lines.
- `S`: <=30 minutes, at most two files, <=80 logical lines.
- `M`: <=50 minutes, at most four tightly related files, <=200 logical lines.
- `L`: never implement in one run; split first.
- Do not reformat, rename, or modernize unrelated code.
- `NO_TASK` is preferable to stale or low-value activity.

## Coding rules

- Prefer readable ES modules and named functions over compressed code.
- Use `const` by default and `let` only for real reassignment. Avoid `var`.
- Separate configuration/data from UI behavior, preview routing from workspace state, and transport from presentation.
- Reuse existing helpers/contracts; never duplicate game rules in preview or network code.
- Make transitions explicit/deterministic; online operations must be idempotent or safely retryable.
- Surface actionable errors and preserve original causes.
- Do not use arbitrary sleeps as correctness; use bounded readiness checks.
- Clean timers, listeners, actors, subscriptions, and pending work on teardown.
- Never embed secrets, tokens, private URLs, or production credentials.
- Dependencies require reason, size/security consideration, and tests.
- If rules, rendering, network, and UI appear in one file, stop and split the design.

## Game-specific rules

- Preserve released rules unless the President explicitly authorizes a change.
- Native runtime state remains truth during legacy maintenance; do not substitute fake overlays.
- Player counts, turn ownership, legal moves, scoring, rounds, reconnect, and rematches must match runtime contracts.
- Protect desktop/mobile performance; no higher DPR/geometry/texture/GPU/animation cost without evidence.
- Every migrated rule/transition requires deterministic replay or parity evidence.

## Validation ladder

1. blueprint/node/revision validity plus architecture/static checks;
2. focused deterministic test;
3. relevant regression suite;
4. browser functional test for UI/runtime;
5. desktop/mobile visual evidence for appearance/interaction;
6. real two-client evidence for networking/lifecycle.

Never weaken, skip, delete, invert, or bypass tests for green CI. Report unrelated failures honestly.

## Branch and review

- Work from the exact base on `agent/<name>/<task-id>`.
- Open one draft PR to `agent/yakolak-team-os` for implementation.
- No `main`, PR #35 merge, Production deployment, rules, secrets, authentication, destructive schema/data work, material recurring cost, major deletion, or branch deletion without exact President authorization.
- No self-approval. Implementation requires an independent reviewer, Architecture Steward when relevant, Hakam verdict, and Rashed's management decision.

## Required handoff

Report task ID, `blueprintNodeId`, `blueprintRevision`, outcome, commit/PR, files, validation/evidence, residual risks, debt IDs, `legacy-debt delta`, `migration-gate delta`, `blueprint delta`, and smallest proposed next task. Claims without exact evidence are unverified.
