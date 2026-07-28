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
- OBSERVED: PR #47 exact head `f3e5dd72d8d118584a6db2244aa7ce71acfd0ce7` is non-mergeable against the moved `agent/yakolak-team-os` base. Rashed opened draft PR #49 from current Team OS head into `agent/president-development-os`; GitHub reports five changed coordination files and merge conflicts. No matching exact-head Vercel deployment exists.
- Single outcome: make PR #49 mergeable by resolving only its synchronization conflicts while preserving both the current Team OS evidence/contracts and the President Development OS files/behavior.
- Why now: PR #47 cannot receive trustworthy exact-head Preview, Sara evidence, Hakam audit or manager PASS while its base is stale and synchronization conflicts remain.
- Base branch: `agent/yakolak-team-os` at or after `0d1d6e233d60a23d90ef82943effd2db12e735ae`.
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
- Stop conditions: PR #49 or either parent head moves materially; conflict touches product/runtime files; preserving both truths requires architectural redesign; required files/evidence unavailable; any human gate appears.
- Expected artifact: one bounded synchronization branch/draft PR or a precise `BLOCKED` report identifying the irreconcilable file/section; worker report must include blueprint node/revision, exact heads, changed paths, validations, blocker/gate delta and next action for Rashed's ledger.
- Context links: `ops/ai-team/BOARD.md`, PR #47, PR #49, `ops/ai-team/PRESIDENT_PORTAL.md`, `ops/ai-team/development-blueprint.json`, `ops/ai-team/development-ledger.json`.
<!-- MANAGER TASK:END -->

<!-- WORKER REPORT:START -->
## Worker report
- Result: `PENDING`
- Summary: —
- Observed head / freshness: —
- Evidence inspected: —
- Runtime contract map: —
- Deterministic assertions: —
- Residual risks: —
- Recommended next task: —
- Team note: —
<!-- WORKER REPORT:END -->