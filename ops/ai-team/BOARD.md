# Yakolak AI Team Board

## Active cycle

- Cycle: `004-canonical-entry-contract`
- Status: `ACTIVE`
- President: Ahmad
- Delegated executive / sole manager: Rashed
- Auditor: Hakam
- Integration branch/head at portal base: `agent/yakolak-team-os` @ `5d3871544031a84c553b27768ef00ef2a382b55d`
- Source PR #35: human-gated; verify fresh head before acting
- President Portal: PR #43; refresh exact head/checks/Preview before verdict
- Canonical visual blueprint: revision `3`
- Current leadership mode: `DELEGATED_LEADERSHIP` until new unread President input exists
- Snapshot time: `2026-07-28T21:55+03:00`
- Current bottleneck: complete the first canonical Boot → Entry → Mode-selection contract while independently validating the President/Rashed interface.

## Strategic operating correction

- Rashed is the President's proactive delegated deputy, not an implementation worker.
- President silence does not block reversible leadership; Rashed initiates, plans, delegates, reviews, and integrates.
- New unread President input pauses selection of a new ordinary initiative, not all safe work.
- One President decision blocks only its dependent workstream.
- Workers implement; reviewers/steward/Hakam verify; Rashed makes the management decision.
- Visual documentation precedes normal implementation and remains amendable by the President.
- President attention is reserved for true gates, strategic directions, fully gated milestones, and compact return briefs.

## Current evidence

- Noor produced PR #41: headless canonical entry contracts and focused Node tests.
- Sami issued `PASS`; Nada `ARCH_OK` and Hakam `MERGE_OK` remain required before Rashed's integration decision.
- PR #43 contains the tested single President interface and the new Rashed leadership framework.
- Old PR #38 and superseded PR #44 are historical only and must not become parallel interfaces.
- `/api/developer-president` is not an active source of truth until PR #43 is merged and an exact-head Preview is independently verified.

## President communication and leadership channel

- Human interface: `developer.html`.
- Leadership contract: `ops/ai-team/RASHED_LEADERSHIP_OS.md`.
- Portal contract: `ops/ai-team/PRESIDENT_PORTAL.md`.
- Visual strategy: `ops/ai-team/development-blueprint.json`.
- Rashed status/cursor: `ops/ai-team/president-status.json`.
- Curated President queue: `ops/ai-team/president-outbox.json`.
- No direct worker-to-President task channel is allowed.

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
- [x] Focused Node tests pass.
- [x] Sami reviewer `PASS`.
- [ ] Nada `ARCH_OK`.
- [ ] Hakam `MERGE_OK`.
- [ ] Rashed freshness, strategic fit, and merge decision.

## PR #43 gates

- [ ] Static President trust contract passes on exact head.
- [ ] Desktop and mobile President journey passes on exact head.
- [ ] Invalid/incomplete review packets remain hidden.
- [ ] Direct D4 worker channel remains hidden or routed to Rashed.
- [ ] Vercel Preview metadata commit equals exact PR head.
- [ ] Rashed leadership contracts and blueprint revision remain internally consistent.
- [ ] Sara issues `PASS_TO_REVIEW`.
- [ ] Hakam issues `MERGE_OK`.
- [ ] Rashed personally inspects the diff, evidence, leadership behavior, and Preview.

## Next strategic initiatives — to be delegated by Rashed, not implemented by the manager

These are documented candidates, not active code assignments until the current cycle closes and Rashed publishes bounded tasks:

1. `future-president-signal-summary` — lightweight cursor/summary so unchanged President input is not repeatedly read or analysed.
2. `future-editable-blueprint` — team implementation of the President-editable visual strategy/initiative whiteboard with amendment reconciliation.
3. `future-president-return-brief` — curated outcomes, Rashed decisions, roadmap changes, risks, and at most three President attention items.

Rashed selects sequence after evidence review; workers implement each as separate bounded artifacts with independent review.

## Deltas

- Expected `legacy-debt delta`: `unchanged`.
- `migration-gate delta`: Slice 1 executable contract remains under review.
- `blueprint delta`: revision `2 → 3`; Rashed leadership and future team initiatives documented.
- Governance delta: President absence now activates delegated leadership rather than passive waiting.

## Human gates

No PR #35 merge, `main`, Production, game-rule change, secrets, authentication, destructive schema/data work, material recurring cost, major irreversible deletion, or Production President-channel enablement without Ahmad's explicit authorization for that exact action.
