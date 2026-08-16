# Three.js Backend Gap and Contradiction Register

Status: **LOCKED by THREEJS-007 (2026-08-16)**

Scope: `threejs-rebuild` only until explicit resolution/cutover tasks change the entries below. This register is a mandatory companion to `THREEJS_SOURCE_OF_TRUTH.md` and `THREEJS_ENTRY_INVITATION_CONTRACT.md`.

## 1. Non-negotiable rule

Frontend code does **not** resolve any entry in this file.

For every `OPEN` entry:

- the Three.js client may render only state already authoritative under the current backend contract;
- it may not invent seat ownership, ready state, deadlines, timeout outcomes, bot actions, invitation validity, room lifetime, session recovery, idempotency, or cutover behavior;
- deterministic presentation derived from an authoritative snapshot is allowed, but a derived value must never become a second mutable authority;
- the entry stays open until the exact owner task named below records the resolution and, where required, implements the authoritative backend change.

## 2. Audit baseline

THREEJS-007 re-audited these sources before implementation:

- `YAKOLAK_PORTABLE_KIT/README.md`;
- `THREEJS_SOURCE_OF_TRUTH.md`;
- `THREEJS_ENTRY_INVITATION_CONTRACT.md`;
- `rules/yakolak-rules.json`;
- `api/game-rules.js`;
- `api/rooms.js`;
- `api/rooms-observed.js`;
- `api/_telemetry.js` and `api/telemetry.js`;
- Turso persistence/schema behavior embedded in `api/rooms.js`;
- `.env.example`, `package.json`, `vercel.json`;
- live Vercel project/deployment configuration observed during this task.

Observed migration baseline at audit time:

- migration workspace: `threejs-rebuild`;
- Godot source/Production branch: `main`;
- canonical Production domain remains `yakolak.vercel.app`;
- Vercel `vercel.json` enables Git deployment for `main` and disables it for other branches;
- current room persistence uses Turso tables `yakolak_online_rooms_v5`, `yakolak_online_presence_v1`, and `yakolak_online_join_rate_v1` with protocol `5`;
- telemetry uses Turso table `yakolak_online_telemetry_v1`;
- the current backend uses optimistic room `version` CAS and hashed seat credentials;
- no current backend field represents an authoritative turn deadline, ready state, configured computer seat, or seat-specific invitation reservation.

Resolved product decisions already locked by earlier tasks remain binding: `SRC-001` wins-to-match, `SRC-002` canonical `marble`, and `SRC-004` seat-specific invitation semantics. This register records the backend work still required to make those locked decisions interoperable.

## 3. Ownership map

| Gap | Status | Exact resolution owner |
|---|---|---|
| GAP-001 Seat topology, turn order, round starter and no-legal-move handoff | OPEN | **THREEJS-008** |
| GAP-002 Mixed Computer/Online seat authority | OPEN | **THREEJS-009** |
| GAP-003 Invitation lifecycle, claim authority and lobby invalidation | OPEN | **THREEJS-010** |
| GAP-004 Ready/start lifecycle | OPEN | **THREEJS-011** |
| GAP-005 Authoritative 18-second deadline and timeout mutation | OPEN | **THREEJS-012** |
| GAP-006 Vercel/serverless turn driver and bot triggering | OPEN | **THREEJS-013** |
| GAP-007 Room TTL, presence and expiry/reuse policy | OPEN | **THREEJS-014** |
| GAP-008 Restart-round contract | OPEN | **THREEJS-015** |
| GAP-009 Mutation-ID/revision/idempotency coverage | OPEN | **THREEJS-016** |
| GAP-010 Session recovery and reconnect identity | OPEN | **THREEJS-017** |
| GAP-011 Telemetry schema, trust boundary and retention | OPEN | **THREEJS-018** |
| GAP-012 Persistence/protocol migration compatibility | OPEN | **THREEJS-019** |
| GAP-013 Cutover and Vercel runtime/deployment compatibility | OPEN | **THREEJS-020** |

The task numbers above are ownership assignments, not permission to implement them inside THREEJS-007.

## 4. GAP-001 — Seat topology, turn order, round starter and skip evidence — OPEN

**Conflict/gap**

