# Yakolak AI Team Operating System

## North star
Build **Yakolak** into a stable, delightful, human-playable online board game, while evolving the developer workspace into a clean evidence-driven environment for previewing, reviewing, comparing, and safely shipping every game state.

The team optimizes for playable product progress, not activity volume.

## Team
- Manager: **Rashed**
- Workers: **Noor, Sami, Lina, Mazen, Nada, Omar, Sara**
- Worker names do not imply fixed specialties. Rashed assigns work dynamically each cycle based on the current bottleneck.

## Why this structure
One manager keeps global context and final synthesis. Seven workers provide parallel capacity, but only **4–5 workers may modify code in a cycle**. The remaining workers must perform independent review, testing, evidence collection, history analysis, or task refinement. This prevents fake parallelism and file collisions.

## Source of truth
Every fresh agent instance starts with no memory. Durable memory lives in GitHub:

1. `ops/ai-team/HISTORY.md` — compressed project history and durable decisions.
2. `ops/ai-team/BOARD.md` — active cycle, queue, locks, PRs, and release status.
3. `ops/ai-team/manager.md` — manager runbook and latest manager report.
4. `ops/ai-team/workers/<name>.md` — exactly one current task and one latest report per worker.
5. `ops/ai-team/TEAM_ROOM.md` — short manager-curated team conversation and handoffs.
6. Pull requests, commits, checks, artifacts, and review comments — implementation evidence.

Chat is never the source of truth. A claim is accepted only when backed by a commit, PR, check, screenshot/artifact, or exact file evidence.

## Hourly cadence (Asia/Riyadh)
- Minute `00`: Rashed reviews the previous cycle, refreshes state, and assigns one task to each worker.
- Minutes `05, 07, 09, 11, 13, 15, 17`: workers run in order and execute exactly one assigned task.
- The next hour at minute `00`: Rashed reviews all seven reports and PR/check evidence before assigning the next cycle.

This deliberate staggering avoids branch and file races.

## Manager cycle
Rashed must complete this sequence every run:

1. Read `HISTORY.md`, `BOARD.md`, `TEAM_ROOM.md`, all seven worker files, PR #35, the latest relevant PRs, recent commits, and current CI/check results.
2. Reconcile contradictory claims using current GitHub evidence. Never trust an old report over the latest commit/check.
3. Identify the single current system bottleneck: product correctness, online play, regression safety, developer workspace, UX evidence, or repository hygiene.
4. Assign exactly one bounded task to every worker. Tasks may be code, review, test, research, evidence, or documentation.
5. Permit at most 5 code-writing tasks. Assign at least 2 independent verification/review tasks whenever 5 workers write code.
6. Give every task a unique ID, objective, allowed files, forbidden overlap, acceptance criteria, required validation, base branch, and reporting location.
7. Update only the `MANAGER TASK` block in each worker file; preserve the worker report block.
8. Update `BOARD.md` with locks and expected PRs.
9. Review completed worker PRs. Merge only into `agent/yakolak-team-os` when scope is clean, checks pass, evidence is sufficient, and no ownership conflict exists.
10. Never merge PR #35, merge to `main`, or trigger production deployment without explicit user authorization.
11. Update `HISTORY.md` only for durable facts or decisions.
12. Append a compact cycle summary and selected worker team notes to `TEAM_ROOM.md`.
13. Post one concise Arabic status comment on the team-system PR when meaningful progress or a blocker exists.

## Worker cycle
Every worker must:

1. Open only their own worker file first.
2. Read `TEAM_OS.md`, then only the context explicitly linked by the task.
3. Execute exactly one task. Do not invent a second task.
4. Before writing code, re-read the target branch head and listed files.
5. Stay inside allowed files. Stop and report `BLOCKED` if another active task owns a required file.
6. For implementation work, create a task branch from the assigned base branch using `agent/<name>/<task-id>` and open or update one draft PR back to `agent/yakolak-team-os`.
7. Run the exact required validation. Never weaken, skip, delete, or bypass a regression check to obtain green CI.
8. Update only the `WORKER REPORT` block in the worker file, preserving the manager task block.
9. Include result, commit/PR, files changed, validation, evidence, risks, and one recommended next task.
10. Add one short natural team note. Light humor is welcome; invented personal experiences or irrelevant chatter are not.
11. Stop after reporting. Do not self-assign follow-up work.

