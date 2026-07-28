# Yakolak AI Team Board

## Active cycle

- Cycle: `004-canonical-entry-contract`
- Status: `ACTIVE`
- Manager: Rashed
- Auditor: Hakam
- Integration branch/head: `agent/yakolak-team-os` @ `326c1548011bdc90717e25ee22c66187abdafbc8`
- Source PR #35 head: verify fresh before acting; human-gated
- President Portal PR #38 head: `dae593e6d5fb458295ee91f46722655f8a1d7f1e` — `HOLD`, not merged, channel inactive
- Snapshot time: `2026-07-28T21:01+03:00`
- Current bottleneck: establish the first deterministic Boot -> Entry -> Mode-selection contract without DOM, Three.js, network, or legacy wrappers.

## Fresh evidence

- PR #36: open, draft, mergeable, unmerged; integration head above.
- PR #38: open, draft, mergeable, unmerged.
- PR #38 exact-head checks at snapshot: Architecture Guardrails, AI Team OS, Build 126, v112, and v125 passed; President Portal, v118, and D3 were still running; D1 failed on the known baseline regression.
- Vercel branch alias was READY only for older commit `07d61c82c9d876fd1942e9c9e4ac14aa02cb7257`, not PR #38 head; therefore no Preview PASS.
- President API is not an active source of truth until PR #38 is merged. No directives, messages, or decisions were reconciled this cycle.

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

## Deltas

- Expected `legacy-debt delta`: `unchanged`.
- Expected `migration-gate delta`: Slice 1 moves from documentation to first executable deterministic contract.

## Human gates

No PR #35 merge, `main` write/merge, Production deployment, game-rule change, secrets/schema/authentication/destructive operation, or major deletion without Ahmad's explicit authorization for that exact action.