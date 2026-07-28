# Yakolak AI Team Board

## Active cycle

- Cycle: `004-canonical-entry-contract`
- Status: `ACTIVE`
- President: Ahmad
- Manager: Rashed
- Auditor: Hakam
- Integration branch: `agent/yakolak-team-os` — verify fresh head before acting
- Source PR #35 head: verify fresh before acting; human-gated
- President Portal PR #38 head: verify fresh before acting — `HOLD`, not merged, channel inactive
- Snapshot time: `2026-07-28T21:01+03:00` plus subsequent PR #38 synchronization; refresh before action
- Current bottleneck: establish the first deterministic Boot -> Entry -> Mode-selection contract without DOM, Three.js, network, or legacy wrappers.

## Fresh evidence

- PR #36: open, draft, unmerged; verify current mergeability/head.
- PR #38: open, draft, unmerged; exact head must be refreshed before review.
- PR #38 checks observed during implementation: Architecture Guardrails, AI Team OS, President contract, and desktop/mobile browser journey passed on tested heads; D1 failure also existed on the base branch.
- Vercel branch alias reached READY only for older PR #38 commits; an exact-head Preview remains required before `Preview PASS`.
- President API is not an active source of truth until PR #38 is merged. No directives, messages, or decisions are reconciled from it before activation.

## President communication channel

- Human interface: `developer.html`; D1/D2/D3/D4 identify workspace generations, not separate human roles.
- Contract: `ops/ai-team/PRESIDENT_PORTAL.md`.
- President directives/messages/decisions: `/api/developer-president` on the exact current protected Preview after activation.
- Rashed review outbox: `ops/ai-team/president-outbox.json`.
- Rashed directive replies/statuses: `ops/ai-team/president-status.json`.
- Rashed is the sole team member who communicates managerial results to the President.
- Existing D4 request/review actions are routed through Rashed; no parallel direct-to-worker channel is permitted.
- No item reaches the President review queue without reviewer `PASS`, `ARCH_OK` when required, Hakam `MERGE_OK`, CI `GREEN`, exact-head Preview, exact commit SHA, and Rashed personal `PASS`.
- The API is disabled in Production by default; enabling it requires explicit authorization and `PRESIDENT_PORTAL_PRODUCTION_ENABLED=1` in a protected environment.

## Assignments and locks

| Employee | Task | Status | Lock / role |
|---|---|---|---|
| Noor | `YAK-004-01` first canonical entry contracts + reducer tests | `READY` | new `src/core/` contract/reducer files and one focused Node test |
| Sami | `YAK-004-02` independent review of Noor artifact | `READY` after artifact | read-only reviewer |
| Lina | — | `NO_TASK` | no legacy wrapper work |
| Mazen | — | `NO_TASK` | no parallel state model |
| Nada | `YAK-004-03` Architecture Steward for Noor | `READY` after artifact | read-only `ARCH_OK/HOLD/REJECT` |
| Omar | — | `NO_TASK` | no lineage busywork |
| Sara | `YAK-004-04` verify PR #38 exact-head CI/Preview evidence | `READY` | read-only; no portal activation or merge |
| Hakam | `YAK-004-05` final cycle audit | `READY` | read-only final verdict |

## Capacity

- Implementation writers: **1 / 2 maximum**.
- Implementation effort: **3 / 5 points maximum**.
- No second implementation until Noor produces a reviewable artifact.
- New behavior must remain canonical; no legacy-debt increase is authorized.

## Cycle acceptance gates

### `YAK-004-01`

- Named contracts for `Action`, `AppState`, `Effect`, and `RenderSnapshot` exist without browser/runtime dependencies.
- A deterministic transition function covers Boot -> Entry -> Mode selection and rejects/ignores invalid transitions explicitly.
- Node-only tests prove initial state, allowed transitions, and at least two invalid-event cases.
- No DOM, Three.js, network, storage, timer, Blob, global, or source-patching dependency.
- Reviewer `PASS`, Nada `ARCH_OK`, architecture guard green, then Hakam `MERGE_OK` before manager merge.

### PR #38

- Keep `HOLD` until checks complete on exact head, Vercel Preview matches exact head, desktop/mobile evidence is independently inspected, and Hakam issues `MERGE_OK`.
- Do not treat `/api/developer-president` as active before merge.
- President review approval never implies Production or another unstated human gate.

## Deltas

- Expected `legacy-debt delta`: `unchanged`.
- Expected `migration-gate delta`: Slice 1 moves from documentation to first executable deterministic contract.

## Human gates

No PR #35 merge, `main` write/merge, Production deployment, game-rule change, secrets/schema/authentication/destructive operation, major deletion, or Production President-channel enablement without Ahmad's explicit authorization for that exact action.