- The Kit defines a fixed canonical ring `marble → blue → gold → green`, rotated from the host preferred color.
- Current `api/rooms.js` appends players in host/join order and advances `turnIndex` through the `players` array.
- `advanceRoundState()` chooses the next starter from array position using the round number.
- `nextPlayablePlayer()` can skip seats with no legal move, but the persisted/public state does not record the complete skipped sequence; `skippedSeat` is normally reset to `null`.

**Unresolved decisions**

- canonical seat IDs and their relationship to color/spatial positions;
- whether online turn order migrates to the Kit ring or preserves a backend-defined seat order;
- exact next-round starter rule after the seat topology is locked;
- authoritative evidence for one or multiple no-legal-move skips so presentation does not guess what happened.

**Resolution owner: THREEJS-008 — LOCK AUTHORITATIVE SEAT TOPOLOGY AND TURN ORDER.**

Until THREEJS-008 resolves this, the Three.js frontend must follow the current authoritative `players`/`turnIndex` snapshot for live online play and must not substitute the visual color ring as online turn authority.

## 5. GAP-002 — Mixed Computer/Online authority — OPEN

**Conflict/gap**

- The Kit requires every remaining configured seat to be `Computer` or `Online`, including mixed matches, with computer decisions made on the authoritative side whenever the session is online.
- Current room state contains only joined human `players`; there is no persisted `seatType`, configured computer seat, bot identity, bot readiness, or bot mutation path.

**Unresolved decisions**

- authoritative seat configuration schema (`local-human`/`online-human`/`computer` as applicable);
- whether computer seats own normal seat credentials internally or use a server-only actor identity;
- bot legal-intent generation, mutation identity and retry/idempotency semantics;
- rematch/readiness requirements when configured seats include computers.

**Resolution owner: THREEJS-009 — DEFINE AUTHORITATIVE SEAT TYPES AND MIXED COMPUTER AUTHORITY.**

No browser may act as the authoritative bot for an online/mixed match before THREEJS-009 resolves this.

## 6. GAP-003 — Invitation lifecycle, claim authority and lobby invalidation — OPEN

**Conflict/gap**

- THREEJS-006 already locked the target contract: one exact invitation reservation per online seat; a 2-digit code resolves that invitation; link and code converge; claim returns the reserved seat/color.
- Current `api/rooms.js` instead uses the 2-digit value as `room_code`, chooses the next free `p2/p3/p4`, accepts joiner-selected color, and has no invitation table/state.
- The Kit invalidates existing invitations/lobby configuration after protected setup changes, except the narrow unjoined-online-seat → computer replacement case. Current `edit` mutates the same waiting room.

**Unresolved decisions**

- invitation persistence schema and unique locator allocation when one room has multiple invitations;
- states `open`, `claimed`, `expired`, `cancelled`, and stale-after-reconfiguration;
- atomic claim/CAS behavior under concurrent link/code claims;
- claim idempotency and same-identity recovery;
- configuration revision binding and exact invalidation/recreation behavior;
- cancellation/expiry rules and the one allowed online→computer replacement path;
- lifecycle behavior when a claimed invitee later leaves the waiting lobby.

**Resolution owner: THREEJS-010 — IMPLEMENT AUTHORITATIVE INVITATION LIFECYCLE AND LOBBY REVISION.**

The frontend must not emulate reservations with local state or reinterpret the old generic room code as compliant.

## 7. GAP-004 — Ready/start lifecycle — OPEN

**Conflict/gap**

- The Kit requires explicit authoritative readiness and start only after all configured seats are ready; computer seats are ready immediately and online seats become ready after joining.
- Current `joinState()` changes `status` to `playing` automatically when `players.length === targetPlayers`; there is no ready field or start mutation.

**Unresolved decisions**

- persisted readiness schema per configured seat;
- whether joining automatically sets an online seat ready or readiness is a distinct acknowledgement;
- who may issue/start the match and whether start itself needs a mutation ID/version;
- what happens if readiness changes, a player disconnects, or an invitation is invalidated before start.

**Resolution owner: THREEJS-011 — ADD AUTHORITATIVE READY/START LIFECYCLE.**

The frontend may show current join status but may not invent a ready gate or locally delay/force authoritative start.

## 8. GAP-005 — Authoritative 18-second deadline and timeout mutation — OPEN

**Conflict/gap**

