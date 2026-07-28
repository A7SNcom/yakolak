# Yakolak Agent Instructions

These rules apply to every AI agent working in this repository. More specific `AGENTS.md` files may add constraints but must not weaken this contract.

## Mission
Ship Yakolak as a stable, understandable, human-playable online 3D board game. Improve the developer workspace only when it helps inspect, test, review, compare, or safely ship the real game.

## Read before editing
1. Read the task contract and only its linked context.
2. Re-read the assigned base branch head and every allowed file immediately before writing.
3. Identify the existing source of truth. Extend it; do not create a parallel state model, router, registry, or lifecycle.
4. Check active ownership in `ops/ai-team/BOARD.md`.

## Scope and effort
- One task must produce one observable outcome.
- `XS`: <=15 minutes, one file, <=40 logical changed lines.
- `S`: <=30 minutes, at most two files, <=80 logical changed lines.
- `M`: <=50 minutes, at most four tightly related files, <=200 logical changed lines.
- `L`: larger than one hourly run. Do not implement it; split it and report the first safe slice.
- Generated artifacts, lockfiles, and snapshots do not count toward the line limit, but must be justified.
- Do not reformat, rename, or modernize unrelated code.

## Coding rules
- Prefer readable ES modules and named functions over compressed one-line code.
- Use `const` by default and `let` only for real reassignment. Avoid `var`.
- Keep configuration/data separate from UI behavior, preview routing separate from workspace state, and online transport separate from visual presentation.
- Reuse existing helpers and contracts. Do not duplicate business rules in preview-only code.
- Make state transitions explicit and deterministic. Online operations must be idempotent or safely retryable.
- Do not hide errors. Surface actionable context and preserve the original cause.
- Do not use arbitrary sleeps as correctness. Poll only with a bounded timeout and a verifiable readiness condition.
- Guard DOM access and asynchronous cleanup. Clear timers, listeners, and pending work on teardown.
- Never embed secrets, tokens, private URLs, or production credentials.
- Do not add a dependency when a small native solution exists. Any dependency requires a reason, size/security consideration, and a test.

## Game-specific rules
- Preserve released game rules unless the user explicitly authorizes a rule change.
- Native runtime state is the source of truth. Do not replace a real game or online state with a fake overlay when the native state can be rendered.
- Player counts, turn ownership, legal moves, scoring, rounds, reconnect behavior, and rematches must match the actual runtime contract.
- Protect desktop and mobile behavior. Do not increase DPR, geometry, texture size, GPU work, or animation cost without before/after evidence.

## Validation ladder
Run the smallest sufficient ladder, in order:
1. syntax/type/static checks for every changed file;
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
- No author self-approval. Implementation requires independent review and the cycle auditor's verdict before manager merge.

## Required handoff
Report the task ID, outcome, commit/PR, files changed, validation commands and results, evidence, residual risks, and the smallest next task. Claims without exact evidence are treated as unverified.
