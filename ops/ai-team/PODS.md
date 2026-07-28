# Yakolak Hourly Pods

The platform allows five active scheduled tasks. Yakolak therefore uses one manager automation and four worker-pod automations while preserving separate named employees, tasks, branches, and reports.

## Schedule (Asia/Riyadh)
- `00` — Rashed manager cycle.
- `08` — Pod A: Noor, then Sami.
- `18` — Pod B: Lina, then Mazen.
- `28` — Pod C: Nada, then Omar.
- `42` — Pod D: Sara, then Hakam.

## Pod execution contract
For each named employee, sequentially:
1. Read that employee's file first.
2. Read `AGENTS.md`, `TEAM_OS.md`, and only task-linked context.
3. Execute exactly one task for that employee.
4. Use that employee's own branch and PR for implementation.
5. Update only that employee's `WORKER REPORT` block.
6. Stop that identity before starting the next employee.
7. Re-read the integration branch head and `BOARD.md` before the second employee to detect collisions or manager changes.

A pod is scheduling compression, not shared identity. Evidence, task scope, branch, report, and evaluation remain separate.

## Failure isolation
- If the first employee is blocked or fails, report it and continue the second employee only when their task is independent.
- If the first employee changes a file or branch needed by the second, the second must report `BLOCKED: ownership moved`.
- Never combine two worker tasks into one PR or one report.
- Never transfer unverified conclusions from one employee to another as facts.

## Pod mapping
- Pod A: Noor + Sami. Preferred pattern: implementer plus independent reviewer of the same bounded area.
- Pod B: Lina + Mazen. Tasks must own disjoint files and contracts.
- Pod C: Nada + Omar. Preferred for research, architecture, product-state mapping, and repository lineage.
- Pod D: Sara + Hakam. Sara verifies product/test evidence; Hakam independently evaluates the full manager cycle and may veto merges.

These are scheduling pairings, not permanent technical roles. Rashed may change task types, but Hakam always remains independent and read-only.
