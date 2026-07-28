# Yakolak Agent Instructions

These rules apply to every AI agent working in this repository. More specific `AGENTS.md` files may add constraints but must not weaken this contract.

## Mission
Ship Yakolak as a stable, understandable, human-playable online 3D board game. Improve the developer workspace only when it helps inspect, test, review, compare, migrate, or safely ship the real game.

## Read before editing
1. Read the task contract and only its linked context.
2. Read `docs/architecture/GAME_ARCHITECTURE.md`, `MIGRATION_ROADMAP.md`, and relevant entries in `DEBT_REGISTER.md` for any runtime/game change.
3. Re-read the assigned base branch head and every allowed file immediately before writing.
4. Identify the existing source of truth. Do not create a parallel state model, router, registry, lifecycle, rule set, or visual substitute.
5. Check active ownership in `ops/ai-team/BOARD.md`.
6. Separate in your report: verified observations, engineering inference, action taken, and unresolved uncertainty.

## Architectural direction
- The version-layer runtime is legacy maintenance-only.
- Do not add another `app-game-vNNN.js`, wrapper layer, runtime source-text replacement, Blob module bootstrap, hidden `globalThis.__yakolak*` contract, or DOM/mesh state as a source of truth.
- Net-new behavior must advance the canonical modules described in `GAME_ARCHITECTURE.md`: `core`, `game`, `experience`, `network`, and `render`.
- One state machine/reducer owns lifecycle transitions. State changes use named actions/commands.
- Game rules are deterministic and headless. They do not import DOM, Three.js, fetch, storage, animation frames, or wall-clock timers.
- Local, bot, online, tutorial, and developer preview consume the same game commands/results.
- Camera, input, renderer, UI, and network are adapters; none may decide game legality.
- Stable source filenames are required. Build/release versions belong in metadata, tags, and changelogs.
- A legacy-only feature requires explicit user authorization, a registered debt increase, and a removal task.

## Scope and effort
- One task must produce one observable outcome.
- `XS`: <=15 minutes, one file, <=40 logical changed lines.
- `S`: <=30 minutes, at most two files, <=80 logical changed lines.
- `M`: <=50 minutes, at most four tightly related files, <=200 logical changed lines.
- `L`: larger than one hourly run. Do not implement it; split it and report the first safe slice.
- Generated artifacts, lockfiles, and snapshots do not count toward the line limit, but must be justified.
- Do not reformat, rename, or modernize unrelated code.
- `NO_TASK` is preferable to low-value busywork or a stale premise.

## Coding rules
- Prefer readable ES modules and named functions over compressed one-line code.
- Use `const` by default and `let` only for real reassignment. Avoid `var`.
- Keep configuration/data separate from UI behavior, preview routing separate from workspace state, and online transport separate from visual presentation.
- Reuse existing helpers and contracts. Do not duplicate business rules in preview-only code.
- Make state transitions explicit and deterministic. Online operations must be idempotent or safely retryable.
- Do not hide errors. Surface actionable context and preserve the original cause.
- Do not use arbitrary sleeps as correctness. Poll only with a bounded timeout and a verifiable readiness condition.
- Guard DOM access and asynchronous cleanup. Clear timers, listeners, actors, subscriptions, and pending work on teardown.
- Never embed secrets, tokens, private URLs, or production credentials.
- Do not add a dependency when a small native solution exists. Any dependency requires a reason, size/security consideration, and a test.
- New modules should have one reason to change. If rules, rendering, network, and UI appear in one file, stop and split the design before implementation.

## Game-specific rules
- Preserve released game rules unless the user explicitly authorizes a rule change.
- Native runtime state is the source of truth during legacy maintenance. Do not replace a real game or online state with a fake overlay when the native state can be rendered.
- Player counts, turn ownership, legal moves, scoring, rounds, reconnect behavior, and rematches must match the actual runtime contract.
- Protect desktop and mobile behavior. Do not increase DPR, geometry, texture size, GPU work, or animation cost without before/after evidence.
- Every migrated rule/transition requires deterministic replay or parity evidence against the accepted behavior.

## Validation ladder
Run the smallest sufficient ladder, in order:
1. architecture guardrail and syntax/type/static checks for every changed file;
2. focused deterministic test for the changed contract;
3. relevant existing regression suite;
4. browser functional test for UI/runtime changes;
5. desktop and mobile visual evidence when appearance or interaction changes;
6. real online two-client evidence for networking/lifecycle changes.

Never delete, skip, weaken, invert, or bypass a test to make CI green. A failing unrelated test must be reported, not concealed.

## Branch and review
- Work from the task's exact base branch on `agent/<name>/<task-id>`.
- Open one draft PR to `agent/yakolak-team-os` for implementation work.
- Do not push to `main`, merge PR #35, deploy production, alter secrets, delete branches, or perform destructive data/schema work without explicit user approval.
- No author self-approval. Implementation requires a named independent reviewer, an architecture-steward verdict when runtime boundaries change, and Hakam's cycle verdict before manager merge.

## Required handoff
Report the task ID, outcome, commit/PR, files changed, validation commands and results, evidence, residual risks, affected debt IDs, `legacy-debt delta`, `migration-gate delta`, and the smallest next task. Claims without exact evidence are unverified.
