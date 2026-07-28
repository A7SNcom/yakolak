# Yakolak Architecture Debt Register

This register records structural debt that repeatedly causes defects. It is not a backlog of cosmetic cleanup.

| ID | Debt | Evidence | Consequence | Exit condition | Status |
|---|---|---|---|---|---|
| ARCH-001 | Monolithic legacy runtime owns rules, rendering, input, camera, UI, timers and tutorial | `src/app-game-v085.js` | unrelated changes collide; testing requires browser/runtime internals | game rules and state transitions extracted behind tested contracts | OPEN |
| ARCH-002 | Runtime source files are fetched as text and patched by exact strings/regex | `src/app-game-v112.js`, `src/app-game-v114.js` | harmless source edits break later builds; failures occur at runtime | no active bootstrap depends on source-text replacement | OPEN |
| ARCH-003 | Blob modules and relative imports | legacy wrappers and prior Build 124 import failure | module resolution and debugging failures | stable ES-module imports only | OPEN |
| ARCH-004 | Hidden globals are integration contracts | `globalThis.__yakolakGame` and related markers | previews/features depend on private mutable internals | typed public adapters and snapshots replace globals | OPEN |
| ARCH-005 | State is mutated directly by multiple presentation paths | legacy game and D4 preview state mutation | stale keys such as `currentIndex`, impossible combinations, preview/runtime drift | one reducer/state machine owns transitions | OPEN |
| ARCH-006 | Local, online and preview behavior can diverge | versioned rules/client/preview adapters | reconnect, turn and result regressions recur | shared commands/results and parity replay tests | OPEN |
| ARCH-007 | Version numbers are encoded in source filenames and wrapper chains | `app-game-vNNN.js`, multiple stacked PRs | branch ambiguity and layer accumulation | one canonical entry; releases represented by tags/metadata | OPEN |
| ARCH-008 | Correct vNext architecture exists only on an isolated draft branch | PR #29 | agents keep repairing legacy architecture instead of migrating | active integration contains and enforces canonical architecture roadmap | IN PROGRESS |
| ARCH-009 | Many stacked draft PRs obscure the release lineage | PRs #28-#36 | agents can use the wrong base or revive superseded work | one active integration path and explicit superseded/archive decisions | OPEN |
| ARCH-010 | Tests mostly verify named builds rather than architectural invariants | package scripts and version workflows | green CI may preserve layers rather than prevent new debt | architecture guardrail + headless core/replay tests required | IN PROGRESS |

## Rules

- Every implementation PR states which debt IDs it improves, preserves, or increases.
- Increasing debt requires explicit user authorization and a removal task.
- The manager reports `legacy-debt delta` and `migration-gate delta` each cycle.
- Hakam rejects a task that creates unregistered structural debt.
