# THREEJS-062 — Authoritative API / store contract

Status: **LOCKED by THREEJS-062 (2026-08-20); durable Turso store implemented by THREEJS-063; lobby configuration by THREEJS-064; finite locator allocation by THREEJS-065**

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
- `transactAuthority()`
- `commitMutation()` — current mutation convenience wrapper over `transactAuthority()`

`transactAuthority()` is the common CAS/idempotency boundary for room and room+invitation state transitions. `allocateInvitation()` is the THREEJS-065 host-authorized finite-locator allocation boundary. Route handlers still contain no SQL.

THREEJS-063 implements this interface transactionally in Turso behind `backend/cloudflare/src/authoritative-turso-store.js`; schema/migration details are locked in `THREEJS_TURSO_AUTHORITY_SCHEMA.md`.

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

Invitation allocation is host-owned: `allocateInvitation()` requires the current configured host seat plus its credential generation and refuses Computer, stale-generation, non-host or already-claimed targets.

## 4. Invitation lifecycle framing

The backend invitation lifecycle vocabulary is:

- `open`
- `claimed`
- `revoked`
- `expired`

Each invitation belongs to one room/lobby generation and one already-reserved stable Online seat. Locator resolution is lookup only and never grants seat authority. Same-identity claim recovery is based on a separate high-entropy claim/seat credential, never possession of the short locator.

THREEJS-065 locks Outcome A for manual entry:

- `00–99` remains the complete manual locator namespace;
- exactly 100 manual locator reservations may be active globally;
- active reservations expire after 10 minutes;
- retrying allocation for the same current Online seat returns the existing reservation without extending TTL;
- `claimed`, `revoked` or `expired` releases the short locator;
- the 101st active allocation fails `INVITE_CODE_CAPACITY`;
- active uniqueness lives in `yakolak_authority_manual_invitation_locators_v1`, while invitation history may legitimately reuse old locator strings after release;
- free-code ordering uses Web Crypto with rejection-sampled Fisher–Yates shuffling.

`lookupInvitation()` resolves only the current unexpired reservation whose invitation state is still `open`. After claim the short code no longer resolves; THREEJS-066 owns claim identity and reconnect recovery.

THREEJS-068 implements lobby-generation invalidation and the safe unclaimed Online→Computer replacement rule. THREEJS-077 owns enumerable-locator rate limiting and data-exposure hardening.

## 5. Readiness / explicit start framing

Readiness is authoritative per configured seat and lobby generation:

- Computer seats are ready immediately.
- Online seats become ready only after successful claim plus hydration of the current lobby generation.
- the host controls the explicit Start action.

Filling configured seats, invitation claim, refresh or polling never auto-starts the match. `start-match` is a revision/idempotency transaction and succeeds only when the authoritative readiness gate passes. THREEJS-069 owns implementation of this rule.

## 6. Deadline framing

The authoritative online deadline field is `deadlineAtMs` and represents an absolute server-clock deadline. The locked turn duration is `18_000 ms`.

The browser may render a countdown and may issue wake/poll traffic. It may not decide timeout or keep an in-process serverless timer alive. Timeout reconciliation uses a `server` actor and `reconcile-timeout`; THREEJS-070 owns actual expiry reconciliation.

## 7. Online Computer framing

A configured `computer` seat has no browser authority. Request/wake/mutation traffic may trigger backend reconciliation, but server state verifies authority and at most one result commits through the common transaction boundary. THREEJS-071 owns strategy/reconciliation details.

## 8. Mutation / transition framing

The existing `/v1/rooms/:roomId/mutations` route now supports the THREEJS-064 `configure-lobby` envelope in addition to `move`; future reserved operations remain gated until their owner tasks implement them.

Move still derives the authenticated seat and executes gameplay only through `web/app/shared/transitions.js`. Duplicate mutation replay returns the committed receipt/snapshot without running the transition twice. Reusing one room-scoped mutation/idempotency id for different content, operation or actor identity fails.

Reserved transaction operation names remain:

- `configure-lobby`
- `claim-invitation`
- `invalidate-lobby`
- `set-ready`
- `start-match`
- `move`
- `reconcile-timeout`
- `reconcile-computer`

These names do not transfer feature ownership away from THREEJS-064/065/066/068/069/070/071/072.

## 9. Security / observability

PAGES-006 remains binding:

- CORS allowlists are never authorization;
- high-entropy credentials/verifiers are backend-auth material and raw secrets do not enter public snapshots/logs;
- DB/admin secrets remain Worker environment secrets only;
- request bodies stay bounded and request/trace identities remain normalized;
- the two-digit locator is explicitly enumerable and is **not** a credential; THREEJS-077 must harden public resolution/rate limits before client exposure.

THREEJS-065 intentionally does not add a public unauthenticated resolver/claim route. It locks the datastore allocation/resolution semantics first; later transport must preserve them.

## 10. Current implementation/readiness state

`createInMemoryAuthoritativeStore()` provides deterministic authority evidence, including finite manual allocation/reclamation. `createTursoAuthoritativeStore()` composes the durable adapter with lobby/seat/configuration/invitation/active-locator/readiness/deadline/vote/receipt persistence.

The active two-digit namespace is now implemented in storage, but this is **not** a production-readiness claim. The backend optional suite remains manual, production Turso migration/deploy/probe still requires backend credentials, and PAGES-005/PAGES-015 live compatibility qualification remains required. THREEJS-066+ still own claim/session identity, invalidation, ready/start, timeout and Computer behavior.
