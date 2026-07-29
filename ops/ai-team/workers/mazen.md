# Mazen

## Permanent instructions

Open `AGENTS.md`, `ops/ai-team/TEAM_OS.md`, then execute exactly the one task below. You are a flexible generalist; the assignment is temporary.

Do not create work when the manager assigns `NO_TASK`. Stop without repository writes.

<!-- MANAGER TASK:START -->
## Manager task
- Cycle: `006-correction-closure`
- Task ID: `YAK-006-08`
- Status: `READY`
- Task type: `INTEGRATION_MAINTENANCE`
- Effort: `M (3 points)`
- Risk: `high-governance-traceability`
- OBSERVED: at manager refresh, PR #49 base is `agent/president-development-os` @ `f3e5dd72d8d118584a6db2244aa7ce71acfd0ce7`; its Team OS head was refreshed through `4bef6fff31393ceceeab34e19b2ebe1bbebdc766`. GitHub still reports PR #49 open, draft and non-mergeable with five coordination files. PR #47 remains non-mergeable and no matching exact-head READY Vercel deployment exists.
- Single outcome: make PR #49 mergeable by resolving only its synchronization conflicts while preserving both the current Team OS evidence/contracts and the President Development OS files/behavior.
- Why now: PR #47 cannot receive trustworthy exact-head Preview, Sara evidence, Hakam audit or manager PASS while its base is stale and synchronization conflicts remain.
- Base branch: re-fetch PR #49 immediately before work; use its then-current exact Team OS head only if it is at or after `4bef6fff31393ceceeab34e19b2ebe1bbebdc766` and the base remains `f3e5dd72d8d118584a6db2244aa7ce71acfd0ce7`.
- Blueprint node/revision: `track-visual-development` / revision `3`.
- Allowed scope: inspect PR #49 exact diff and conflicts; create `agent/mazen/yak-006-08`; change only the conflicting coordination files reported by PR #49; preserve latest BOARD/manager/worker evidence from integration and all President Development OS contracts; open one draft PR targeting `agent/president-development-os` if direct PR #49 conflict resolution requires a worker branch.
- Forbidden scope: no product/runtime/game files; no public write API activation; no stable alias change; no `main`, Production, PR #35, rules, secrets, auth/schema, destructive action; no rewriting worker report blocks; no weakening verifier/architecture/trust gates; no merge.
- Change budget: at most five coordination files / 220 logical changed lines excluding conflict-marker removal.
- Acceptance criteria:
  1. All conflict markers are removed and the resulting branch is mergeable into `agent/president-development-os`.
  2. Current cycle-006 BOARD assignments, exact worker reports and Hakam verdicts remain intact.
  3. `RASHED_LEADERSHIP_OS.md`, `PRESIDENT_PORTAL.md`, blueprint/ledger contracts and protected stable URL remain intact.
  4. No product/runtime diff is introduced.
  5. `node scripts/verify-ai-team-os.mjs` and `node scripts/verify-president-portal.mjs` both pass on the resolved branch, or the exact pre-existing unrelated failure is reported without weakening.
- Required validation: compare resolved branch against both PR #49 parents; list changed paths; run both verifiers; confirm no product/runtime path changed; report exact head and PR URL.
- Independent reviewer: Omar for coordination/trust-boundary exact-diff review after artifact; Sara remains evidence reviewer only after exact-head deployment.
- Stop conditions: after the initial fresh read, PR #49 or either parent head moves materially; conflict touches product/runtime files; preserving both truths requires architectural redesign; required files/evidence unavailable; any human gate appears.
- Expected artifact: one bounded synchronization branch/draft PR or a precise `BLOCKED` report identifying the irreconcilable file/section; worker report must include blueprint node/revision, exact heads, changed paths, validations, blocker/gate delta and next action for Rashed's ledger.
- Context links: `ops/ai-team/BOARD.md`, PR #47, PR #49, `ops/ai-team/PRESIDENT_PORTAL.md`, `ops/ai-team/development-blueprint.json`, `ops/ai-team/development-ledger.json`.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `BLOCKED_STALE_HEAD`
- Summary: `OBSERVED` PR #49 moved materially after the manager snapshot, so conflict resolution was not started. The board recorded integration head `8bb77c28619b23c7c0a580ff8f6bbb0a52d8f4ee`, while fresh PR #49 metadata reports head `a3a22e4f5b3549a925fc5f3b7b89b66204e81883`; the task explicitly requires stopping when either parent moves.
- Blueprint node/revision: `track-visual-development` / revision `3`.
- Task status / acceptance progress: `BLOCKED`; 0/5 acceptance gates attempted because the freshness prerequisite failed before branch creation or conflict edits.
- Observed heads / evidence: PR #49 base `agent/president-development-os` @ `f3e5dd72d8d118584a6db2244aa7ce71acfd0ce7`; fresh PR #49 head `agent/yakolak-team-os` @ `a3a22e4f5b3549a925fc5f3b7b89b66204e81883`; board snapshot still cites `8bb77c28619b23c7c0a580ff8f6bbb0a52d8f4ee`. PR remains open, draft, non-mergeable, with five changed coordination files.
- Changed paths / validation: `CHANGED` only this worker report block; no product, runtime, coordination-conflict, alias, API, verifier, or portal files were edited. No branch or PR was created. No verifier was run because doing so on a stale premise would not validate the required artifact.
- Blocker / gate delta: PR #49 remains `HOLD`; no gate advanced or weakened. `legacy-debt delta: unchanged`; `migration-gate delta: unchanged`; governance gate remains blocked on a refreshed exact-head contract.
- Residual risks: resolving against the stale snapshot could overwrite newer Team OS evidence or create a misleading mergeable branch.
- Recommended next task: Rashed refreshes BOARD and Mazen's contract with exact PR #49 parent heads and the current five conflict paths; then rerun `YAK-006-08` from those immutable heads.
- Team note: الرأس تحرك، لذلك الوقوف هنا يحمي السجل بدل حل تعارضات على نسخة انتهت. 🛑
<!-- WORKER REPORT:END -->