# Yakolak AI Team Board

## Active cycle
- Cycle: `002-evidence-first`
- Manager: Rashed
- Auditor: Hakam
- Integration branch: `agent/yakolak-team-os`
- Source branch under review: `agent/developer-d2-workbench`
- Product release branch: `main` (human gate)
- Observed source/PR #35 head: `d8d2a50f4a604dc4ba95c5ef762a66ffa7fb92c2`
- Observed integration/PR #36 head: `b5279840c52722d60c69069e7f05e05dd458cda0`
- Snapshot evidence time: `2026-07-28T17:01Z`
- Current checks: `Verify AI Team OS` run `30379953601` succeeded on the integration head; Vercel status is failing from the free-plan build-rate limit on both source and integration heads. Prior source regression evidence remains v112/v118/v125/Build126/D3/D4-audit green and D1 run `30377398315` failing until freshly reproduced.
- Open implementation worker PRs: none found from cycle 001.
- Prior Hakam verdict: manager `91/100 PASS`; all implementation tasks `HOLD`; PR #36 `HOLD`; no `MERGE_OK`.
- Cycle bottleneck: establish a trustworthy developer-preview baseline by producing small verifiable artifacts for D1 integrity and D4 module loading before broader state or online work.

## Capacity
- Code writers: Noor `S=2`, Lina `S=2` = **2 writers / 4 points**.
- Independent non-code work: Sami, Mazen, Nada, Omar, Sara, Hakam = **6 workers**.
- No L tasks. Every implementation has an independent reviewer and Hakam final audit.

## Active assignments
| Worker | Task | Type | Effort | Owned scope | Independent reviewer | Expected output |
|---|---|---:|---:|---|---|---|
| Noor | `YAK-002-01` | INCIDENT/IMPLEMENT | S/2 | earliest D1 failure only | Sami | bounded draft PR or exact BLOCKED report |
| Sami | `YAK-002-02` | REVIEW | S/2 | D1 evidence and Noor diff, read-only | — | independent verdict |
| Lina | `YAK-002-03` | IMPLEMENT | S/2 | D4 wrapper import resolution only | Nada | bounded draft PR or exact BLOCKED report |
| Nada | `YAK-002-04` | REVIEW | S/2 | Lina diff and load contract, read-only | — | independent verdict |
| Mazen | `YAK-002-05` | RESEARCH | S/2 | real player/turn runtime contract, read-only | — | implementation-ready contract map |
| Sara | `YAK-002-06` | TEST/REVIEW | S/2 | independent false-green test design, read-only | — | executable evidence matrix |
| Omar | `YAK-002-07` | REVIEW | XS/1 | current branch/PR lineage only | — | concise active-line map |
| Hakam | `YAK-002-08` | AUDIT | M/3 | entire cycle, read-only | — | scores and merge verdicts |

## File locks
- D1 verifier/fixture root cause: Noor; Sami read-only.
- `src/app-game-developer-d4.js` plus one focused verifier: Lina; Nada read-only.
- Player/turn runtime, D4 registry/state, and related tests: Mazen and Sara read-only this cycle; no writer owns them.
- Online lifecycle implementation remains unowned.
- Coordination files: Rashed only; Hakam may write only Hakam's report block.

## Change budgets
- Noor: at most 2 tightly related files / 80 logical changed lines.
- Lina: at most 2 tightly related files / 80 logical changed lines.
- All other assignments are read-only except their own report block.
- Any implementation without a draft PR/commit by Hakam audit time is `NO_ARTIFACT`, not partial completion.

## Release gates
- [ ] Developer D1 regression passes without weakened coverage.
- [x] Verify AI Team OS run `30379953601` passes.
- [x] Prior retained D3 and active D4 audit evidence is green at source head.
- [ ] Game and online hooks load without Blob-relative import errors.
- [ ] 2/3/4-player and all four turn variants have deterministic runtime-correct evidence.
- [ ] Native online lifecycle previews are deterministic.
- [ ] Strict D4 journey audit passes.
- [ ] Desktop/mobile evidence exists for critical variants.
- [ ] Real two-client evidence exists for lifecycle/reconnect changes.
- [ ] Hakam issues `MERGE_OK` for each worker integration PR.
- [ ] User explicitly authorizes any release action.

## Manager review queue
1. Treat cycle-001 missing artifacts as `NO_ARTIFACT`; do not claim partial progress.
2. Require exact fresh reproduction before either implementation writes.
3. Require Sami/Nada reviewer evidence before Hakam audit.
4. Merge nothing unless Hakam issues `MERGE_OK`; currently no merge is authorized.
5. No PR #35/main/production action.

## Known blockers and risks
- D1's previous failure must be freshly reproduced; old logs are context, not proof of the current root cause.
- D4 preview still uses layered wrapper logic and may fail module resolution from Blob URLs.
- Static URL/key tests can falsely pass while rendered player/turn state is wrong.
- Vercel preview checks are rate-limited; browser evidence may need GitHub-hosted or local deterministic alternatives.
- Multiple historical draft PRs remain a lineage hazard.