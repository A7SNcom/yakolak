# Yakolak AI Team Board

## Active cycle
- Cycle: `000-bootstrap`
- Manager: Rashed
- Integration branch: `agent/yakolak-team-os`
- Source branch under review: `agent/developer-d2-workbench`
- Product release branch: `main` (human gate)
- Cycle objective: establish evidence for the current P0 path and prepare small non-overlapping fixes.

## Current bottleneck
The D4 branch cannot be treated as release-ready while shared CI is failing/skipped and native preview correctness remains unproven.

## Active assignments
| Worker | Task | Mode | Owned files | Expected output |
|---|---|---|---|---|
| Noor | `YAK-000-01` | implementation | D3/D4 verifier and workflow contract only | draft PR |
| Sami | `YAK-000-02` | independent review | read-only CI/history | failure map report |
| Lina | `YAK-000-03` | implementation | D4 game wrapper/import contract only | draft PR |
| Mazen | `YAK-000-04` | implementation | player/turn preview contract only | draft PR |
| Nada | `YAK-000-05` | design review | read-only online lifecycle | deterministic fixture plan |
| Omar | `YAK-000-06` | repository review | read-only PR/branch history | integration map |
| Sara | `YAK-000-07` | test review | read-only test/evidence suite | coverage matrix |

## File locks
- CI/verifier files: Noor
- `src/app-game-developer-d4.js` and its direct wrapper test: Lina
- `src/developer-d4-registry.js` plus player/turn-only state paths: Mazen
- Online-state implementation files remain unowned for writing in bootstrap; Nada is read-only.

## Release gates
- [ ] D1 regression runs; no branch skip.
- [ ] Retained D3 fixture verifier passes.
- [ ] Active D4 shell and contract verifiers pass.
- [ ] v112, v118, v125, and Build 126 regression workflows pass.
- [ ] Game and online hooks load without Blob-relative import errors.
- [ ] 2/3/4-player and all four turn variants use runtime-correct state.
- [ ] Native online lifecycle previews are deterministic.
- [ ] Strict D4 journey audit passes.
- [ ] Desktop and mobile evidence attached.
- [ ] User explicitly authorizes release action.

## Manager review queue
1. Review all bootstrap worker reports.
2. Accept at most one solution per owned file area.
3. Rebase worker branches on the latest team integration head before merge.
4. Merge only green, bounded PRs into `agent/yakolak-team-os`.
5. Refresh `HISTORY.md` after verified durable changes.

## Known blockers
- Current PR #35 head has multiple shared CI failures and one skipped regression workflow.
- Vercel preview availability has fluctuated due free-plan build limits; verify live state each cycle.
- PR #35 targets a layered branch, not `main`; release path must be made explicit later.