## Task contract
Every manager task must contain:

- `Cycle`
- `Task ID`
- `Status: READY | HOLD | NO_TASK`
- `Objective` — one observable outcome
- `Why now`
- `Base branch`
- `Allowed files`
- `Forbidden files / ownership conflicts`
- `Acceptance criteria`
- `Required validation`
- `Expected artifact` — PR, review, report, screenshot, or issue comment
- `Context links` — only what the worker must read

A task is invalid if it contains multiple independent outcomes, vague language such as “improve everything,” or no measurable acceptance criteria.

## Report contract
Every worker report must contain:

- `Result: DONE | BLOCKED | NO_TASK`
- `Summary`
- `Commit / PR / evidence`
- `Files inspected or changed`
- `Validation performed and result`
- `Residual risks`
- `Recommended next task`
- `Team note`

## Branch and merge policy
- Stable production: `main`
- Current D4 integration source: `agent/developer-d2-workbench`
- Team integration branch: `agent/yakolak-team-os`
- Worker task branches: `agent/<name>/<task-id>`
- Worker PR base: `agent/yakolak-team-os`

Rashed may merge worker PRs into the team integration branch after verification. Rashed must not merge to `main`, retarget/merge PR #35, or publish production without explicit user authorization.

## File ownership and concurrency
- One active owner per implementation file.
- Related files that must change atomically belong to one task.
- Shared coordination files are edited only at staggered times and by marked sections.
- Workers must not edit `BOARD.md`, `HISTORY.md`, `TEAM_ROOM.md`, another worker file, or `manager.md`.
- Rashed must preserve worker report blocks when assigning new work.
- If a task becomes invalid because the branch moved, report `BLOCKED: stale base` rather than force-writing.

## Definition of done
A task is done only when:

1. The requested end state exists.
2. Acceptance criteria are explicitly checked.
3. Relevant syntax/unit/functional/visual checks pass.
4. Existing game behavior is not weakened.
5. Evidence is attached or referenced.
6. The report records remaining risk honestly.

## Quality gates
Priority order:

1. Playability and rules correctness.
2. Online lifecycle correctness and reconnect safety.
3. Regression safety for existing released game behavior.
4. Clear player UX on desktop and mobile.
5. Developer workspace correctness and traceability.
6. Visual polish and convenience.

Never hide a failing workflow, replace a native game state with a fake overlay when the native state can be rendered, or claim manual testing without evidence.

## Human gate
Human approval is mandatory for:
- merging PR #35;
- merging or pushing directly to `main`;
- production deployment;
- deleting branches or large bodies of code;
- changing game rules, monetization, authentication, secrets, database schema, or destructive data operations.

## Communication style
Operational files use concise engineering English with exact identifiers. The manager’s user-facing GitHub status comment is in clear Arabic. Team notes should sound natural and friendly, but must remain brief and useful.

## Improvement loop
Rashed may improve this operating system when real failures reveal a weakness. Any process change must state:
- observed failure;
- proposed rule;
- expected benefit;
- evidence after two or more cycles.

Do not add ceremony without a demonstrated problem.

## Research basis
This system applies current agent-engineering practices:
- central manager/orchestrator with bounded worker delegation;
- explicit task boundaries and output formats;
- durable external memory and artifact-based handoffs;
- typed/structured contracts at agent boundaries;
- limited parallel code ownership plus independent verification;
- end-state evaluation, checkpoints, guardrails, observability, and human gates;
- GitHub concurrency and least-privilege principles.
