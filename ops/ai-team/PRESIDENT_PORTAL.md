# President Portal Contract

## Purpose

`developer.html` is the President's visual leadership interface with Rashed—not a direct worker console and not a requirement that the President attend every hour.

The portal lets the President set direction, amend the plan, inspect **all development**, drill into tasks and evidence, issue decisions, and leave while Rashed continues leading under the standing mandate.

## Roles

- **President:** Ahmad, final product/development authority.
- **Rashed:** sole managerial contact, delegated executive deputy, initiative owner, ledger curator, and team leader.
- **Workers:** execute bounded assignments from Rashed and report in their own evidence surfaces.
- **Reviewer / Architecture Steward / Hakam:** independently verify; they never send raw work directly to the President.

D1/D2/D3/D4 describe workspace generations, not human roles.

## Canonical resources

- President interface: `developer.html`
- President channel API: `/api/developer-president`
- Rashed leadership contract: `ops/ai-team/RASHED_LEADERSHIP_OS.md`
- Visibility/reporting contract: `ops/ai-team/DEVELOPMENT_VISIBILITY.md`
- Canonical visual plan: `ops/ai-team/development-blueprint.json`
- Canonical management projection: `ops/ai-team/development-ledger.json`
- Rashed status/cursor: `ops/ai-team/president-status.json`
- Curated President queue: `ops/ai-team/president-outbox.json`

A Preview is valid only when Vercel metadata matches the exact reviewed commit SHA.

## One linked project view

The interface exposes five connected surfaces:

1. **Project** — leadership mode, strategic summary, blueprint graph, initiatives, risks, and Rashed recommendation.
2. **Tasks** — each task's implementer, reviewer, blueprint revision, progress from acceptance steps, gates, blockers, evidence, next action, and expandable event history.
3. **Timeline** — meaningful events from all tasks plus President directives, follow-ups, and decisions.
4. **President reviews** — only fully gated milestones or directions needing human judgment.
5. **President directives** — the single input channel to Rashed, linked to the current scene or context when requested.

All development remains visible. Visibility does not mean every update demands President attention.

## Asynchronous signal model

The President may be active frequently or absent for a long period. Rashed performs a cheap signal check at the start of each cycle:

1. read the last processed cursor/IDs from `president-status.json`;
2. use an event-summary/cursor endpoint when available;
3. otherwise fetch the channel once and compare IDs/timestamps;
4. do not reanalyse unchanged directives/messages/decisions;
5. do not create an empty status or ledger commit when nothing changed.

### New unread input

Rashed enters `PRESIDENT_SIGNAL`:

- pauses selection of a new ordinary initiative;
- preserves safe in-flight work unless it conflicts;
- reconciles every new directive, message, correction, decision, cancellation, and plan amendment;
- records continue/adjust/stop/superseded effects in blueprint and ledger;
- advances the cursor only after all input is accounted for;
- resumes delegated leadership when safe.

### No unread input

Rashed enters `DELEGATED_LEADERSHIP` and continues initiating, planning, delegating, reviewing, and integrating reversible work. President silence is neither a blocker nor irreversible approval.

A temporary channel failure blocks only decisions that could materially conflict with unread input. The static project map and ledger must remain visible even when the writing API is unavailable.

## President → Rashed

The President can:

- create a directive linked to a scene, element, journey, initiative, or blueprint node;
- send a correction, follow-up, cancellation, or priority change;
- amend visual direction;
- decide a curated milestone or direction packet;
- request a return brief.

Rashed acknowledges factually and converts intent into outcomes, constraints, initiatives, bounded tasks, blueprint entries, and ledger entries. He splits oversized requests and never silently broadens or replaces the President's goal.

## Development reporting

The portal shows event-driven checkpoints, not hourly ceremony.

A meaningful task event is shown when work is assigned, progressed, blocked, reviewed, audited, verified by CI/Preview, decided by Rashed, affected by the President, completed, rejected, or superseded.

Tasks spanning multiple scheduled cycles show each meaningful checkpoint. Truly large work is an initiative containing multiple bounded tasks, never one vague five-hour or ten-hour implementation assignment.

The ledger is written by Rashed after verifying worker/reviewer/auditor evidence. The browser cannot fabricate manager, reviewer, Architecture Steward, Hakam, CI, or Preview states.

## Rashed → President attention queue

Rashed sends only:

- `ACTION_NOW` — true human gate or unresolved strategic conflict;
- `REVIEW_MILESTONE` — fully gated outcome ready for product judgment;
- `REVIEW_DIRECTION` — visual initiative/roadmap ready for amendment;
- `FYI` — material change requiring no action;
- `NONE` — ordinary visible progress.

Normally no more than three action/review items are shown together. A pending President item blocks only its dependent workstream.

## Review milestone gate

Rashed may append a milestone packet to `president-outbox.json` only when:

- an implementation artifact exists;
- its `blueprintNodeId` and `blueprintRevision` are current;
- its ledger task entry and event history are current;
- acceptance criteria are met;
- independent reviewer verdict is `PASS`;
- Architecture Steward verdict is `ARCH_OK` when required;
- Hakam verdict is `MERGE_OK`;
- relevant CI/checks are green;
- a working exact-head Preview and exact commit SHA exist when relevant;
- Rashed personally inspected the diff, evidence, product behavior, and Preview and recorded `manager: PASS`.

The interface hides invalid or unfinished packets. Passing gates does not force Rashed to recommend approval.

## President task quality

A President review item must include Rashed's recommendation, alternatives when relevant, evidence, consequence of no decision, and exact decision scope. “Please review everything” is invalid.

## President return brief

After meaningful autonomous activity, Rashed prepares:

1. outcomes achieved;
2. important decisions and rationale;
3. blueprint and ledger changes;
4. failures, risks, stopped or superseded work;
5. up to three review/decision items;
6. recommended next direction.

All other detail remains available through the project, task, timeline, and evidence drill-down views.

## President decisions

The President can issue `approved`, `needs_changes`, `rejected`, or a message without decision.

Approval authorizes only the packet's explicit `decisionScope`. It never silently authorizes Production, rules, secrets, authentication, destructive schema/data work, material cost, or major deletion.

## Security and authority boundary

The browser writes President directives, messages, and decisions only. It cannot write the canonical blueprint or ledger, fabricate Rashed/reviewer/Architecture Steward/Hakam/CI state, or write the curated outbox.

The API is enabled automatically only in Preview/development. In Production it returns `president_portal_disabled_in_production` unless the President explicitly authorizes the channel and the protected environment sets `PRESIDENT_PORTAL_PRODUCTION_ENABLED=1`. Never add this variable merely to obtain a green deployment.