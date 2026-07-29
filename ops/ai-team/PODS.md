# Yakolak Hourly Pods

The scheduling platform permits five active tasks. Yakolak therefore uses one manager automation and four pod automations while preserving separate named employees, contracts, branches, reports, evidence, and evaluations.

Pods compress scheduling only. They do not combine identities or guarantee that every employee receives work.

## Schedule — Asia/Riyadh

- `00` — Rashed manager cycle.
- `08` — Pod A: Noor, then Sami.
- `18` — Pod B: Lina, then Mazen.
- `28` — Pod C: Nada, then Omar.
- `42` — Pod D: Sara, then Hakam.

## Pod execution contract

For each named employee, sequentially:

1. Open that employee's file first.
2. Read `AGENTS.md`, `TEAM_OS.md`, `PROMPT_STANDARD.md`, and only linked context.
3. Verify the task status, current heads, premise, locks, architecture direction, and artifacts.
4. If status is `NO_TASK`, do not edit project files, create a branch, or invent a report; stop that identity cleanly.
5. If status is `HOLD`, inspect only the stated prerequisite if requested; otherwise stop.
6. If `READY`, execute exactly one task for that employee.
7. Use the employee's own branch/PR for implementation.
8. Update only that employee's report block.
9. End the identity completely before starting the second employee.
10. Re-read integration head, `BOARD.md`, locks, open PRs, and the second employee's premise before continuing.

The second employee must not inherit conclusions, memory, authority, or unverified claims from the first.

## Failure isolation

- A blocked/failed first task does not block the second when scopes and premises are independent.
- If the first task changes a dependency or owned file needed by the second, the second reports `BLOCKED: ownership/premise moved`.
- Never combine two tasks into one PR, one report, or one evidence claim.
- Never turn a missing implementation artifact into a review artifact; reviewers may evaluate the baseline only and report `NO_ARTIFACT`.
- Architecture, regression, or human-gate failure stops implementation immediately.

## Pairing guidance

- Pod A: preferred bounded implementer + independent reviewer of the same area.
- Pod B: preferred two disjoint migration slices, or implementer + architecture reviewer. Never parallel edits on one slice.
- Pod C: preferred architecture/research/lineage work only when it unlocks a named next decision; otherwise `NO_TASK`.
- Pod D: Sara handles test/evidence work only when a real baseline/artifact exists; Hakam independently audits meaningful cycle evidence and uses `NO_CHANGE` when nothing changed.

These pairings are not permanent specialties. Rashed may vary task types based on capability evidence. Hakam always remains independent and read-only.

## Capacity safety

The automation schedule does not imply eight active tasks. Default cycle capacity is:

- zero to two implementation employees;
- up to five code-effort points;
- only necessary reviewers/stewards;
- remaining employees `NO_TASK`.

Idle automation runs are safer and cheaper than manufactured repository work.

## Development task feed

- Rashed selects the single ordered task in progress. When none exists, he chooses the first planned task in the President's order, adjusted only for a clearly higher urgent priority.
- Rashed records each pod assignment as a short `delegation` entry in that task's work feed. He does not implement the assignment.
- Each pod reads only its newest unanswered assignment and records factual `update` entries under the named worker identity.
- President/Rashed comments remain separate from the work feed. Workers cannot write to the President channel or change task status/order.
- Rashed moves verified work to review. Only President Ahmad can approve `done`.
