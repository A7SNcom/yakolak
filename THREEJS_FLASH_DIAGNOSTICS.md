# THREEJS-043 — Public-safe FLASH diagnostic harness

Status: **LOCKED by THREEJS-043 (2026-08-20)**

THREEJS-043 provides deterministic repository/manual diagnostics for the Three.js gameplay rebuild. It is deliberately **not** a hidden game mode, not an online-room client, and not a second gameplay authority.

Every run identifies itself as:

`FLASH DIAGNOSTIC — NOT A LIVE ROOM`

## Repository-only boundary

All executable diagnostic material lives only under paths already forbidden by PAGES-009:

- `tests/fixtures/threejs_flash_fixtures.mjs`
- `tests/threejs_flash_diagnostic_contract.test.mjs`
- `scripts/run-threejs-flash-diagnostics.mjs`

PAGES-009 rejects both `tests/` and `scripts/` if either appears anywhere in the composed Pages artifact. THREEJS-043 adds no file under `web/`, no production import, no visible debug button and no runtime query/hash flag that can enable diagnostics in the public game.

The diagnostic contract also declares:

- `diagnosticOnly = true`
- `authoritativeOnline = false`
- `networkCapability = none`
- `persistenceCapability = none`
- `roomMutationCapability = none`
- `productionUiEntryPoint = false`
- `pagesArtifactAllowed = false`

The runner accepts no room code, invitation, endpoint, credential, bearer token or admin option.

## Real gameplay modules only

Fixture state is always created through THREEJS-045 `createCanonicalSessionState(...)` and validated as canonical state.

Placement legality uses THREEJS-046 `validatePlacementForSeat(...)`.

Move scenarios use the in-memory local authority adapter used by play. That adapter consumes the same shared THREEJS-044/046 rules package and canonical session modules.

For move fixtures, the harness additionally invokes THREEJS-044 `applyMoveTransition(...)` as a **parity oracle** and compares its board, last-move semantics and scores against the canonical local-authority result. The older transition projection never becomes authoritative and is not exposed as a room/session.

Fixture code contains no copied rule table, winning-line implementation, inventory algorithm or placement validator. Scenario rows are input data only; legality, wins, draws and stock exhaustion are proved by the shared modules.

## Deterministic fixtures

The harness covers:

1. **Setup** — valid THREEJS-045 setup state.
2. **2-seat** — valid local turn-loop state plus a 046 legality probe.
3. **3-seat** — same canonical path with three configured seats.
4. **4-seat** — same canonical path with four configured seats.
5. **Near-win** — two committed marble medium slots; the diagnostic move is validated by 046 and submitted through local authority. The result must be a real `round-win`, with 044 parity.
6. **Draw** — one deterministic no-win near-exhausted position. The final legal move is validated and submitted through authority; shared rules prove neither configured color has a winning pattern or legal move afterward, and the result must be a real canonical draw. The arrangement is fixture input data, not embedded rule logic.
7. **Timeout** — a fixed expired authoritative deadline creates the real local timeout intent and submits it through the local authority adapter.
8. **Reconnect** — THREEJS-060 lifecycle `RECONNECT` interrupt, canonical serialize/parse hydration, then the real `RECOVER` transition. Board/revision remain canonical while presentation generation advances.
9. **Match end** — a canonical near-threshold score plus the same accepted near-win path reaches `match-win`, then the real `commitCanonicalMatchEnd(...)` moves the lifecycle through reset to `MATCH_END`.
10. **WebGL recovery** — THREEJS-060 `CONTEXT_LOST` interrupt followed by canonical hydration and real `RECOVER`; gameplay state is not mutated by presentation recovery.

All clocks and fixture inputs are fixed. No fixture reads wall-clock time, network state, local storage or environment secrets.

## No live-room capability

The fixture/runner source imports no online session client, public runtime API origin, rooms transport or network submission adapter. It calls no `fetch`, WebSocket, XMLHttpRequest or EventSource.

The only authority implementation instantiated by the harness is `createLocalAuthorityAdapter(...)`, operating entirely in memory with human/computer fixture seats. No fixture contains an online seat.

This makes a diagnostic fixture impossible to mistake for, join, restore or mutate an authoritative online room.

## PAGES-009 proof

`tests/threejs_flash_diagnostic_contract.test.mjs` checks the existing public-artifact scanner still forbids `scripts/` and `tests/`. On non-Windows systems it also invokes the scanner against a temporary artifact containing a diagnostic `tests/` path and requires rejection.

The same contract scans production `web/` text files and fails if any file references the FLASH fixture schema, runner or diagnostic label.

No weakening or exception is added to `scripts/pages-public-artifact-scan.sh`.

## Manual runner

Run:

`node scripts/run-threejs-flash-diagnostics.mjs`

The first line explicitly identifies the process as a non-live diagnostic. On success it prints a compact JSON summary of the canonical fixture outcomes followed by:

`THREEJS-043 FLASH diagnostics: PASS`

## Regression verification

Run:

- `node --test tests/threejs_flash_diagnostic_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract validates all requested scenarios, 044/045/046 ownership, local-only authority, reconnect/WebGL lifecycle recovery, match-end commitment, no copied rules, no network/admin/secret capability, no production UI entry point, and the unchanged PAGES-009 exclusion boundary.
