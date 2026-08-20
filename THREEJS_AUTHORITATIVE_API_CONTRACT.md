# THREEJS-062 — Authoritative API / store contract

Status: **LOCKED by THREEJS-062 (2026-08-20); durable Turso implementation and feature semantics remain downstream**

This contract extends the already-selected PAGES-005 Cloudflare Worker. It does not create another backend, does not change the PAGES-005 compatibility identity, does not create the THREEJS-063 Turso schema, and does not claim a live `API_ORIGIN`.

## 1. One Worker, one store interface

The runtime remains `backend/cloudflare/src/worker.js`. PAGES-005 probe routes and the versioned `/v1` authoritative shell receive the same store object.

The exact store interface for THREEJS-063 is:

- `getCapabilities()`
- `ensureTable()`
- `writeRoom()`
- `readRoom()`
- `cleanup()`
- `authorizeSeat()`
- `lookupInvitation()`
- `transactAuthority()`
- `commitMutation()` — current move-route convenience wrapper over `transactAuthority()`

`transactAuthority()` is the common CAS/idempotency boundary for later room-only and room+invitation transactions. Its contract carries authoritative room scope, actor framing, expected revision, idempotency identity, request fingerprint, operation name, optional invitation scope, and a pure transition callback. Duplicate identity is resolved before a transition callback is allowed to run.

THREEJS-063 must implement this interface transactionally in Turso. Route handlers must not add their own SQL.

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

Each persisted invitation belongs to one room/lobby generation and one already-reserved stable seat. Locator resolution is lookup only and never grants seat authority. Same-identity claim recovery is based on a separate high-entropy claim/seat credential, never possession of the short locator.

THREEJS-065 still owns the finite manual-locator capacity decision and allocation policy, including whether the historical `00–99` contract remains or is explicitly superseded. THREEJS-062 deliberately does not allocate codes or claim that collision handling removes the finite namespace limit.

THREEJS-066 implements atomic idempotent claim/recovery. THREEJS-068 implements lobby-generation invalidation and the safe unclaimed Online→Computer replacement rule. THREEJS-077 later owns enumeration/rate-limit/data-exposure hardening.

## 5. Readiness / explicit start framing

Readiness is authoritative per configured seat and lobby generation:

- Computer seats are ready immediately.
- Online seats become ready only after successful claim plus hydration of the current lobby generation.
- the host controls the explicit Start action.

Filling the configured seats, invitation claim, refresh or polling never auto-starts the match. `start-match` is a revision/idempotency transaction and succeeds only when the authoritative readiness gate passes.

THREEJS-069 owns implementation of this rule and the exact start transition.

## 6. Deadline framing

The authoritative online deadline field is `deadlineAtMs` and represents an absolute server-clock deadline. The locked turn duration is `18_000 ms`.

The browser may render a countdown derived from this value and may issue a poll/wake request near expiry. It may not decide timeout, extend the deadline, or rely on an in-process 18-second timer surviving Worker lifecycle.

Timeout reconciliation uses a `server` actor and reserved operation `reconcile-timeout`, with current revision plus idempotency identity through the common store transaction boundary. THREEJS-070 implements the actual expiry reconciliation and transition semantics.

## 7. Online Computer framing

A configured `computer` seat has no browser authority. When it becomes active, request/wake/mutation traffic may trigger backend reconciliation, but the server verifies current revision/deadline, generates the legal bot intent through shared rules, and commits at most one result through the common transaction boundary.

The reserved operation is `reconcile-computer`; THREEJS-071 implements strategy/reconciliation details. Concurrent browser triggers must converge on the same committed result.

## 8. Mutation / transition framing

The currently exposed mutation route accepts only an exact move envelope:

```json
{
  "mutationId": "opaque-id",
  "expectedRevision": 7,
  "action": "move",
  "payload": { "cell": 4, "size": "medium" }
}
```

The authenticated store derives the seat. The move transition comes only from `web/app/shared/transitions.js`. Duplicate mutation replay returns the committed receipt/snapshot without running the transition a second time. Reusing one mutation id for different content fails.

The generic transaction identity reserved by this contract supports later operations:

- `configure-lobby`
- `claim-invitation`
- `invalidate-lobby`
- `set-ready`
- `start-match`
- `move`
- `reconcile-timeout`
- `reconcile-computer`

These names lock transport/transaction identity only. Their feature semantics remain owned by THREEJS-064/065/066/068/069/070/071, while THREEJS-072 unifies move/skip/timeout/draw/score/round and other state-changing transition semantics with the local pure transition package.

## 9. Security / observability

PAGES-006 remains binding:

- CORS is restricted to the Pages origin (plus explicit localhost development) but is never authorization.
- high-entropy seat/claim credentials are sent only as bearer/claim material and only hashes/verifiers reach the store boundary.
- credentials are never returned in snapshots and never written to logs.
- request bodies are bounded to 8 KB.
- every response carries request/trace identity; raw backend exception messages are not public/logged as request error detail.
- DB/admin secrets remain Worker environment secrets only.

## 10. Current implementation/readiness state

`createInMemoryAuthoritativeStore()` is deterministic contract evidence. It implements server-derived seat auth, invitation lookup over seeded records, room/invitation transaction scope, revision CAS, idempotent replay and request fingerprint reuse rejection.

`createTursoAuthoritativeStore()` intentionally remains PAGES-005 probe-only and advertises authoritative read/mutation/invitation/transaction capability as unavailable. Its authoritative methods fail closed until THREEJS-063 implements durable schema/CAS/receipts.

Therefore THREEJS-062 may be locally tested and Wrangler-compiled, but **must not be described as live online-client readiness**. Live integration later requires the THREEJS-063 durable store, PAGES-005 authenticated deploy/probe of the selected `API_ORIGIN`, and PAGES-015 compatibility qualification.
