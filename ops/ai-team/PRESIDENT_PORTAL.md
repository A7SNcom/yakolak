# President Portal Contract

## Purpose

`developer.html` is the President's visual leadership interface with Rashed—not a direct task console for workers and not a requirement that the President attend every hour.

The portal must let the President set direction, amend the visual plan, inspect curated progress, issue decisions, and leave again while Rashed continues leading the team under the standing mandate.

## Roles

- **President:** Ahmad, final product/development authority.
- **Rashed:** sole managerial contact, delegated executive deputy, initiative owner, and team leader.
- **Workers:** execute bounded assignments from Rashed.
- **Reviewer / Architecture Steward / Hakam:** independently verify; they never send raw work directly to the President.

D1/D2/D3/D4 describe workspace generations, not human roles.

## Canonical resources

- President interface: `developer.html`
- President channel API: `/api/developer-president`
- Rashed leadership contract: `ops/ai-team/RASHED_LEADERSHIP_OS.md`
- Canonical visual plan: `ops/ai-team/development-blueprint.json`
- Rashed status/cursor: `ops/ai-team/president-status.json`
- Curated President queue: `ops/ai-team/president-outbox.json`

A Preview is valid only when Vercel metadata matches the exact reviewed commit SHA.

## Asynchronous signal model

The President may be active frequently or absent for a long period.

Rashed performs a cheap signal check at the start of each cycle:

1. read the last processed cursor/IDs from `president-status.json`;
2. use an event-summary/cursor endpoint when available;
3. otherwise fetch the channel once and compare IDs/timestamps with stored state;
4. do not reanalyse unchanged directives/messages/decisions;
5. do not create an empty status commit merely because nothing changed.

### New unread input

Rashed enters `PRESIDENT_SIGNAL`:

- pauses selection of a new ordinary initiative;
- preserves safe in-flight work unless it conflicts;
- reconciles every new directive, message, correction, decision, cancellation, and blueprint amendment;
- records continue/adjust/stop/superseded effects;
- advances the cursor only after all input is accounted for;
- resumes delegated leadership when safe.

### No unread input

Rashed enters `DELEGATED_LEADERSHIP` and continues initiating, planning, delegating, reviewing, and integrating reversible work. President silence is not a blocker and is not irreversible approval.

A temporary channel failure blocks only decisions that could materially conflict with unread input. Safe active review/testing and unrelated reversible work continue.

## President → Rashed

The President can:

- create a directive linked to a scene, element, journey, initiative, or blueprint node;
- send a correction, follow-up, cancellation, or priority change;
- amend the visual development plan;
- decide a curated milestone or direction packet;
- request a return brief.

Rashed acknowledges factually and converts intent into outcomes, constraints, initiatives, and bounded tasks. He splits oversized requests and never silently broadens or replaces the President's goal.

A President blueprint edit is an amendment, not a destructive rewrite. Rashed preserves history, compares active work, and marks affected tasks continue/adjust/stop/superseded.

## Rashed → President attention queue

Rashed sends only four classes:

- `ACTION_NOW` — true human gate or unresolved strategic conflict;
- `REVIEW_MILESTONE` — fully gated outcome ready for product judgment;
- `REVIEW_DIRECTION` — visual initiative/roadmap ready for amendment;
- `FYI` — material change requiring no action.

Normally no more than three action/review items are shown together. The President should not need to read worker reports, reconstruct CI, or decide minor reversible details.

A pending President item blocks only its dependent workstream. Rashed continues all independent work.

## Review milestone gate

Rashed may append a milestone packet to `president-outbox.json` only when:

- an implementation artifact exists;
- its canonical `blueprintNodeId` and `blueprintRevision` are current;
- acceptance criteria are met;
- independent reviewer verdict is `PASS`;
- Architecture Steward verdict is `ARCH_OK` when required;
- Hakam verdict is `MERGE_OK`;
- relevant CI/checks are green;
- a working exact-head Preview and exact commit SHA exist;
- **Rashed personally inspected** the diff, evidence, product behavior, and Preview and recorded `manager: PASS`.

Packet shape:

```json
{
  "id": "president-review:YAK-005-01",
  "type": "REVIEW_MILESTONE",
  "status": "ready_for_president",
  "taskId": "YAK-005-01",
  "blueprintNodeId": "initiative-id",
  "blueprintRevision": 3,
  "title": "Observable result",
  "summary": "Outcome, value, and what the President should judge",
  "recommendation": "Rashed's recommended decision",
  "worker": "Noor",
  "reviewer": "Sami",
  "commitSha": "40-char SHA",
  "prUrl": "https://github.com/...",
  "previewUrl": "https://...vercel.app/developer.html#...",
  "decisionScope": "team_integration",
  "gates": {
    "reviewer": "PASS",
    "manager": "PASS",
    "hakam": "MERGE_OK",
    "ci": "GREEN"
  },
  "evidence": [],
  "createdAt": "ISO-8601"
}
```

The interface hides invalid or unfinished packets. Passing gates does not force Rashed to recommend approval.

## Direction review and President tasks

Rashed may assign the President a review item when human judgment creates meaningful value, including:

- choosing between legitimate product directions;
- amending a strategic initiative or journey;
- reviewing a major milestone after all technical gates;
- granting an exact human-gated authority;
- resolving a conflict between explicit goals.

A President task must include Rashed's recommendation, alternatives, evidence, consequence of no decision, and exact scope. “Please review everything” is invalid.

## President return brief

After meaningful autonomous activity, Rashed prepares:

1. outcomes achieved;
2. important decisions made and rationale;
3. visual roadmap changes;
4. failures, risks, stopped or superseded work;
5. up to three review/decision items;
6. recommended next direction.

The rest remains available as drill-down evidence.

## President decisions

The President can issue `approved`, `needs_changes`, `rejected`, or a message without decision.

Approval authorizes only the packet's explicit `decisionScope`. It never silently authorizes Production, rules, secrets, authentication, destructive schema/data work, material cost, or major deletion.

## Security and authority boundary

The browser writes President directives, messages, decisions, and eventually editable blueprint amendments only. It cannot fabricate Rashed/reviewer/Architecture Steward/Hakam/CI state, write the curated outbox, or rewrite the canonical GitHub plan.

The API is enabled automatically only in Preview/development. In Production it returns `president_portal_disabled_in_production` unless the President explicitly authorizes the channel and the protected environment sets `PRESIDENT_PORTAL_PRODUCTION_ENABLED=1`. Never add this variable merely to obtain a green deployment.
