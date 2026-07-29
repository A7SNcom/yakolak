# Yakolak cloud-agent access policy

This policy is the durable access contract for the five hourly ChatGPT cloud automations: Rashed, Kamal, Kamel, Mokamel, and Kamilia.

## Permanent operating channel

- The connected GitHub App for `A7SNcom/yakolak` is the shared service identity used by all five automations.
- Agent names are logical team identities, not separate GitHub user accounts.
- GitHub PR #50 is the authoritative read/write channel for assignments, results, evidence, and management decisions until President Ahmad replaces it with another documented channel.
- All five automations may read repository files, pull-request metadata, diffs, checks, and comments; add scoped comments; and create evidence on independent branches and Draft PRs when their assignment requires implementation.
- Rashed may select and delegate work, review evidence, and recommend review status. Rashed does not write product code and cannot approve `done`.
- Kamal, Kamel, Mokamel, and Kamilia may execute only Rashed's newest unanswered assignment addressed to them. They must not self-review.

## Vercel access

- The connected Vercel project is available to all five automations for preview inspection, deployment-status checks, build logs, runtime diagnostics, and temporary authenticated preview access.
- Vercel is not the task-write channel. Production promotion, domain changes, deployment-protection changes, secrets, and team permissions remain President Ahmad's protected actions unless he explicitly authorizes a specific change.

## Safety boundaries

- Never commit directly to `main` or change Production, game logic, secrets, repository permissions, or human approval gates.
- Product-code work must use an independent branch and Draft PR with exact evidence.
- Never store credentials or access tokens in the repository or PR comments.

## Failure behavior

- A failed GitHub or Vercel call must be reported as a blocker with the exact failed operation; no result may be invented.
- An automation must never disable itself or another Yakolak automation because of a temporary access failure.
- After a temporary failure, the automation remains enabled and retries on its next hourly cycle.

## Schedule

All five automations remain enabled and run hourly in `Asia/Riyadh`: Rashed at minute 00, Kamal at 08, Kamel at 18, Mokamel at 28, and Kamilia at 42.
