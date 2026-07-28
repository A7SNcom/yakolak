# Yakolak AI Team Board

## Active cycle

- Cycle: `004-canonical-entry-contract`
- Status: `ACTIVE`
- President: Ahmad
- Manager: Rashed
- Auditor: Hakam
- Integration branch/head at portal base: `agent/yakolak-team-os` @ `5d3871544031a84c553b27768ef00ef2a382b55d`
- Source PR #35: human-gated; verify fresh head before acting
- President Portal: PR #43 @ `5f427e6818f8c2d8451b5bbb172f2e6f75798cbb` at initial creation; refresh exact head before verdict
- Snapshot time: `2026-07-28T21:17+03:00`
- Current bottleneck: complete the first canonical Boot -> Entry -> Mode-selection contract while independently validating the President interface.

## Current evidence

- Noor produced PR #41 at head `d5f2781d6189deae907ae2cf5c6db05d57c5774f`: 3 files / 151 additions; focused Node tests passed 5/5.
- Sami issued `PASS` for PR #41; Nada `ARCH_OK` and Hakam `MERGE_OK` remain required.
- PR #43 starts directly from the current team head and contains the President portal as one bounded feature commit plus this board update.
- The original PR #38 was closed after its branch was reset without merging portal files; it is historical evidence only and must not be activated.
- `/api/developer-president` is not an active source of truth until PR #43 is merged and an exact-head Preview is verified.

## President communication channel

- Human interface: `developer.html`; D1/D2/D3/D4 describe workspace generations, not different human roles.
- Contract: `ops/ai-team/PRESIDENT_PORTAL.md`.
- Ahmad communicates with the team through Rashed only.
- Main D4 task/review actions are routed to the President portal; no parallel direct-to-worker channel is allowed.
- President directives/messages/decisions use `/api/developer-president` after activation.
- Rashed review outbox: `ops/ai-team/president-outbox.json`.
- Rashed directive replies/statuses: `ops/ai-team/president-status.json`.
- A review packet requires reviewer `PASS`, `ARCH_OK` when needed, Hakam `MERGE_OK`, CI `GREEN`, exact-head Preview, exact commit SHA, and Rashed personal `PASS`.
- Portal decisions authorize only the packet's explicit `decisionScope`.
- Production API is disabled by default and requires explicit President authorization plus protected `PRESIDENT_PORTAL_PRODUCTION_ENABLED=1`.

## Assignments and locks

| Employee | Task | Status | Lock / role |
|---|---|---|---|
| Noor | `YAK-004-01` canonical entry contracts | `ARTIFACT_READY` | PR #41; no further changes without correction task |
| Sami | `YAK-004-02` review Noor artifact | `PASS` | read-only complete |
| Lina | — | `NO_TASK` | no legacy wrapper work |
| Mazen | — | `NO_TASK` | no parallel state model |
| Nada | `YAK-004-03` Architecture Steward for PR #41 | `READY` | read-only `ARCH_OK/HOLD/REJECT` |
| Omar | — | `NO_TASK` | no lineage busywork |
| Sara | `YAK-004-04` exact-head evidence review for PR #43 | `READY` | read-only; no activation or merge |
| Hakam | `YAK-004-05` final cycle audit including PR #43 | `READY` | read-only final verdict |

## PR #41 gates

- [x] Named headless contracts and deterministic reducer exist.
- [x] Focused Node tests pass 5/5.
- [x] Sami reviewer `PASS`.
- [ ] Nada `ARCH_OK`.
- [ ] Hakam `MERGE_OK`.
- [ ] Rashed freshness and merge decision.

## PR #43 gates

- [ ] Static President trust contract passes on exact head.
- [ ] True desktop `1440×1000` and mobile `390×844` Playwright journey passes on exact head.
- [ ] Invalid/incomplete review packets remain hidden.
- [ ] Old direct D4 task channel remains hidden or routed to Rashed.
- [ ] Vercel Preview metadata commit equals exact PR head.
- [ ] Sara issues `PASS_TO_REVIEW`.
- [ ] Hakam issues `MERGE_OK`.
- [ ] Rashed personally inspects diff, evidence, and Preview.

## Deltas

- Expected legacy-debt delta: `unchanged`.
- Migration-gate delta: Slice 1 executable contract is under review.
- Governance delta: one human President interface with one manager channel, inactive until all gates pass.

## Human gates

No PR #35 merge, `main` write/merge, Production deployment, game-rule change, secrets/schema/authentication/destructive operation, major deletion, or Production President-channel enablement without Ahmad's explicit authorization for that exact action.
