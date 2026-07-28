# President Portal Contract

## Roles

- **President:** Ahmad, the human product owner, highest development authority, and final product decision-maker.
- **Rashed:** sole team manager, executor of the President's direction, and the only managerial contact.
- Workers, reviewers, Architecture Stewards, and Hakam report through Rashed and never create a parallel President inbox.

`developer.html` is the President's single visual development interface. D1/D2/D3/D4 describe workspace generations, not different human roles.

## Asynchronous relationship

The President may use the portal many times in one day or only once. The team must not require hourly human attendance.

Rashed checks the channel every manager run with a cheap cursor-based summary request:

`GET /api/developer-president?summary=1&after=<lastPresidentEventId>`

- No new events: Rashed does not fetch/re-read the full channel and continues proactive work.
- New events: Rashed pauses ordinary initiative, fetches the full channel, reconciles every unread item, then may resume safely.
- Unavailable channel: Rashed cannot assume silence; new proactive implementation is held until the check succeeds.

The processed cursor is stored in `ops/ai-team/president-status.json`.

## Canonical resources

- President interface: `developer.html`
- President API: `/api/developer-president`
- Canonical visual plan: `ops/ai-team/development-blueprint.json`
- President editable blueprint draft: API `blueprint`
- Rashed review outbox: `ops/ai-team/president-outbox.json`
- Rashed acknowledgements/cursor: `ops/ai-team/president-status.json`

## President → Rashed

The President can:

- create directives linked to the current scene/element;
- send follow-up messages and decisions;
- edit the visual development blueprint;
- approve, reject, or request changes on completed review packets.

President input outranks ordinary backlog initiative unless it conflicts with safety, an exact human gate, current ownership, or a canonical architecture invariant. Rashed must preserve the goal, split oversized work, and explain blockers instead of silently rewriting the request.

## Programming after documentation

The visual blueprint is the shared reference for President and Rashed.

Before coding, Rashed documents a node with:

- problem/opportunity;
- intended observable behavior;
- journey/scene and scope;
- acceptance criteria;
- risks, architecture/debt impact;
- owner and task ID;
- status and evidence links.

Every implementation prompt, PR, report, and review packet references `blueprintNodeId` and the canonical `blueprintRevision`.

The President may edit nodes, move them, connect them, add decisions/risks/evidence, or change priority/status. Saving a President edit emits a channel event. A task based on an older affected revision is blocked until Rashed reconciles the edit into the canonical GitHub blueprint.

Rashed may initiate a documented proposal when there is no unread President input. President silence is not approval, rejection, or a blocker; it simply allows the manager to continue evidence-based initiative within existing authority.

## Blueprint state model

Canonical GitHub node statuses:

- `idea`
- `documented`
- `ready`
- `in_progress`
- `review`
- `completed`
- `blocked`
- `cancelled`

Only a node at `ready` or `in_progress` with a current revision can authorize a normal implementation task. `review` requires a real artifact. `completed` requires review gates.

The President API uses optimistic concurrency. A stale browser version returns conflict instead of overwriting newer edits.

## Rashed → President review gate

Rashed may append an item to `president-outbox.json` only when all are true:

- implementation artifact exists and acceptance criteria are met;
- `blueprintNodeId` exists in the canonical blueprint;
- `blueprintRevision` matches the current canonical revision;
- independent reviewer verdict is `PASS`;
- Architecture Steward verdict is `ARCH_OK` when required;
- Hakam verdict is `MERGE_OK`;
- relevant CI is `GREEN`;
- working Preview URL and exact commit SHA exist;
- Rashed personally inspected diff, evidence, and Preview and records `manager: PASS`.

Required packet fields include:

```json
{
  "id": "president-review:YAK-005-01",
  "status": "ready_for_president",
  "taskId": "YAK-005-01",
  "blueprintNodeId": "track-online-session",
  "blueprintRevision": 2,
  "title": "Observable result",
  "summary": "What changed and why it matters",
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

Unfinished or undocumented work is hidden from the President review queue.

## Security and authority boundary

The browser can write President directives, messages, decisions, and editable blueprint drafts only. It cannot:

- fabricate Rashed/reviewer/Hakam/CI gates;
- write manager status or the canonical GitHub blueprint;
- place items in the review outbox;
- authorize Production or unrelated human gates.

President approval applies only to the packet's exact `decisionScope`. Production, rules, secrets, schema/authentication, destructive work, and major deletion require separate explicit President authorization.
