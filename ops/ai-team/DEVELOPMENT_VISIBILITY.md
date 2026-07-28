# Yakolak Development Visibility Contract

## Purpose

All meaningful Yakolak development must be understandable from the President interface without reconstructing worker files, pull-request chatter, or CI logs.

The canonical visible chain is:

`President intent → blueprint initiative → bounded task → worker checkpoint → reviewer/steward verdict → Hakam audit → Rashed decision → President attention when warranted → outcome/history`

## Sources of truth

- `development-blueprint.json` — strategic intent, initiatives, journeys, dependencies, and revisions.
- `development-ledger.json` — current portfolio, task state, meaningful checkpoints, gates, evidence, decisions, and next action.
- worker files / PRs / checks — detailed evidence behind ledger entries.
- `president-outbox.json` — only curated President review/decision packets.

The ledger does not replace GitHub evidence. It links to it and summarizes it truthfully.

## Ownership

- Rashed is the only normal writer of `development-ledger.json`.
- Workers write their own report blocks and artifacts; they never edit the shared ledger.
- Reviewers, Architecture Stewards, and Hakam publish verdicts in their assigned reports/evidence.
- Rashed reconciles those outputs into the ledger after inspecting the exact evidence.
- The President may amend direction through the portal; Rashed reconciles the amendment before changing the canonical blueprint or affected ledger entries.

## Event-driven reporting

Reporting follows meaningful state changes, not the clock.

A task receives a checkpoint when one of these occurs:

- task assigned or materially re-scoped;
- implementation artifact or testable baseline produced;
- meaningful progress during a multi-cycle task;
- blocker, failure, stale premise, or risk discovered;
- reviewer, Architecture Steward, or Hakam verdict issued;
- CI or Preview evidence changes the decision state;
- Rashed merges, holds, rejects, supersedes, or requests President attention;
- President decision or amendment affects the task.

Do not create an empty hourly checkpoint. If nothing changed, retain the previous event and timestamp.

## Multi-cycle tasks

A task that spans several scheduled cycles must still remain bounded to one observable outcome. Each meaningful worker run reports:

- `phase`;
- verified progress, never guessed percentage;
- what changed since the previous checkpoint;
- exact evidence;
- blocker or residual risk;
- next smallest action.

Rashed converts that report into one ledger event. Work larger than an `M` task is an initiative containing several tasks, not one ten-hour implementation contract.

## Required initiative fields

- stable ID and `blueprintNodeId`;
- outcome and status;
- owner and priority;
- linked task IDs;
- dependencies, risks, and evidence links;
- current recommendation and next management action.

## Required task fields

- task ID, initiative ID, blueprint node/revision;
- title, observable outcome, status, effort, risk;
- implementer, reviewer, Architecture Steward when required, Hakam;
- progress summary based on completed acceptance steps;
- acceptance criteria with explicit state;
- gate states: artifact, reviewer, architecture, Hakam, CI, Preview, manager, President;
- PR/commit/Preview/test links when available;
- append-only meaningful events;
- blocker, next action, and President-attention class.

## Status vocabulary

Initiatives: `proposed | documented | ready | in_progress | blocked | review | completed | superseded`.

Tasks: `documented | ready | in_progress | artifact_ready | review | blocked | held | completed | rejected | superseded`.

Gates: `NOT_REQUIRED | PENDING | PASS | FAIL | HOLD | UNKNOWN` plus role-specific values such as `ARCH_OK`, `MERGE_OK`, and `GREEN`.

## President interface behavior

The interface provides four layers:

1. **Project map** — blueprint nodes and relations, with active work highlighted.
2. **Tasks** — owner, progress, gates, next action, and expandable history.
3. **Timeline** — all meaningful development events across tasks plus President directives/decisions.
4. **Attention queue** — only items that require the President now or are fully gated milestones.

The President can inspect detail, but the interface must not demand attention for ordinary implementation progress.

## Rashed obligations

At each management cycle, Rashed:

1. reads only new President signals and current decision evidence;
2. reconciles worker/reviewer/steward/Hakam outputs;
3. updates the ledger only when a meaningful state changed;
4. ensures every active task links to a current blueprint node/revision;
5. keeps events chronological and evidence-backed;
6. exposes failures and stopped work, not only successes;
7. curates President attention separately from general visibility.

A task is not management-complete until its final ledger state, evidence links, blueprint state, and Rashed decision agree.