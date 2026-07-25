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

Pending Preview and production verification.

## Keep or revert

Pending Preview verification.
