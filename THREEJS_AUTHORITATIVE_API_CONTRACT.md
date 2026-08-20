# THREEJS-062 — Authoritative API / store contract

Status: **LOCKED by THREEJS-062 (2026-08-20); durable Turso store by THREEJS-063; lobby config by 064; finite invitation namespace by 065; later feature semantics remain downstream**

This contract extends the already-selected PAGES-005 Cloudflare Worker. It does not create another backend, does not change the PAGES-005 compatibility identity, and does not claim a live `API_ORIGIN`.

## 1. One Worker, one store interface

The runtime remains `backend/cloudflare/src/worker.js`. PAGES-005 probe routes and the versioned `/v1` authoritative shell receive the same store object.

The exact store interface is:

- `getCapabilities()`
- `ensureTable()`
- `writeRoom()`
- `readRoom()`
- `cleanup()`
- `authorizeSeat()`
- `lookupInvitation()`
- `allocateInvitation()`
- `revokeInvitation()`
- `transactAuthority()`
- `commitMutation()` — current move-route convenience wrapper over `transactAuthority()`

`transactAuthority()` remains the common CAS/idempotency boundary for room-only and room+invitation transactions. Duplicate identity is resolved before a transition callback is allowed to run. THREEJS-065 adds narrow store methods for finite-locator allocation/revocation because those operations need a namespace-wide free-set transaction rather than SQL in route handlers.

THREEJS-063 implements the durable Turso interface behind `backend/cloudflare/src/authoritative-turso-store.js`; route handlers contain no Turso SQL. THREEJS-065 keeps namespace SQL isolated in `backend/cloudflare/src/authoritative-turso-invitation-namespace.js` and composes it into that same store/transaction system.

## 2. Authoritative seat vocabulary

The migration backend uses exactly three configured seat types:

- `host` — the host-controlled seat.
- `online` — a remote human seat that requires a current high-entropy seat credential after claim.
- `computer` — a server-controlled Computer seat; no browser credential or browser-selected bot move exists for it.

THREEJS-064 materializes these records on the stable THREEJS-048 configured ring. Connection, claim, reconnect or camera order never reorders seats.

## 3. Authority actor framing

Store transactions distinguish three actor kinds:

- `seat` — an already authenticated seat/controller generation.
- `claim` — a high-entropy claim identity verifier used while atomically claiming a reserved invitation.
- `server` — backend reconciliation authority, including timeout and Computer work.

A client-supplied `seatId` is never authority. Browser requests may trigger work, but only server/store state decides the actor and accepted result.

## 4. Invitation lifecycle framing

The backend invitation lifecycle vocabulary is:

- `open`
- `claimed`
- `revoked`
- `expired`

Each persisted invitation belongs to one room/lobby generation and one already-reserved stable Online seat. Locator resolution is lookup only and never grants seat authority. Same-identity claim recovery is based on a separate high-entropy claim/seat credential, never possession of the short locator.

THREEJS-065 locks the historical manual locator contract to **Option A**:

- exact locator namespace `00`–`99`;
- exactly 100 globally simultaneous open manual locators;
- 10-minute open TTL;
- DB-level unique open locator and unique open `(room,generation,seat)`;
- explicit `INVITE_CODE_CAPACITY` when all 100 are occupied;
- claim, revoke and expiry release the locator.

`GET /v1/invitations/:twoDigitCode` resolves only a currently open, unexpired invitation preview. A claimed/revoked/expired short code does not recover authority. THREEJS-066 implements the high-entropy first claim, exact seat binding and same-credential recovery. THREEJS-068 implements lobby-generation invalidation and safe unclaimed Online→Computer replacement. THREEJS-077 later owns enumeration/rate-limit/data-exposure hardening.

## 5. Readiness / explicit start framing

Readiness is authoritative per configured seat and lobby generation:

- Computer seats are ready immediately.
- Online seats become ready only after successful claim plus hydration of the current lobby generation.
- the host controls the explicit Start action.

