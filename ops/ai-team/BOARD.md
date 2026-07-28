# Yakolak AI Team Board

## Active cycle
- Cycle: `001-hardening`
- Manager: Rashed
- Auditor: Hakam
- Integration branch: `agent/yakolak-team-os`
- Source branch under review: `agent/developer-d2-workbench`
- Product release branch: `main` (human gate)
- Observed source head: `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`
- Observed integration head before process hardening: `fbadc7de98303651c0e4f8c96117c602b59c23bf`
- Snapshot evidence time: `2026-07-28T16:16Z`
- Cycle objective: close the only current shared CI failure and advance three bounded P0 D4 contracts without overlap, while independently mapping online, release, test, and governance risks.

## Current verified state
At source head `d8d2a50f...`:
- Green: v112, v118, v125, Build 126, Developer D3, and D4 journey audit.
- Failing: Developer D1 run `30377398315`, job `90336466217`, first failure at `Verify D1 structure and syntax`.
- The old bootstrap claim that all shared game workflows fail is stale and must not be reused.

## Capacity
- Code writers: Noor (S=2), Lina (M=3), Mazen (M=3) = **3 writers / 8 points**.
- Independent non-code work: Sami, Nada, Omar, Sara, Hakam = **5 workers**.
- No L tasks. Every implementation has a separate reviewer and Hakam final audit.

## Active assignments
| Worker | Task | Type | Effort | Owned scope | Independent reviewer | Expected output |
|---|---|---:|---:|---|---|---|
| Noor | `YAK-001-01` | IMPLEMENT | S/2 | earliest D1 structure failure only | Sami | draft PR |
| Sami | `YAK-001-02` | REVIEW | S/2 | D1 failure + Noor diff, read-only | — | review verdict |
| Lina | `YAK-001-03` | IMPLEMENT | M/3 | D4 wrapper/import contract only | Nada | draft PR |
| Mazen | `YAK-001-04` | IMPLEMENT | M/3 | player-count/turn preview contract only | Sara | draft PR |
| Nada | `YAK-001-05` | REVIEW/RESEARCH | S/2 | wrapper risk + native online seam, read-only | — | design/review matrix |
| Omar | `YAK-001-06` | REVIEW | S/2 | branch/PR lineage, read-only | — | integration map |
| Sara | `YAK-001-07` | TEST/REVIEW | M/3 | Mazen diff + release coverage, read-only | — | test verdict/matrix |
| Hakam | `YAK-001-08` | AUDIT | M/3 | entire cycle, read-only | — | scores + merge verdicts |

## File locks
- D1 verifier/fixture earliest-root files: Noor. Sami is read-only.
- `src/app-game-developer-d4.js` and one focused import verifier: Lina. Nada is read-only.
- `src/developer-d4-registry.js`, player/turn portions of `src/developer-scene-d4-states.js`, and D4 contract assertions: Mazen. Sara is read-only.
- Online lifecycle implementation remains unowned for writing this cycle.
- Coordination/system files: Rashed only; Hakam may write only Hakam's report block.

## Change budgets
- Noor: at most 2 tightly related files / 80 logical changed lines. Fix only the earliest D1 root cause; no workflow weakening.
- Lina: at most 3 files / 160 logical changed lines. No production entry changes.
- Mazen: at most 3 files / 180 logical changed lines. No online lifecycle redesign.
- Exceeding budget requires `BLOCKED: split required`, not silent expansion.

## Release gates
- [ ] Developer D1 regression passes without skip/weakening.
- [x] Retained D3 fixture verifier passes at current source head.
- [x] Active D4 shell/contract path reaches green shared regressions at current source head.
- [x] v112, v118, v125, and Build 126 regressions pass at current source head.
- [ ] Game and online hooks load without Blob-relative import errors.
- [ ] 2/3/4-player and all four turn variants use runtime-correct state.
- [ ] Native online lifecycle previews are deterministic.
- [ ] Strict D4 journey audit passes.
- [ ] Desktop and mobile evidence attached for critical variants.
- [ ] Real two-client online evidence exists for lifecycle/reconnect work.
- [ ] Hakam issues `MERGE_OK` for each integration PR.
- [ ] User explicitly authorizes any release action.

## Manager review queue
1. Confirm every task file matches this board and current integration head.
2. Reject stale-base or over-budget reports.
3. Require Sami/Nada/Sara review evidence before Hakam audit.
4. Require Hakam score >=85 and `MERGE_OK` before any worker PR merge.
5. Merge only to `agent/yakolak-team-os`; no PR #35/main/production action.
6. Refresh HISTORY only after verified results.

## Known blockers and risks
- Developer D1 has one current structural failure; exact assertion must be taken from current logs/reproduction, not guessed.
- PR #35 remains a layered draft PR against `agent/developer-d1-scene-gallery`, not a production release PR.
- Vercel free-plan deployment limits have fluctuated; live preview state must be verified when needed.
- Multiple historical draft PRs can mislead agents about the active runtime line.
- Current D4 P0 gaps still include Blob import resolution, three-player/turnIndex correctness, and native online dialog lifecycle.
