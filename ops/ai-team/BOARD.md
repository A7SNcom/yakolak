# Yakolak AI Team Board

## Active cycle

- Cycle: `004-canonical-entry-contract`
- Status: `ACTIVE_WITH_VISUAL_DOCUMENTATION_MIGRATION`
- President: Ahmad
- Manager: Rashed
- Auditor: Hakam
- Integration branch observed by PR #44: `agent/yakolak-team-os` @ `5d3871544031a84c553b27768ef00ef2a382b55d`
- President visual workflow: draft PR #44 on `agent/president-portal`; `HOLD` until exact-head CI/Preview/review
- Product release branch: `main` — human gate
- Snapshot time: `2026-07-28T21:24+03:00`
- Current bottleneck: establish the first deterministic Boot → Entry → Mode-selection contract while activating the President-directed visual development workflow safely.

## President checkpoint policy

- The President is asynchronous and is not expected to attend every hour.
- Rashed checks `GET /api/developer-president?summary=1&after=<lastPresidentEventId>` first.
- No new input: no full inbox reread; continue proactive evidence-based work.
- New input: pause ordinary initiative, reconcile directives/messages/decisions/blueprint edits, then continue.
- The API/channel remains inactive for the scheduled manager until PR #44 is merged into the integration branch.

## Visual development reference

- Canonical board: `ops/ai-team/development-blueprint.json`
- Canonical revision: `2`
- Active implementation node: `track-canonical-architecture` / node revision `2`
- Active task link: `YAK-004-01`, owner Noor, status `in_progress`
- President edits are stored as a separate API draft; stale browser saves conflict rather than overwrite.
- After activation, any affected task older than a new President blueprint edit becomes `BLOCKED: president blueprint changed` until Rashed reconciles it.

## Fresh evidence

- PR #36 remains the draft Engineering OS line; verify current head/checks before any merge.
- PR #44 is the only current President visual workflow PR; old PR #38 is closed/unmerged and must not be used as current evidence.
- PR #44 must have exact-head GitHub checks, matching Vercel Preview, desktop/mobile evidence, independent review, Hakam `MERGE_OK`, and manager `PASS` before integration.
- D1 has a known baseline regression; it may not be hidden or weakened.

## Assignments and locks

| Employee | Task | Status | Blueprint / role |
|---|---|---|---|
| Noor | `YAK-004-01` first canonical entry contracts + reducer tests | `READY/IN_PROGRESS` | `track-canonical-architecture@2`; implementation owner |
| Sami | `YAK-004-02` independent review of Noor artifact | `READY` after artifact | same node/revision; read-only reviewer |
| Lina | — | `NO_TASK` | no legacy wrapper work |
| Mazen | — | `NO_TASK` | no parallel state model |
| Nada | `YAK-004-03` Architecture Steward for Noor | `READY` after artifact | same node/revision; `ARCH_OK/HOLD/REJECT` |
| Omar | — | `NO_TASK` | no lineage busywork |
| Sara | `YAK-004-04` verify PR #44 exact-head CI/Preview/desktop/mobile | `READY` | read-only; no activation/merge |
| Hakam | `YAK-004-05` final cycle audit | `READY` | verifies blueprint → prompt → diff → tests → review chain |

## Capacity

- Implementation writers: **1 / 2 maximum**.
- Implementation effort: **3 / 5 points maximum**.
- No second implementation until Noor produces a reviewable artifact.
- No new behavior may increase legacy debt.
- Future implementation tasks require a current canonical blueprint node/revision before assignment.

## Cycle acceptance gates

### `YAK-004-01`

- Named contracts for `Action`, `AppState`, `Effect`, and `RenderSnapshot` exist without browser/runtime dependencies.
- A deterministic transition function covers Boot → Entry → Mode selection and handles invalid transitions explicitly.
- Node-only tests prove initial state, allowed transitions, and at least two invalid-event cases.
- No DOM, Three.js, network, storage, timer, Blob, global, or source-patching dependency.
- Reviewer `PASS`, Nada `ARCH_OK`, architecture guard green, then Hakam `MERGE_OK` before manager merge.
- Diff remains aligned with `track-canonical-architecture@2`.

### PR #44

- Cursor summary avoids rereading an unchanged President inbox.
- New President input pauses ordinary initiative; no new input permits continued initiative.
- Editable visual blueprint supports nodes, links, status, owner, task ID, evidence, revision and conflict-safe saves.
- Browser cannot fabricate Rashed/reviewer/Hakam/CI/outbox/canonical-board state.
- Static/Syntax tests, exact-head Preview, desktop/mobile interaction evidence, independent review, and Hakam `MERGE_OK` exist.

## Deltas

- Expected `legacy-debt delta`: `unchanged`.
- Expected `migration-gate delta`: Slice 1 advances to deterministic contracts.
- `blueprint delta`: revision `1 → 2`; active canonical task and President visual workflow documented.

## Human gates

No PR #35 merge, `main` write/merge, Production deployment, game-rule change, secrets/schema/authentication/destructive operation, or major deletion without Ahmad's explicit authorization for that exact action.