Filling configured seats, invitation claim, refresh or polling never auto-starts the match. `start-match` is a revision/idempotency transaction and succeeds only when the authoritative readiness gate passes.

THREEJS-069 owns implementation of this rule and the exact start transition.

## 6. Deadline framing

The authoritative online deadline field is `deadlineAtMs` and represents an absolute server-clock deadline. The locked turn duration is `18_000 ms`.

The browser may render a countdown derived from this value and may issue a poll/wake request near expiry. It may not decide timeout, extend the deadline, or rely on an in-process 18-second timer surviving Worker lifecycle.

Timeout reconciliation uses a `server` actor and reserved operation `reconcile-timeout`, with current revision plus idempotency identity through the common store transaction boundary. THREEJS-070 implements the actual expiry reconciliation and transition semantics.

## 7. Online Computer framing

A configured `computer` seat has no browser authority. When it becomes active, request/wake/mutation traffic may trigger backend reconciliation, but the server verifies current revision/deadline, generates the legal bot intent through shared rules, and commits at most one result through the common transaction boundary.

The reserved operation is `reconcile-computer`; THREEJS-071 implements strategy/reconciliation details. Concurrent browser triggers must converge on one accepted room revision/result.

## 8. Mutation / transition framing

The existing host-authenticated room mutation endpoint is:

`POST /v1/rooms/:roomId/mutations`

It currently dispatches exact envelopes for:

- `configure-lobby` — THREEJS-064 initial configuration;
- `allocate-invitation` — THREEJS-065 finite locator allocation for one exact Online seat;
- `revoke-invitation` — THREEJS-065 host revocation of one open invitation;
- `move` — shared authoritative move transition.

All use the same authenticated room, expected revision, room-scoped mutation/idempotency ID and request fingerprint boundary. Allocation additionally uses the namespace-wide IMMEDIATE transaction to choose one free `00`–`99` locator without collision retry.

The reserved operation vocabulary is:

- `configure-lobby`
- `allocate-invitation`
- `revoke-invitation`
- `claim-invitation`
- `invalidate-lobby`
- `set-ready`
- `start-match`
- `move`
- `reconcile-timeout`
- `reconcile-computer`

Reserved names do not imply every downstream semantic is implemented. In particular `claim-invitation` remains THREEJS-066, invalidation 068, ready/start 069, timeout 070 and Computer execution 071.

## 9. Security / observability

PAGES-006 remains binding:

- CORS is restricted to the Pages origin (plus explicit localhost development) but is never authorization.
- high-entropy seat/claim credentials are sent only as bearer/claim material and only hashes/verifiers reach the store boundary.
- credentials are never returned in snapshots and never written to logs.
- request bodies are bounded to 8 KB.
- every response carries request/trace identity; raw backend exception messages are not public/logged as request error detail.
- DB/admin secrets remain Worker environment secrets only.

The public 2-digit resolver returns only invitation preview fields needed to show the reserved seat/color and expiry state. It does not return bearer/claim material.

## 10. Current implementation/readiness state

`createInMemoryAuthoritativeStore()` remains deterministic contract evidence for seat auth, lobby configuration, finite invitation allocation/revocation, invitation lookup, revision CAS and idempotent replay.

`createTursoAuthoritativeStore()` composes the THREEJS-063 durable adapter plus the THREEJS-065 finite invitation namespace adapter and advertises one `turso-authoritative-v1` store. The additive v1 schema persists lobby, explicit seat configuration, current credential binding, invitations, readiness, deadline, vote and mutation receipts while preserving the original PAGES-005 probe table.

This implementation state is **not** a claim that production Turso has already been migrated or that `/v1` is live-client-ready. PAGES-005 still must perform authenticated deploy/probe for the selected `API_ORIGIN`, and PAGES-015 must qualify the matching compatibility window. THREEJS-066+ still own claim/recovery/readiness/timeout/Computer feature semantics.