- The Kit requires one authoritative 18-second deadline per turn, client timers derived from that deadline, timeout skip without board/inventory mutation, and fresh deadline on handoff.
- Current room state has no deadline/timer fields and no timeout mutation/action.

**Unresolved decisions**

- persisted deadline representation (`deadlineAt` or equivalent), server clock semantics and when it begins;
- timeout claim/commit transaction and stale/duplicate timeout behavior;
- version and mutation ID behavior for timeout commits;
- deadline reset after accepted move, no-legal-move skip, bot turn, round reset, reconnect and start;
- how clients display clock skew without owning timeout authority.

**Resolution owner: THREEJS-012 — ADD AUTHORITATIVE 18-SECOND TURN DEADLINE AND TIMEOUT SKIP.**

No client timer may advance `turnIndex` or write a timeout result before THREEJS-012 resolves this.

## 9. GAP-006 — Vercel/serverless turn driver and bot triggering — OPEN

**Conflict/gap**

- A persistent in-process timer cannot be assumed across Vercel Function invocations/instances.
- The current API is request-driven and contains no durable turn driver, queue, cron/worker trigger, or server-side bot trigger.
- Current `vercel.json` does not configure a gameplay-function `maxDuration` or any scheduled driver.
- Vercel supports bounded function execution and explicit post-response/background primitives, but those are not themselves a durable 18-second game scheduler.

**Unresolved decisions**

- durable mechanism that causes timeout/bot work to be attempted after authority commits a deadline;
- duplicate-safe compare-and-swap so multiple triggers cannot make two bot moves or two timeout skips;
- retry/backoff and recovery when no trigger executes exactly at the deadline;
- whether a request/queue/cron/poll-assisted driver is used and the maximum tolerated trigger lateness;
- how bot computation fits inside Vercel execution limits without keeping a request open for 18 seconds.

**Resolution owner: THREEJS-013 — DEFINE VERCEL-SAFE AUTHORITATIVE TURN DRIVER AND BOT TRIGGERING.**

No frontend polling loop may be treated as the sole authority that makes a bot move or timeout happen.

## 10. GAP-007 — Room TTL, presence and expiry/reuse policy — OPEN

**Conflict/gap**

- The Kit permits room expiry after 8 hours without activity.
- Current backend sets `ROOM_TTL_MS` to 3 hours and refreshes expiry on room update.
- It also has separate reuse windows: waiting rooms may be deleted after 20 minutes and completed matches after 15 minutes when cleanup runs.
- Presence uses a 60-second stale window; waiting-room reconciliation can remove a non-host seat after it is no longer present.
- Cleanup is request-driven rather than a guaranteed wall-clock job.

**Unresolved decisions**

- one canonical inactivity TTL and which events refresh it;
- whether waiting/finished reuse windows remain separate from room expiry;
- canonical online presence stale threshold and whether stale presence may remove a seat;
- exact user-visible expired/cancelled/session-stale errors;
- cleanup scheduling/guarantees versus lazy cleanup on requests.

**Resolution owner: THREEJS-014 — LOCK ROOM TTL, PRESENCE, EXPIRY AND REUSE POLICY.**

Frontend copy must not promise 8 hours, 3 hours, or any disconnect grace period as a product guarantee until THREEJS-014 resolves it.

## 11. GAP-008 — Restart-round contract — OPEN

**Conflict/gap**

- The Kit permits restart round only before a committed move and requires host/every-online-human confirmation according to authority mode.
- Current backend exposes `move`, `rematch`, `edit`, and `leave`; no restart-round action exists.

**Unresolved decisions**

- exact eligibility condition (`moveNumber === 0` plus lifecycle guards);
- confirmation quorum for offline, online and mixed seats;
- mutation/revision/idempotency behavior;
- whether restart preserves current starter or recomputes it;
- cancellation and timeout of a pending restart vote.

**Resolution owner: THREEJS-015 — ADD AUTHORITATIVE RESTART-ROUND CONTRACT.**

Do not render restart as a live online capability before that task closes this gap.

## 12. GAP-009 — Mutation-ID, revision and idempotency coverage — OPEN

**Conflict/gap**

