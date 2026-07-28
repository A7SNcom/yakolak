# Yakolak Copilot Instructions

Always read and follow root `AGENTS.md` before proposing, editing, or reviewing code.

For runtime/game work also read:

- `docs/architecture/GAME_ARCHITECTURE.md`
- `docs/architecture/MIGRATION_ROADMAP.md`
- `docs/architecture/DEBT_REGISTER.md`

For AI-team tasks also read `ops/ai-team/PROMPT_STANDARD.md`, `TEAM_OS.md`, the named worker task file, and current `BOARD.md`. The board may override a stale worker task with `HOLD` or `NO_TASK`.

Treat scope, effort, change budget, evidence, architecture/debt impact, validation ladder, independent review, Architecture Steward verdict, Hakam verdict, and human release gates as mandatory.

The version-layer runtime is maintenance-only. Do not add another `app-game-vNNN.js`, source-text patch, Blob bootstrap, hidden global contract, duplicate state/rules, fake native state, broad rewrite, hidden fallback, or weakened test.

Prioritize real playability, shared deterministic game rules, online authority/reconnect safety, regression evidence, canonical migration slices, desktop/mobile behavior, and reversible feature flags. Use `NO_TASK` rather than speculative or stale work.
