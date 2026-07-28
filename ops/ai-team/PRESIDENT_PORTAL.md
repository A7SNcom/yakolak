# President Portal Contract

## Roles

- **President:** Ahmad, the human product owner and final product authority.
- **Rashed:** the sole team manager and the President's only managerial contact.
- Workers, reviewers, Architecture Stewards, and Hakam never send work directly to the President.

`developer.html` is the President's development interface across D1/D2/D3/D4 generations. The D number describes the workspace implementation, not the human role.

## Canonical interface

- Branch preview: `https://yakolak-git-agent-yakolak-team-os-ahmdkcoms-projects.vercel.app/developer.html`
- President channel API: `/api/developer-president`
- Manager review outbox: `ops/ai-team/president-outbox.json`
- Manager status replies: `ops/ai-team/president-status.json`

If Vercel protection blocks access, use the connected Vercel tool to inspect the branch alias or deployment. Do not replace this with a second chat or a parallel issue inbox.

## President → Rashed

The President creates directives and follow-up messages in the portal. At the beginning of every manager cycle Rashed must:

1. read the President API;
2. identify directives/messages not reflected in `president-status.json`;
3. acknowledge each new directive with a short factual note;
4. either convert it into a bounded task plan, mark it blocked with the missing decision, or decline it with a concrete reason;
5. record task IDs and current status in `president-status.json`.

President directives override ordinary backlog priority unless they violate a human gate, safety rule, current file lock, or are too large for one task. Rashed splits large directives; he does not silently broaden them.

## Rashed → President

Rashed may append a review packet to `president-outbox.json` only when all are true:

- implementation artifact exists;
- acceptance criteria are met;
- independent reviewer verdict is `PASS`;
- Architecture Steward verdict is `ARCH_OK` when required;
- Hakam verdict is `MERGE_OK`;
- relevant CI/checks are green;
- a working Preview URL and exact commit SHA exist;
- Rashed personally inspected the diff, evidence, and preview and records `manager: PASS`.

Required item shape:

```json
{
  "id": "president-review:YAK-004-01",
  "status": "ready_for_president",
  "taskId": "YAK-004-01",
  "title": "Observable result",
  "summary": "What changed and why the President should inspect it",
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

The interface hides packets that do not satisfy all gates. Never weaken the client validation to expose unfinished work.

## President decisions

The President can issue:

- `approved`
- `needs_changes`
- `rejected`
- a message without changing the decision

Rashed reads decisions/messages every cycle and updates tasks/statuses accordingly. Portal approval authorizes only the packet's stated `decisionScope`. It never silently authorizes Production, rule changes, secrets, schema/auth changes, destructive work, or major deletion. Those remain separate explicit human gates.

## Security boundary

The browser can create President directives, messages, and decisions only. It cannot write manager status, fabricate reviewer/Hakam gates, or place items in the review outbox. Manager-side communication remains versioned in GitHub.