- The Kit says every mutating request carries a unique request/move ID and current revision and every accepted mutation commits exactly once.
- Current `move` and `rematch` require `mutationId` and version.
- `edit` requires version but not mutation ID.
- `leave` has no mutation ID and intentionally substitutes the current stored row version for caller version.
- `create`/`join` use `requestId`-based idempotency but do not share the normal mutation/version contract.
- The `rematch` action is also overloaded: before match completion it advances to the next round; after match completion it records rematch votes/restarts the match.

**Unresolved decisions**

- canonical mutation envelope and identifier naming across create, claim/join, ready/start, move, timeout, bot, edit/reconfigure, restart-round, next-round, rematch and leave;
- which actions legitimately have no prior room revision (for example initial create) and what replaces it;
- whether leave remains version-bypassing or becomes CAS-protected;
- dedupe retention/pruning policy for `_mutations` so state does not grow without bound;
- separation or explicit naming of next-round advancement versus match rematch.

**Resolution owner: THREEJS-016 — COMPLETE MUTATION-ID, REVISION AND IDEMPOTENCY COVERAGE.**

Frontend networking must follow the current live per-action behavior until this task changes the backend; it must not assume one uniform envelope exists today.

## 13. GAP-010 — Session recovery and reconnect identity — OPEN

**Conflict/gap**

- The Kit requires launch/refresh/resume/reconnect to restore identity and rebuild a complete snapshot before input.
- THREEJS-006 requires a claimed invitation to recover the same seat identity.
- Current backend hashes bearer credentials into `auth_json`, but session-token persistence/rotation/recovery policy is not defined as a migration contract.
- Waiting-room presence reconciliation may remove a non-host after the 60-second stale window and filters that seat's auth entry; a later request with the old credential may therefore no longer recover that waiting seat.
- Playing rooms are not reconciled the same way, so disconnect semantics differ by lifecycle state.

**Unresolved decisions**

- client credential storage scope and security boundaries;
- session credential issuance/rotation/revocation and same-device recovery;
- reconnect grace behavior in waiting versus playing states;
- full-snapshot resync contract and input unlock conditions;
- stale pending mutation handling after a recovered snapshot;
- relationship between invitation claim identity and recovered room session identity.

**Resolution owner: THREEJS-017 — DEFINE SESSION RECOVERY, RECONNECT AND PRESENCE RECONCILIATION.**

The frontend must never recreate seat ownership from remembered color/name alone.

## 14. GAP-011 — Telemetry schema, trust boundary and retention — OPEN

**Current behavior/gaps**

- `api/_telemetry.js` writes client/server events into `yakolak_online_telemetry_v1`, redacts credential-like keys, caps detail size, and includes release SHA when available.
- `api/telemetry.js` accepts client event batches but currently defines no room-session authentication requirement in the endpoint itself and no explicit ingest rate limit.
- Client-controlled `eventId`, timestamps and details are stored after sanitization; therefore telemetry cannot be treated as authoritative gameplay evidence without a trust model.
- `rooms-observed.js` captures request/response exchange telemetry with a 300 ms persistence deadline after returning the gameplay response.
- telemetry retention is targeted at 7 days, but cleanup is opportunistic (every 200 writes) rather than a separate guaranteed retention job.
- No migration document currently locks the required event taxonomy for invitation, ready/start, timeout, bot, recovery and cutover flows.

**Unresolved decisions**

- authoritative event names/required fields for the rebuild;
- which events are server-attested versus client-observed;
- authentication, abuse/rate-limit policy and PII/redaction contract;
- correlation IDs across UI intent, API request, mutation ID, room version and server commit;
- exact retention/cleanup policy and operational query expectations;
- whether `rooms-observed.js` remains the canonical room endpoint/wrapper or observability is integrated differently.

**Resolution owner: THREEJS-018 — LOCK TELEMETRY SCHEMA, TRUST BOUNDARY AND RETENTION.**

Telemetry may diagnose authority; it never becomes authority and frontend behavior must not depend on telemetry delivery success.

## 15. GAP-012 — Persistence/protocol migration compatibility — OPEN

**Current behavior/gaps**

