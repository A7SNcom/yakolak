# Yakolak AI Team Board

## Active cycle

- Cycle: `003-architecture-reset`
- Status: `PROCESS_FREEZE_UNTIL_NEXT_MANAGER_CYCLE`
- President: Ahmad
- Manager: Rashed
- Auditor: Hakam
- Integration branch: `agent/yakolak-team-os`
- Product release branch: `main` (human gate)
- Previous source branch: `agent/developer-d2-workbench`
- Snapshot time: `2026-07-28T20:14+03:00`
- Current bottleneck: stop structural debt growth and establish a canonical migration path before more legacy/D4 feature work.

## President communication channel

- Human interface: `developer.html` — the President interface; D1/D2/D3/D4 identify workspace generations, not different human roles.
- Contract: `ops/ai-team/PRESIDENT_PORTAL.md`.
- President directives/messages/decisions: `/api/developer-president` on the current accessible team-branch Preview.
- Rashed review outbox: `ops/ai-team/president-outbox.json`.
- Rashed directive replies/statuses: `ops/ai-team/president-status.json`.
- Rashed is the only team member who communicates managerial results to the President.
- No item reaches the President review queue without reviewer `PASS`, `ARCH_OK` when required, Hakam `MERGE_OK`, CI `GREEN`, working Preview, exact commit SHA, and Rashed personal `PASS`.
- President review approval does not authorize Production, rules, secrets, schema/authentication, destructive operations, or major deletion unless that exact scope is explicitly requested and confirmed.

## Critical diagnosis

The repeated defects are not isolated mistakes. The accepted runtime still combines many responsibilities in `src/app-game-v085.js`, while later builds fetch old JavaScript as text, replace exact strings/regular expressions, execute Blob modules, expose private state through globals, and mutate runtime state from preview layers.

The clean vNext architecture existed in draft PR #29 but was isolated and non-enforced. Active work continued repairing layers instead of migrating the source of truth.

## Architecture reset completed

- Canonical architecture: `docs/architecture/GAME_ARCHITECTURE.md`
- Incremental roadmap: `docs/architecture/MIGRATION_ROADMAP.md`
- Structural debt register: `docs/architecture/DEBT_REGISTER.md`
- Prompt standard: `ops/ai-team/PROMPT_STANDARD.md`
- Automated guard: `scripts/verify-architecture-guardrails.mjs`
- CI workflow: `.github/workflows/architecture-guardrails.yml`
- Root agent contract updated to forbid new version layers, source patching, Blob bootstrap, hidden global contracts, and duplicate state/rules.

## Freeze

All prior cycle-002 assignments are `STALE/HOLD`. No employee may execute them from old worker files during this freeze.

Until Rashed publishes a fresh cycle from the latest head:

| Employee | Status | Action |
|---|---|---|
| Noor | `NO_TASK` | no branch or code change |
| Sami | `NO_TASK` | no review without a fresh artifact |
| Lina | `NO_TASK` | no legacy wrapper repair from stale premise |
| Mazen | `NO_TASK` | no state/preview mutation work |
| Nada | `NO_TASK` | no research busywork |
| Omar | `NO_TASK` | no repeated lineage report |
| Sara | `NO_TASK` | no test review without an artifact |
| Hakam | `NO_CHANGE` | verify freeze/guard evidence only |

The board overrides stale `READY` task blocks until the next manager cycle replaces them.

## Capacity for next cycle

- Default maximum: **2 implementation workers / 5 points**.
- Remaining employees receive only necessary review/steward/test work or `NO_TASK`.
- Architecture Steward required for runtime/state/rules/network/bootstrap/dependency changes.
- No four-writer cycle until canonical core plus replay/parity harness are proven.

## Next-cycle priority

Rashed must first reconcile President directives and decisions, then choose one bottleneck and assign only ready work. Preferred sequence:

1. process the President channel and record acknowledgements/statuses;
2. validate architecture and President portal guards on the latest PR head;
3. establish Slice 1 contracts/state machine without DOM or Three.js;
4. extract one pure game-rule contract with headless tests;
5. build deterministic replay/parity before more visual/online feature states;
6. perform only essential legacy maintenance needed to preserve current behavior or unblock migration.

## Release and merge gates

- [ ] Architecture guard passes on current integration PR.
- [ ] President portal trust-boundary test passes.
- [ ] No new version runtime/source patch/Blob/global/state duplication.
- [ ] Reviewer PASS for each implementation.
- [ ] `ARCH_OK` for runtime-boundary work.
- [ ] Hakam `MERGE_OK`.
- [ ] Relevant deterministic/regression/browser/online evidence.
- [ ] Working Vercel Preview and exact commit SHA.
- [ ] Rashed personal inspection before President handoff.
- [ ] `legacy-debt delta` and `migration-gate delta` recorded.
- [ ] President explicitly authorizes PR #35/main/Production actions.

## Human gates

No PR #35 merge, `main` write/merge, Production deployment, rule change, secrets/schema/authentication/destructive operation, or major deletion without explicit President authorization.
