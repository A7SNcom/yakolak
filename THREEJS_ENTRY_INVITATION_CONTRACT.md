# Three.js Entry and Invitation Contract

Status: **LOCKED by THREEJS-006 (2026-08-16); finite 2-digit locator outcome locked by THREEJS-065 (2026-08-20)**

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
- the configuration snapshot/revision needed to reject stale invitations.

A joiner never chooses or changes the seat or color carried by the invitation. The UI may show the reserved seat/color before acceptance, but it must not render alternative colors as join choices.

## 3. What the manual 2-digit code means

The manual **2-digit code resolves an invitation, not a room**.

Therefore:

- one room may have multiple active 2-digit invitation codes at the same time — one per Online seat;
- a 2-digit code identifies one exact invitation reservation and therefore one exact seat/color;
- no 2-digit code may resolve to "the room in general" and then allocate the next free seat;
- no code path may ask the joiner to choose an available color after resolution.

The two-digit value is an invitation locator, not a player session credential. Claiming an invitation issues/recovers the seat's separate session credential; later authenticated room actions use that session identity, not the 2-digit code.

## 4. THREEJS-065 finite namespace outcome — Outcome A

The product keeps the `00–99` manual-code contract. This is a deliberately finite namespace with **exactly 100 simultaneously active manual invitation locators globally**. Collision handling does not increase this capacity.

The locked allocation/reclamation policy is:

1. every active manual locator is one of exactly `00` through `99`;
2. one current lobby-generation Online seat has at most one active manual locator;
3. the locator reservation lasts **10 minutes** from first allocation; an idempotent retry returns the same invitation/locator and does not extend that TTL;
4. when the invitation becomes `claimed`, `revoked`, or `expired`, its short locator is released immediately and may later identify a completely different invitation;
5. a claimed seat can never receive a replacement short invitation merely because its old locator was released; refresh/recovery belongs to THREEJS-066 and requires the separate high-entropy credential;
6. if all 100 locators are active, allocation fails clearly as **`INVITE_CODE_CAPACITY`**. The server does not spin through collisions and pretend the finite namespace is unbounded;
7. free-code order is randomized with Web Crypto, Fisher–Yates shuffling and rejection sampling rather than modulo-biased selection;
8. active uniqueness is authoritative in the finite reservation table. Historical invitation rows may retain locator values after release, so old history can legitimately contain repeated `42`, for example, while only one current reservation can resolve `42`.

Structural capacity at the maximum Online-seat mix is therefore explicit:

- 2-seat host + 1 Online games consume one locator each: at most **100** such simultaneously open invitations;
- 3-seat host + 2 Online games consume two each: at most **50** fully invited lobbies;
- 4-seat host + 3 Online games consume three each: **33** fully invited lobbies plus one additional Online invitation.

The repository has no trustworthy measured production distribution for simultaneous open rebuild invitations yet, so THREEJS-065 does not invent a demand forecast. The small global namespace has real saturation and abuse risk; THREEJS-077 owns enumeration/rate-limit/data-exposure hardening. The short locator never grants seat authority, so enumerating all 100 values must not expose a bearer credential or permit control of a seat.

An invitation link may carry a separate opaque token/identifier, but that does **not** enlarge the capacity of code-only manual entry: the manual resolver can distinguish only the 100 values `00–99`.

## 5. Link entry and code entry are the same contract

Invitation link entry and manual code entry must resolve through the same authoritative invitation resolver and converge on the same invitation record before any seat is claimed.

For the same invitation:

`invitation link -> resolve invitation -> preview reserved seat/color -> accept -> claim exact reservation`

and

`2-digit code -> resolve invitation -> preview reserved seat/color -> accept -> claim exact reservation`

must produce the same preview, validation, errors, claimed seat, canonical color, lobby revision, and session identity outcome.

A link is not allowed to bypass reservation checks, and code entry is not allowed to fall back to generic room joining. If a link carries an opaque locator/token, it still resolves to the same authoritative invitation object as the manual code; it cannot encode a different seat/color decision on the client.

## 6. Conflict prevention is server-authoritative

The authoritative invitation claim must reject the operation, without fallback allocation, when the invitation is invalid, expired, revoked, stale after lobby reconfiguration, or already claimed by another identity.

The server must never solve a conflict by assigning a different free color or a different free seat. The only successful result for an invitation is its pre-reserved seat/color.

Refresh/reconnect by the same joined identity reclaims the same seat through its high-entropy session credential and does not consume a second invitation. Possession of an old short locator is never recovery authority, because that locator may already have been released and reused for somebody else.

## 7. Required entry/invitation invariants

Later THREEJS tasks must preserve all of these invariants:

1. Host chooses/configures seats and colors; invitees do not.
2. Every Online seat has one exact invitation reservation while it remains inviteable.
3. Manual 2-digit entry resolves an invitation, never a generic room.
4. Link and code entry resolve the same invitation model and have identical post-resolution behavior.
5. A successful claim returns exactly the reserved seat/color; there is no "next free seat/color" fallback.
6. Already-used, expired, revoked, or stale invitations never occupy another seat.
7. The invitation locator is not reused as the player's authenticated session credential.
8. Client presentation never invents reservation ownership; authoritative invitation/lobby state decides it.
9. The global manual-code namespace has exactly 100 active slots; allocation #101 fails `INVITE_CODE_CAPACITY` until a locator is reclaimed.
10. Claim/recovery can never downgrade to possession of the enumerable 2-digit locator.

## 8. Migration implication for the current API

The current `api/rooms.js` behavior is not the final Three.js invitation contract because it treats a 2-digit value as a room code, allocates the next free `p2`/`p3`/`p4` seat on join, and accepts a joiner-requested available color.

THREEJS-006 resolves that contradiction in favor of the seat-specific invitation contract, and THREEJS-065 locks the finite `00–99` allocation/reclamation behavior. THREEJS-066 still owns high-entropy idempotent claim/session recovery; THREEJS-068 owns invalidation on lobby edits; THREEJS-077 owns enumeration/rate-limit/data-exposure hardening.

Until those backend pieces and transport/UI integration exist, the Three.js client must not fake reserved seats/colors client-side or present the old generic-room join as compliant with this locked contract.