- Online room state is persisted as JSON in `yakolak_online_rooms_v5`; private credential hashes are in `auth_json`; optimistic concurrency is the integer `version`; public protocol is `5`.
- Presence and join-rate data are separate tables.
- Several target Three.js fields do not exist in protocol 5: configured seat types, invitation reservations, readiness, deadline/timeout state and durable driver metadata.
- Inventory is currently derived from authoritative board occupancy via shared rules rather than stored as a separate mutable inventory object.
- Winning patterns can be recomputed deterministically from the board/rules, but the current public room snapshot does not persist an explicit winning-slot payload.
- Instance-local caches (`client`, `tablesReady`, `presenceTouchCache`) are performance conveniences and cannot be treated as durable correctness state.

**Unresolved decisions**

- additive migration of v5 versus a new table/protocol version;
- schema defaults and backward compatibility for rooms created by the Godot client;
- whether active old rooms can be read/mutated by the Three.js client and vice versa during transition;
- migration/rollback treatment for new invitation, ready, deadline and bot fields;
- whether derived inventory/winning evidence remains derived or becomes explicit wire state, while retaining one rules authority;
- pruning/size limits for accumulated room JSON state and idempotency metadata.

**Resolution owner: THREEJS-019 — LOCK PERSISTENCE SCHEMA AND PROTOCOL MIGRATION COMPATIBILITY.**

Frontend models must not become the de facto schema migration layer.

## 16. GAP-013 — Cutover and Vercel runtime/deployment compatibility — OPEN

**Current behavior/gaps**

- `threejs-rebuild` is intentionally not a Production deployment path; `vercel.json` enables Git deployment for `main` and disables `*` other branches.
- Godot Production remains `yakolak.vercel.app` until explicit cutover.
- The live Vercel project observed during THREEJS-007 was serving READY Production deployments from `main`.
- Repository `package.json` declares Node `22.x`, while the connected Vercel project currently reports Node `24.x`; the runtime version to carry into cutover is not yet locked.
- Online API requires `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; cutover must preserve the correct environment and database access without creating a parallel authoritative backend accidentally.
- Current Flash/Godot publishing rules and the branch exception deliberately prevent the rebuild from silently replacing Production.

**Unresolved decisions**

- exact cutover commit/ref and how `main` changes from Godot to Three.js;
- runtime version/configuration for API functions and any required `maxDuration`/background primitives;
- environment-variable continuity and protocol/database compatibility at the switch;
- whether old Godot clients/active rooms remain supported for a bounded compatibility window;
- domain aliasing, rollback target, cache behavior and release-SHA observability;
- removal/replacement of Godot Flash build assumptions without introducing a competing deployment path.

**Resolution owner: THREEJS-020 — EXECUTE AND VERIFY THREE.JS CUTOVER COMPATIBILITY.**

No earlier frontend task may enable branch Production deployment, retarget `yakolak.vercel.app`, or modify `main` as a workaround.

## 17. Cross-reference to existing contradiction register

Existing `THREEJS_SOURCE_OF_TRUTH.md` entries map to this register as follows:

- `SRC-003` → GAP-001 / THREEJS-008.
- `SRC-004` target semantics are RESOLVED by THREEJS-006; backend implementation/lifecycle → GAP-003 / THREEJS-010 and recovery → GAP-010 / THREEJS-017.
- `SRC-005` → GAP-002 / THREEJS-009.
- `SRC-006` → GAP-005 / THREEJS-012 plus execution/triggering → GAP-006 / THREEJS-013.
- `SRC-007` → GAP-003 / THREEJS-010.
- `SRC-008` → GAP-007 / THREEJS-014.
- `SRC-009` → GAP-008 / THREEJS-015.
- `SRC-010` → GAP-009 / THREEJS-016.
- `SRC-011` → GAP-004 / THREEJS-011.

Additional audit gaps not previously explicit in the source-of-truth register are GAP-010 session recovery, GAP-011 telemetry, GAP-012 persistence/protocol migration, and GAP-013 cutover/Vercel compatibility.

## 18. Closure rule

A later owner task closes only its named gap. Closing one gap must not silently resolve another.

Every owner task must:

1. record the chosen contract in this file and the relevant source-of-truth/contract file;
2. implement backend changes when authority is required;
3. define migration/compatibility behavior for existing protocol/state where applicable;
4. add focused contract/regression evidence appropriate to that task;
5. leave `main` and Godot Production untouched unless the owner is the explicit cutover task.

If a later task discovers another backend decision that could change gameplay authority, persistence, online identity, lifecycle or cutover behavior, it must append a new gap with one explicit owner **before** frontend code depends on that decision.
