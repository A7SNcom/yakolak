# Yakolak Agent Instructions

These rules apply to every AI agent working in this repository. More specific `AGENTS.md` files may add constraints but must not weaken this contract.

## Mission

Ship Yakolak as a stable, understandable, human-playable online 3D board game. Ahmad, the President, is the final product/development authority. Rashed is the sole team manager.

## Read before editing

1. Read your exact task contract and only linked context.
2. Read `ops/ai-team/BOARD.md`, `ops/ai-team/PROMPT_STANDARD.md`, and the referenced node in `ops/ai-team/development-blueprint.json`.
3. For runtime/game changes, read `GAME_ARCHITECTURE.md`, `MIGRATION_ROADMAP.md`, and relevant `DEBT_REGISTER.md` entries.
4. Re-read the assigned base head and every allowed file immediately before writing.
5. Identify the existing source of truth. Do not create a parallel state, router, registry, lifecycle, rule set, or visual substitute.
6. Separate `OBSERVED`, `INFERRED`, `CHANGED`, `VALIDATED`, and `UNKNOWN` in reports.

## Documentation-first gate

Normal implementation is forbidden without all of:

- a canonical `blueprintNodeId`;
- a recorded canonical `blueprintRevision`;
- node status `ready` or `in_progress`;
- documented problem, intended result, scope, and acceptance criteria;
- task ID linked on the node.

If the President has edited the affected blueprint after the assigned revision, stop with `BLOCKED: president blueprint changed`. Do not code from the old interpretation.

Emergency production/security containment may precede full documentation only when delay creates harm. Document the incident node and evidence in the same cycle before further development.

## Architectural direction

- The version-layer runtime is legacy maintenance-only.
- Do not add another `app-game-vNNN.js`, wrapper layer, runtime source-text replacement, Blob module bootstrap, hidden `globalThis.__yakolak*` contract, or DOM/mesh state as truth.
- Net-new behavior advances canonical `core`, `game`, `experience`, `network`, and `render` modules.
- One reducer/state machine owns lifecycle transitions through named actions/commands.
- Game rules are deterministic and headless; no DOM, Three.js, fetch, storage, animation frame, or wall-clock dependency.
- Local, bot, online, tutorial, and developer preview consume the same game commands/results.
- Camera, input, renderer, UI, and network are adapters and never decide legality.
- Stable source filenames are required. Build versions belong in metadata/tags/changelogs.
- A legacy-only feature requires explicit President authorization, registered debt increase, and removal task.

## Scope and effort

- One task produces one observable outcome.
- `XS`: <=15 minutes, one file, <=40 logical changed lines.
- `S`: <=30 minutes, at most two files, <=80 logical changed lines.
- `M`: <=50 minutes, at most four tightly related files, <=200 logical changed lines.
- `L`: never implement in one run; split first.
- Do not reformat, rename, or modernize unrelated code.
- `NO_TASK` is preferable to stale or low-value activity.

## Coding rules

- Prefer readable ES modules and named functions over compressed one-line code.
- Use `const` by default and `let` only for real reassignment. Avoid `var`.
- Separate data/configuration from UI behavior, preview routing from workspace state, and transport from presentation.
- Reuse existing helpers/contracts; never duplicate game rules in preview or network code.
- Make transitions explicit/deterministic; online operations must be idempotent or safely retryable.
- Surface actionable errors and preserve original causes.
- Do not use arbitrary sleeps as correctness; use bounded readiness checks.
- Clean timers, listeners, actors, subscriptions, and pending work on teardown.
- Never embed secrets, tokens, private URLs, or production credentials.
- A dependency requires reason, size/security consideration, and tests.
- If rules, rendering, network, and UI appear in one file, stop and split the design.

## Game-specific rules

- Preserve released rules unless the President explicitly authorizes a rule change.
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

Never weaken, skip, delete, invert, or bypass tests for green CI.

## Branch and review

- Work from exact base on `agent/<name>/<task-id>`.
- Open one draft PR to `agent/yakolak-team-os`.
- No `main`, PR #35 merge, Production deployment, secrets/schema/auth/destructive work, major deletion, or rule change without exact President authorization.
- No self-approval. Implementation requires independent reviewer, Architecture Steward when relevant, and Hakam verdict.

## Required handoff

Report task ID, `blueprintNodeId`, `blueprintRevision`, outcome, commit/PR, files, validation/evidence, residual risks, debt IDs, `legacy-debt delta`, `migration-gate delta`, `blueprint delta`, and smallest next task. Claims without exact evidence are unverified.
