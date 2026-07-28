# Yakolak Durable Project History

_Last verified: 2026-07-28. Refresh all heads/checks before acting._

## Product objective

Yakolak is a 3D board game intended to become fully playable online with stable shared rules, authoritative/recoverable sessions, a clear first-run journey, responsive desktop/mobile UX, and an evidence-driven development/review environment.

## Repository lines

- Repository: `A7SNcom/yakolak`
- Production branch: `main`
- Production version metadata identifies Build 125.
- PR #35 is the draft D4 developer-workspace line on `agent/developer-d2-workbench`, based on another layered branch rather than `main`.
- PR #36 / `agent/yakolak-team-os` contains the engineering operating system and architecture guardrails; it remains draft and is not a release PR.
- PR #29 contains the original vNext clean-foundation documentation that informed the canonical architecture now copied and enforced in the active team line.

## Root architecture diagnosis

The largest recurring cause of defects is structural:

1. `src/app-game-v085.js` is a large mixed-responsibility runtime containing Three.js rendering, assets, camera, input, game state/rules, UI, timers, tutorial, motion, and setup.
2. `src/app-game-v112.js` fetches older JavaScript as text, modifies it through exact/regex replacements, and imports a generated Blob module.
3. `src/app-game-v114.js` patches the patched runtime again, adds more replacements/globals, and executes another Blob module before loading online code.
4. Developer previews can depend on hidden mutable runtime objects and can write state directly.
5. Version numbers in source filenames plus stacked PR branches obscure the current source of truth.

Consequences repeatedly observed:

- exact source-marker failures after harmless edits;
- Blob-relative import/module-resolution failures;
- stale state keys and impossible preview/runtime combinations;
- local/online/preview behavior drift;
- fixes that create a new layer rather than remove the root cause;
- tests preserving named builds without preventing architectural debt.

This is not solved by more reviewers alone. The code must move to single ownership and enforceable module boundaries.

## Canonical architecture decision

The version-layer runtime is legacy maintenance-only.

The target architecture is:

- `src/core/` — state machine/reducer, actions, lifecycle, effects, snapshots;
- `src/game/` — deterministic headless rules, board, inventory, turn, win/draw, scoring;
- `src/experience/` — input, camera, motion, UI, accessibility, mobile policies;
- `src/network/` — rooms, authority, reconnect, idempotency, synchronization;
- `src/render/` — Three.js scene projection only.

One state snapshot is the source of truth. Local, bot, online, tutorial, and preview use the same game commands/results. Camera/input/network/render/UI are adapters and never decide game legality.

Canonical references:

- `docs/architecture/GAME_ARCHITECTURE.md`
- `docs/architecture/MIGRATION_ROADMAP.md`
- `docs/architecture/DEBT_REGISTER.md`

## Migration decision

Use incremental strangler-style slices behind reversible flags, not a broad rewrite:

1. freeze new structural debt;
2. contracts and deterministic state machine;
3. pure game rules;
4. replay/parity harness against accepted behavior;
5. camera and input adapters;
6. one complete local playable round;
7. bot and authoritative online session;
8. developer workspace adapters;
9. visual parity and controlled cutover;
10. human-approved legacy deletion.

No new `app-game-vNNN.js`, source-text replacement, Blob bootstrap, hidden `globalThis.__yakolak*` contract, or duplicate state/rules is permitted.

## Architecture enforcement added

- root `AGENTS.md` and Copilot instructions enforce canonical direction;
- `scripts/verify-architecture-guardrails.mjs` detects forbidden new patterns;
- `.github/workflows/architecture-guardrails.yml` runs on relevant PR/push changes;
- architecture verification is included in `npm test`;
- every task reports affected debt IDs, `legacy-debt delta`, and `migration-gate delta`.

## Current released/developer behavior to preserve

- Existing game rules and released behavior remain unchanged unless the user explicitly authorizes a rule change.
- Current accepted regression surfaces include v112 tutorial, v118 rounds, v125 wall journey, Build 126 clean entry, retained D3, and D4 audit.
- D1 has had a recurring structural verification failure and requires fresh evidence before repair.
- D4 still has legacy-maintenance gaps around wrapper/import loading, real three-player/turn state, native online lifecycle, and journey coverage. These are maintained only when needed to preserve/inspect behavior or unblock migration.

## Team governance decisions

- Rashed is the only manager. A second manager is forbidden.
- Hakam is a permanent independent read-only final auditor with merge veto.
- A separate read-only Architecture Steward is named per runtime-boundary change; this is not a second manager.
- Scheduled pods run hourly, but employees may receive `NO_TASK`; the schedule does not justify busywork.
- Default capacity is two code writers / five points until two consecutive audited implementation cycles pass strongly.
- Every implementation requires an independent reviewer; architecture-sensitive work also requires `ARCH_OK`; Hakam must issue `MERGE_OK`.
- Prompts follow `PROMPT_STANDARD.md` and separate `OBSERVED`, `INFERRED`, `CHANGED`, `VALIDATED`, and `UNKNOWN`.
- No artifact means `NO_ARTIFACT`, never partial completion.
- No PR #35/main/Production action or rule/secrets/schema/auth/destructive change without explicit user authorization.

## Immediate sequence

1. keep architecture/team guardrails green;
2. issue a fresh demand-driven cycle after the architecture reset;
3. implement Slice 1 contracts/state without DOM/Three.js;
4. extract one pure rule slice with deterministic tests;
5. build replay/parity before expanding visual or online states;
6. perform only necessary legacy maintenance that preserves behavior or enables migration.
