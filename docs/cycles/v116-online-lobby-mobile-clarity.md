# v116 — Online lobby and mobile clarity

## Problem

The production invitation opened a generic join form even though the room code
was already present. The host could not choose room capacity, the guest could
not choose a color, the waiting view did not show a roster, and mobile gameplay
scattered status elements around a small, visibly soft board.

The authoritative rules also had two hidden failure modes: they did not enforce
the physical inventory of three pieces per size, and they had no explicit draw
path when no legal move remained.

## Baseline observations

- Direct invite URL still required a redundant “join by code” action.
- Room creation assumed two players.
- The host selected a color; the second player was assigned automatically.
- Waiting showed a code but no `1/N` capacity or occupied-color roster.
- Portrait framing devoted too much of the screen to the table body.
- Mobile rendering capped pixel ratio at 1.3/1.15/1.0.
- Lobby exit and simultaneous color selection needed authoritative recovery.

## Design before implementation

- `docs/design/v116-online-flow-mobile.svg`
- `docs/design/v116-online-game-mobile.svg`

The mockups fixed the information order before code was changed: capacity,
color, roster, automatic start, then one compact in-game status hierarchy.

## Hypothesis

If the invite link opens directly at the available-color step, every room states
its capacity and roster, and the board receives more portrait screen area and a
bounded pixel-ratio increase, players will reach a multiplayer match with fewer
decisions and read the mobile board more easily.

## Implementation

- Protocol-v2 rooms with 2–4 seats and unique player-selected colors.
- Public invite preview that discloses no credentials.
- Compare-and-swap joins so two guests cannot claim the same seat or color.
- Waiting roster, empty-seat count, automatic start at `N/N`, and explicit
  cancel/leave behavior.
- Server-enforced piece inventory, legal-turn advancement, and draw resolution.
- Compact in-game roster and one restrained connection indicator.
- Portrait camera framing based on player count.
- Bounded mobile render scale and warmer board/table separation.

## Test method

- Rule contracts for 3-player start, 4-player waiting/leave, win/rematch,
  inventory exhaustion, and draw.
- Syntax and generated-wrapper execution.
- Mobile UI inspection at 390×844 before API deployment.
- Preview build and runtime-log inspection.
- Two-, three-, and four-client room creation/join tests.
- Portrait and landscape screenshot comparison.
- Production smoke test only after the tested Preview is accepted.

## Result

Keep.

- Final Preview `dpl_AQa7mMJ2KgaSAd95hEEnqoqjJMZN` reached `READY` from
  commit `5606f8ed601a2aa6e91391738f72e8c77c71aa3b`.
- A direct invitation opened at available-color selection; it did not repeat
  the room-code form.
- A two-player room started at 2/2. A real pointer-selected move changed the
  turn and board state on both clients.
- A three-player room stayed waiting at 2/3, started at 3/3, and advanced the
  first move from player one to player two on all three clients.
- A four-player room exposed only the remaining color on the final invitation,
  started at 4/4, and rendered the four-player roster without clipping.
- Portrait 390×844 and landscape 844×390 kept the caption, four-player roster,
  board, pieces, and connection control visible.
- The connection control opened a room-status view with a clear exit warning.
  Leaving cancelled the active round for the other clients; “return to start”
  cleared the stale room session.
- Four browser clients reported no application console errors or warnings.
- Vercel reported no warning, error, or fatal runtime logs during the tested
  Preview window.
- The rule contract passed inventory exhaustion, explicit draw, win, rematch,
  waiting-room leave, and 2–4 player state tests.

One failed Preview was intentionally rejected before testing because the first
GitHub transfer of the large client source was truncated. The transfer was
replaced with verified chunked bytes; the final Git blob SHA matched the local
source and the later Preview passed. This is why `READY` alone is not treated
as acceptance evidence.

## Keep or revert

Keep. Roll back to production commit
`aab40c7a0ab0806a71aa9c0381e766a4a53f80f6` if post-deployment verification
does not match the tested Preview.

## Preview

`https://yakolak-ltzs3cgi3-ahmdkcoms-projects.vercel.app`
