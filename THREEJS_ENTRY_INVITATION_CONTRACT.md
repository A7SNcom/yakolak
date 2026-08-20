# Three.js Entry and Invitation Contract

Status: **LOCKED by THREEJS-006 (2026-08-16); finite locator capacity resolved by THREEJS-065 (2026-08-20)**

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
- invitation state (`open`, `claimed`, `expired`, or `revoked`);
- lobby generation/revision needed to reject stale invitations.

A joiner never chooses or changes the seat or color carried by the invitation. The UI may show the reserved seat/color before acceptance, but it must not render alternative colors as join choices.

## 3. What the manual 2-digit code means

The manual **2-digit code resolves an invitation, not a room**.

Therefore:

- one room may have multiple active 2-digit invitation codes at the same time — one per Online seat;
- a 2-digit code identifies one exact invitation reservation and therefore one exact seat/color;
- no 2-digit code may resolve to "the room in general" and then allocate the next free seat;
- no code path may ask the joiner to choose an available color after resolution.

The two-digit value is an invitation locator, not a player session credential. Claiming an invitation issues/recovers the seat's separate high-entropy credential under THREEJS-066; later authenticated room actions use that identity, not the 2-digit code.

## 4. THREEJS-065 finite-namespace product decision — Option A

THREEJS-065 explicitly chooses **Option A**: retain manual `00`–`99` entry and accept its finite global namespace rather than silently replacing the product contract with a larger/scoped code.

There are exactly **100 simultaneously distinguishable active manual invitation locators globally**. Collision handling cannot increase that number.

The locked limits are:

- namespace: exactly `00` through `99`;
- hard active manual-invitation capacity: **100 globally**;
- open invitation TTL: **10 minutes / 600,000 ms**;
- no more than one open invitation for one room + lobby generation + Online seat;
- when no locator is free, allocation fails clearly as `INVITE_CODE_CAPACITY` with capacity `100`;
- a locator becomes reusable when its invitation is **claimed, revoked, or expired**;
- a claimed locator never remains a recovery path for the claimed seat.

### Capacity arithmetic and saturation risk

A configured game has at most three Online invitees because the host occupies one of the maximum four seats. Therefore the 100-code global namespace can distinguish, at one instant:

- 100 rooms needing one active invitation each; or
- 50 rooms needing two each; or
- 33 rooms needing three each plus one additional invitation.

No production concurrency telemetry exists for this unreleased authoritative backend, so THREEJS-065 does **not** claim that the 100-code ceiling is sufficient for real traffic; the evidence available here quantifies the structural demand of 1–3 open manual invitations per active lobby and makes saturation explicit instead of guessing a usage rate.

This is a real shared capacity ceiling, not a probabilistic collision estimate. Without reclamation, a small number of hosts could exhaust it. THREEJS-065 mitigates that finite-risk boundary with authenticated host-only allocation, one-open-invitation-per-seat, short expiry, explicit revoke, claim-time release, DB-level active uniqueness, and a clear saturation error. Broader rate limiting/abuse policy may be added by its owning task, but it cannot be used to pretend the namespace is larger than 100.

### Allocation is from the free set, not collision retry

The backend first expires stale open reservations, computes the exact free subset of `00`–`99`, then selects uniformly from that free set using rejection sampling over a 32-bit cryptographic random value. Allocation runs inside the same authoritative IMMEDIATE transaction as the room revision and mutation receipt.

Database partial unique indexes enforce:

- one globally open row per manual locator; and
- one open invitation per `(room, lobbyGeneration, seat)`.

Deterministic saturation tests must prove invitation 1–100 can occupy all locators and invitation 101 fails with `INVITE_CODE_CAPACITY`; freeing one locator must make one slot available again.

## 5. Link entry and code entry are the same contract

Invitation link entry and manual code entry must resolve through the same authoritative invitation reservation before any seat is claimed.

For the same invitation:

`invitation link -> resolve invitation -> preview reserved seat/color -> accept -> claim exact reservation`

and

`2-digit code -> resolve invitation -> preview reserved seat/color -> accept -> claim exact reservation`

must produce the same preview, validation, errors, claimed seat, canonical color, lobby revision, and session identity outcome.

A link is not allowed to bypass reservation checks, and code entry is not allowed to fall back to generic room joining. A link may later carry an opaque/high-entropy token, but that token **does not expand the manual `00`–`99` namespace**: a player who supplies only two digits still has only 100 possible active manual locators.

## 6. Conflict prevention is server-authoritative

The authoritative invitation claim must reject the operation, without fallback allocation, when the invitation is invalid, expired, revoked, stale after lobby reconfiguration, or already claimed by another identity.

The server must never solve a conflict by assigning a different free color or a different free seat. The only successful result for an invitation is its pre-reserved seat/color.

Refresh/reconnect by the same joined identity reclaims the same seat through its separate high-entropy credential and does not consume a second invitation. THREEJS-066 owns that credential creation, verifier storage, idempotent claim and same-credential recovery behavior.

## 7. Required entry/invitation invariants

Later THREEJS tasks must preserve all of these invariants:

1. Host chooses/configures seats and colors; invitees do not.
2. Every Online seat has one exact invitation reservation.
3. Manual 2-digit entry resolves an invitation, never a generic room.
4. Link and code entry resolve the same invitation model and have identical post-resolution behavior.
5. A successful claim returns exactly the reserved seat/color; there is no "next free seat/color" fallback.
6. Already-used, expired, revoked, or stale invitations never occupy another seat.
7. The invitation locator is not reused as the player's authenticated session credential.
8. Client presentation never invents reservation ownership; authoritative invitation/lobby state decides it.
9. At most 100 active manual locators exist globally and saturation is surfaced as `INVITE_CODE_CAPACITY`.
10. Claim/revoke/expiry release the manual locator; recovery never downgrades to possession of an enumerable 2-digit code.

## 8. Backend boundary after THREEJS-065

The Cloudflare authoritative store now owns finite locator allocation/reclamation and the Worker exposes:

- host-authenticated `allocate-invitation` / `revoke-invitation` through the existing room mutation endpoint; and
- public `GET /v1/invitations/:twoDigitCode` resolution that returns only the safe invitation preview for a live open invitation.

No THREEJS-065 route claims a seat or returns a bearer credential. THREEJS-066 remains the owner of the first mutating claim, high-entropy credential/verifier, exact reserved-seat binding, lost-response replay and reconnect recovery.

The current historical `api/rooms.js` generic-room join is still not compliant with this rebuild contract and must not be reintroduced as a fallback.
