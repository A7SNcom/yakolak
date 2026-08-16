# Three.js Entry and Invitation Contract

Status: **LOCKED by THREEJS-006 (2026-08-16)**

Scope: `threejs-rebuild` only until an explicit later migration/cutover task changes this contract. This file defines the rebuild entry and online invitation behavior. It does not publish or change Godot Production.

## 1. Top-level entry

The rebuild has two player-facing entry paths:

- **`قيم جديد`** — host path. The host creates/configures a new game.
- **`دخول بدعوة`** — invitee path. A non-host enters only through an invitation.

There is no generic public "join room and then choose a seat/color" path in the rebuild contract.

## 2. Host owns seat/color configuration

Before invitations are created, the host configures the match seats and canonical colors.

For every online seat, the authoritative lobby creates exactly one invitation reservation containing at least:

- lobby/room identity;
- exact reserved seat identity;
- exact canonical color ID (`marble`, `blue`, `gold`, or `green`);
- invitation state (`open`, `claimed`, `expired`, or `cancelled`);
- the configuration snapshot/revision needed to reject stale invitations.

A joiner never chooses or changes the seat or color carried by the invitation. The UI may show the reserved seat/color before acceptance, but it must not render alternative colors as join choices.

## 3. What the manual 2-digit code means

The manual **2-digit code resolves an invitation, not a room**.

Therefore:

- one room may have multiple active 2-digit invitation codes at the same time — one per online seat;
- a 2-digit code identifies one exact invitation reservation and therefore one exact seat/color;
- no 2-digit code may resolve to "the room in general" and then allocate the next free seat;
- no code path may ask the joiner to choose an available color after resolution.

The two-digit value is an invitation locator, not a player session credential. Claiming an invitation issues/recovers the seat's separate session credential; later authenticated room actions use that session identity, not the 2-digit code.

## 4. Link entry and code entry are the same contract

Invitation link entry and manual code entry must resolve through the same authoritative invitation resolver and converge on the same invitation record before any seat is claimed.

For the same invitation:

`invitation link -> resolve invitation -> preview reserved seat/color -> accept -> claim exact reservation`

and

`2-digit code -> resolve invitation -> preview reserved seat/color -> accept -> claim exact reservation`

must produce the same preview, validation, errors, claimed seat, canonical color, lobby revision, and session identity outcome.

A link is not allowed to bypass reservation checks, and code entry is not allowed to fall back to generic room joining. If a link carries an opaque locator/token, it still resolves to the same authoritative invitation object as the manual code; it cannot encode a different seat/color decision on the client.

## 5. Conflict prevention is server-authoritative

The authoritative invitation claim must reject the operation, without fallback allocation, when the invitation is invalid, expired, cancelled, stale after lobby reconfiguration, or already claimed by another identity.

The server must never solve a conflict by assigning a different free color or a different free seat. The only successful result for an invitation is its pre-reserved seat/color.

Refresh/reconnect by the same joined identity reclaims the same seat through its session credential and does not consume a second invitation.

## 6. Required entry/invitation invariants

Later THREEJS tasks must preserve all of these invariants:

1. Host chooses/configures seats and colors; invitees do not.
2. Every online seat has one exact invitation reservation.
3. Manual 2-digit entry resolves an invitation, never a generic room.
4. Link and code entry resolve the same invitation model and have identical post-resolution behavior.
5. A successful claim returns exactly the reserved seat/color; there is no "next free seat/color" fallback.
6. Already-used, expired, cancelled, or stale invitations never occupy another seat.
7. The invitation locator is not reused as the player's authenticated session credential.
8. Client presentation never invents reservation ownership; authoritative invitation/lobby state decides it.

## 7. Migration implication for the current API

The current `api/rooms.js` behavior is not the final Three.js invitation contract because it treats a 2-digit value as a room code, allocates the next free `p2`/`p3`/`p4` seat on join, and accepts a joiner-requested available color.

THREEJS-006 resolves that contradiction in favor of the seat-specific invitation contract above. A later implementation task must add/adjust authoritative backend invitation reservation and resolution before the rebuilt online UI can claim this flow is live. Until that backend work exists, the Three.js client must not fake reserved seats/colors client-side or present the old generic-room join as compliant with this locked contract.
