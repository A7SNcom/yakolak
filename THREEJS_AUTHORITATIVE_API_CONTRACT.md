# THREEJS-062 — Authoritative API / store contract

Status: **LOCKED by THREEJS-062 (2026-08-20); durable Turso store implemented by THREEJS-063 (2026-08-20); feature semantics remain downstream**

This contract extends the already-selected PAGES-005 Cloudflare Worker. It does not create another backend, does not change the PAGES-005 compatibility identity, and does not claim a live `API_ORIGIN`. THREEJS-063 implements the durable Turso schema/CAS/receipt side of this already-locked interface without taking HTTP/UI ownership.

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
- `transactAuthority()`
- `commitMutation()` — current move-route convenience wrapper over `transactAuthority()`

`transactAuthority()` is the common CAS/idempotency boundary for later room-only and room+invitation transactions. Its contract carries authoritative room scope, actor framing, expected revision, idempotency identity, request fingerprint, operation name, optional invitation scope, and a pure transition callback. Duplicate identity is resolved before a transition callback is allowed to run.

THREEJS-063 now implements this interface transactionally in Turso behind `backend/cloudflare/src/authoritative-turso-store.js`; route handlers still contain no SQL. The durable adapter uses room-scoped receipts and one transaction boundary for receipt lookup, revision validation, optional invitation state, accepted state update and receipt persistence. Schema/migration details are locked in `THREEJS_TURSO_AUTHORITY_SCHEMA.md`.

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

THREEJS-065 still owns the finite manual-locator capacity decision and allocation policy, including whether the historical `00–99` contract remains or is explicitly superseded. THREEJS-063 deliberately leaves locator allocation/active uniqueness/reuse policy open: its schema indexes locator lookup but does not impose a global unique locator constraint, and ambiguous lookup fails closed until THREEJS-065 implements the chosen policy.

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

Timeout reconciliation uses a `server` actor and reserved operation `reconcile-timeout`, with current revision plus idempotency identity through the common store transaction boundary. THREEJS-063 provides the transactional persistence/race boundary; THREEJS-070 implements the actual expiry reconciliation and transition semantics.

## 7. Online Computer framing

A configured `computer` seat has no browser authority. When it becomes active, request/wake/mutation traffic may trigger backend reconciliation, but the server verifies current revision/deadline, generates the legal bot intent through shared rules, and commits at most one result through the common transaction boundary.

The reserved operation is `reconcile-computer`; THREEJS-063 provides the same transactional race boundary used by timeout/move/claim work, while THREEJS-071 implements strategy/reconciliation details. Concurrent browser triggers must converge on one accepted room revision/result.

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

The authenticated store derives the seat. The move transition comes only from `web/app/shared/transitions.js`. Duplicate mutation replay returns the committed receipt/snapshot without running the transition a second time. Reusing one room-scoped mutation/idempotency id for different content, operation, or actor identity fails.

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

`createInMemoryAuthoritativeStore()` remains deterministic contract evidence. It implements server-derived seat auth, invitation lookup over seeded records, room/invitation transaction scope, revision CAS, idempotent stable replay and request fingerprint/actor/operation reuse rejection.

`createTursoAuthoritativeStore()` now composes the THREEJS-063 durable adapter and advertises `turso-authoritative-v1` with authoritative read/mutation/invitation/transaction support and durable mutation receipts. The additive v1 schema persists lobby, seat, invitation, readiness, deadline, vote and mutation-receipt records while preserving the original PAGES-005 probe table. Migration is forward-only/expand-contract and Worker rollback never requires restoring Turso data.

This implementation state is **not** a claim that production Turso has already been migrated or that `/v1` is live-client-ready. Before a dependent Worker generation is deployed, the THREEJS-063 schema migration must run with backend-only Turso credentials; PAGES-005 must still perform the authenticated deploy/probe for the selected `API_ORIGIN`; PAGES-015 must qualify the matching compatibility window. THREEJS-064+ still own the actual room/invitation/readiness/timeout/computer feature semantics.
