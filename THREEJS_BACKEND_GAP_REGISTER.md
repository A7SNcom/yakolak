# Three.js Backend Gap and Contradiction Register

Status: **LOCKED by THREEJS-007 (2026-08-16), ownership map corrected against the canonical THREEJS-001→100 task plan**

Scope: `threejs-rebuild` only until the named later task explicitly resolves a gap. This register is a mandatory companion to `THREEJS_SOURCE_OF_TRUTH.md`, `THREEJS_ENTRY_INVITATION_CONTRACT.md`, and `THREEJS_MIGRATION.md`.

## 1. Non-negotiable rule

Frontend code does **not** resolve any `OPEN` item in this file.

For every unresolved item:

- the Three.js client may render only state already authoritative under the current backend contract;
- it may not invent seat ownership/order, readiness, invitation validity, deadlines, timeout outcomes, bot actions, room lifetime, session recovery, mutation semantics, telemetry trust, persistence compatibility, or cutover behavior;
- deterministic presentation derived from an authoritative snapshot is allowed, but the derived value never becomes a second mutable authority;
- a gap stays open until its exact owner task records the decision and, where authority is required, implements it on the migration protocol/backend;
- a downstream UI task may consume a closed contract but may not silently close it.

## 2. Re-audit baseline

THREEJS-007 re-audited the portable kit and current migration/backend boundaries before implementation, including:

- `YAKOLAK_PORTABLE_KIT/README.md` and machine-readable approved/layout data;
- `THREEJS_SOURCE_OF_TRUTH.md` and `THREEJS_ENTRY_INVITATION_CONTRACT.md`;
- `rules/yakolak-rules.json` and `api/game-rules.js`;
- `api/rooms.js`, `api/rooms-observed.js`, `api/_telemetry.js`, and `api/telemetry.js`;
- Turso room/presence/join-rate/telemetry persistence behavior;
- `package.json`, `.env.example`, and `vercel.json`;
- the connected Vercel project/deployment configuration;
- the canonical 100-task migration plan, to ensure every gap is owned by the real later task rather than an invented task number.

Observed live baseline:

- migration workspace: `threejs-rebuild` only;
- Godot source/Production branch: `main`;
- Production domain remains `yakolak.vercel.app` until cutover;
- `vercel.json` enables Git deployment for `main` and disables it for other branches;
- room persistence is `yakolak_online_rooms_v5` with protocol `5`, plus `yakolak_online_presence_v1` and `yakolak_online_join_rate_v1`;
- room inactivity TTL is currently 3 hours, with separate 20-minute waiting-room reuse, 15-minute finished-match reuse, and 60-second stale presence behavior;
- room state uses optimistic integer `version` CAS and hashed bearer credentials;
- current room mutations are not uniform: `move`/`rematch` use `mutationId`, `edit` does not, `leave` bypasses caller version, and create/join use request-id idempotency;
- there is no authoritative ready field, configured Computer seat, seat-specific invitation reservation, absolute turn deadline, timeout mutation, or durable server-side bot trigger in protocol 5;
- telemetry writes to `yakolak_online_telemetry_v1`, redacts credential-like detail keys, retains approximately 7 days via opportunistic cleanup, and accepts client batches without making telemetry authoritative gameplay evidence;
- repository `package.json` currently says Node `22.x`, while the connected Vercel project currently reports Node `24.x`; cutover runtime compatibility remains unresolved.

Already locked product decisions remain binding: `SRC-001` wins-to-match, `SRC-002` canonical `marble`, and `SRC-004` seat-specific invitation semantics.

## 3. Correct ownership map

The earlier draft incorrectly assigned GAP-001…013 to THREEJS-008…020. That collided immediately with the real task plan (`THREEJS-008` is the static no-build architecture task). Those assignments are void.

| Gap | Status | Contract/resolution owner | Required implementation/closure tasks |
|---|---|---|---|
| GAP-001 Seat topology / turn ring / no-legal-move handoff | OPEN | **THREEJS-048** | THREEJS-054 for next-round starter/reset behavior; THREEJS-062/064/072 for online protocol implementation |
| GAP-002 Mixed Computer/Online authority | OPEN | **THREEJS-062** | THREEJS-064 seat records, THREEJS-069 readiness, THREEJS-071 server-authoritative online Computer turns |
| GAP-003 Invitation lifecycle / claim / invalidation | OPEN | **THREEJS-062** | THREEJS-063 schema, THREEJS-065 allocation, THREEJS-066 claim/session identity, THREEJS-068 invalidation |
| GAP-004 Ready/start lifecycle | OPEN | **THREEJS-062** | **THREEJS-069** authoritative ready check and explicit start |
| GAP-005 Authoritative 18-second online deadline / timeout | OPEN | **THREEJS-062** | **THREEJS-070** serverless-safe deadline reconciliation; THREEJS-072 shared transition semantics |
| GAP-006 Serverless timeout/bot triggering | OPEN | **THREEJS-062** | **THREEJS-070** timeout reconciliation + **THREEJS-071** online Computer reconciliation |
| GAP-007 Room TTL / presence / disconnect / expiry | OPEN | **THREEJS-075** | THREEJS-063 persistence support where needed |
| GAP-008 Online restart-round / rematch consensus | OPEN | **THREEJS-076** | THREEJS-072 shared mutation/transition semantics |
| GAP-009 Mutation-ID / revision / exactly-once coverage | OPEN | **THREEJS-072** | THREEJS-062 protocol envelope, THREEJS-063 receipt persistence |
| GAP-010 Session recovery / reconnect identity | OPEN | **THREEJS-066 + THREEJS-074 + THREEJS-075** | THREEJS-067 multi-tab ownership; THREEJS-094 UX consumes the closed contract |
| GAP-011 Telemetry schema / trust boundary / retention | OPEN | **THREEJS-079** | THREEJS-077 security/redaction constraints; THREEJS-098 acceptance verifies it |
| GAP-012 Persistence / protocol migration compatibility | OPEN | **THREEJS-062 + THREEJS-063** | **THREEJS-099** owns active-v5-room cutover/rollback compatibility |
| GAP-013 Production cutover / Vercel runtime compatibility | OPEN | **THREEJS-099** | THREEJS-009 owns Preview only; THREEJS-097 owns cache/header strategy before cutover |

The owner column is about who is allowed to choose the contract. The implementation column identifies tasks that must make the chosen contract real. No earlier renderer/UI task inherits authority from needing an answer.

## 4. GAP-001 — Seat topology, turn order, round starter and skip evidence — OPEN

Current conflict:

- the Kit defines the canonical spatial/color ring `marble → blue → gold → green`, rotated from the host preference;
- protocol 5 stores joined players in host/join array order and advances `turnIndex` through that array;
- current next-round starter derives from array position;
- legal-mover skipping can occur without a complete persisted skip sequence suitable for deterministic presentation.

Unresolved decisions:

- stable configured seat IDs and mapping to right/back/left/front + canonical colors;
- canonical turn order independent of connection/join order;
- representation of skip reason/evidence when one or more seats have no legal move;
- next-round starter rule after seat order is locked.

**Contract owner: THREEJS-048 — RESOLVE TURN-RING OWNERSHIP THEN IMPLEMENT LEGAL-MOVER SKIPPING.**

THREEJS-054 consumes that decision for round starter/reset. Online protocol tasks must carry the same seat order; until then live protocol-5 play follows authoritative `players`/`turnIndex` rather than frontend color-ring guesses.

## 5. GAP-002 — Mixed Computer/Online seat authority — OPEN

Current conflict:

- target setup allows remaining seats to be `Computer` or `Online` in the same match;
- protocol 5 has only joined human players and no persisted `seatType` or server bot actor.

Unresolved decisions:

- authoritative configured-seat schema and actor types;
- server-only versus credentialed identity for Computer seats;
- bot intent generation, retry, revision and idempotency behavior;
- readiness/rematch participation rules for Computer seats in online/mixed rooms.

**Contract owner: THREEJS-062.**

THREEJS-064 materializes stable seat/type records; THREEJS-069 applies readiness; THREEJS-071 makes online Computer turns server-authoritative. A browser must never become the authoritative online bot.

## 6. GAP-003 — Invitation lifecycle, claim authority and lobby invalidation — OPEN

Locked target from THREEJS-006:

- one invitation reservation per Online seat;
- manual 2-digit entry resolves an invitation, not a generic room;
- link and code entry converge on the same invitation record;
- claim returns exactly the reserved seat/color and never falls back to another seat.

Protocol-5 conflict:

- the 2-digit code is currently a room code;
- join chooses the next free `p2`/`p3`/`p4` and accepts joiner-selected color;
- no invitation persistence/lifecycle or lobby generation exists.

Unresolved decisions:

- invitation storage, active-code uniqueness and 00–99 exhaustion behavior;
- `open`/`claimed`/`expired`/`revoked`/stale-generation states;
- atomic allocation/claim and duplicate/same-identity replay;
- lobby-generation binding and revocation on configuration changes;
- exact safe unclaimed Online→Computer replacement semantics;
- behavior when a claimed invitee leaves before start.

**Contract owner: THREEJS-062.**

THREEJS-063 owns schema, THREEJS-065 allocation, THREEJS-066 idempotent claim/session identity, and THREEJS-068 invalidation. Frontend code must not fake invitation reservations locally.

## 7. GAP-004 — Ready/start lifecycle — OPEN

Current conflict:

- target contract requires explicit authoritative readiness and an explicit start gate;
- protocol 5 auto-transitions `waiting → playing` when joined humans reach `targetPlayers` and has no ready field/start mutation.

Unresolved decisions:

- readiness state per configured seat;
- exact condition that makes an Online seat ready after claim/hydration;
- Computer readiness semantics;
- who may Start and the revision/mutation envelope for Start;
- behavior if readiness/session/invitation state changes before Start commits.

**Contract owner: THREEJS-062; authoritative implementation owner: THREEJS-069.**

No UI may claim the match is ready or delay/force server start using client-only state.

## 8. GAP-005 — Authoritative 18-second online deadline and timeout — OPEN

Current conflict:

- target behavior requires one absolute authoritative 18-second deadline per turn;
- client countdown is display derived from that deadline;
- timeout consumes no piece and advances exactly once;
- protocol 5 has no deadline or timeout action.

Unresolved decisions:

- wire/persistence field (`deadlineAt` or equivalent) and server-clock semantics;
- when a new deadline is created after start, accepted move, skip, bot turn, round reset and recovery;
- expired-deadline reconciliation transaction;
- duplicate/stale timeout handling and mutation/version identity;
- presentation of clock skew without granting timeout authority to the client.

**Contract owner: THREEJS-062; implementation owner: THREEJS-070.**

THREEJS-072 must use the same timeout transition package as local authority. No browser timer may write the timeout outcome.

## 9. GAP-006 — Vercel/serverless timeout and Computer triggering — OPEN

Constraint:

- Vercel Functions are request-driven; a persistent 18-second in-process timer cannot be assumed to survive instance lifecycle;
- current API has no durable worker/queue/cron gameplay driver;
- keeping one request open merely to wait out a turn is not the migration contract.

Unresolved decisions:

- which request/wake/poll path attempts reconciliation near or after deadline;
- duplicate-safe CAS when several clients wake the same turn;
- missed/delayed wake recovery and acceptable lateness;
- server-authoritative Computer move trigger under the same concurrency conditions;
- retry/backoff without creating two bot moves or two timeout skips.

**Contract owner: THREEJS-062.**

**Timeout execution owner: THREEJS-070. Computer execution owner: THREEJS-071.** Frontend polling/wake may trigger work but never decides the authoritative result.

## 10. GAP-007 — Room TTL, presence, disconnect, expiry and reuse — OPEN

Current protocol-5 behavior:

- room inactivity TTL: 3 hours;
- waiting-room reuse cleanup: 20 minutes;
- finished-match reuse cleanup: 15 minutes;
- stale presence: 60 seconds;
- waiting-room reconciliation may remove a stale non-host seat;
- cleanup is request/opportunity driven rather than a guaranteed wall-clock job.

Portable-kit conflict: it permits an 8-hour inactive-room lifetime.

Unresolved decisions:

- canonical inactivity lifetime and what activity extends it;
- whether waiting/finished reuse windows remain separate;
- reconnect grace and stale presence meaning before versus after match start;
- host leave/cancel and non-host departure semantics;
- exact expired/cancelled/session-stale errors;
- cleanup strategy and guarantee level.

**Resolution owner: THREEJS-075 — RESOLVE ROOM TTL PRESENCE DISCONNECT AND EXPIRY CONTRACT.**

No frontend copy may promise 3 hours, 8 hours, or a grace period until THREEJS-075 closes this gap.

## 11. GAP-008 — Online restart-round and rematch consensus — OPEN

Current conflict:

- the Kit permits restart-round only before a committed move and requires the appropriate confirmation quorum;
- protocol 5 has no restart-round action;
- its `rematch` action is overloaded: before match completion it advances rounds; after match completion it collects rematch votes/restarts.

Unresolved decisions:

- exact restart eligibility and quorum for configured Online humans;
- whether Computer seats participate implicitly;
- starter preservation/recomputation;
- pending-vote cancellation on move/leave/reconfigure;
- unique mutation/revision semantics;
- explicit separation of next-round advancement from match rematch.

**Resolution/implementation owner: THREEJS-076.**

THREEJS-072 supplies the unified online transition/idempotency semantics. UI must not expose a live online restart contract earlier.

## 12. GAP-009 — Mutation-ID, revision and exactly-once coverage — OPEN

Current protocol-5 inconsistency:

- `move` and `rematch` require `mutationId` + current version;
- `edit` requires version but no mutation ID;
- `leave` has no mutation ID and substitutes the stored row version;
- create/join use request IDs rather than the normal mutation envelope;
- `_mutations` dedupe state has no migration contract for scope/retention/pruning.

Unresolved decisions:

- canonical request/mutation envelope across create, claim, edit, ready/start, move, timeout, bot, restart, round advance, rematch and leave;
- which operations legitimately lack a prior room revision;
- duplicate replay result semantics;
- mutation-receipt persistence and bounded retention;
- leave conflict behavior;
- explicit naming/separation of next-round versus rematch.

**Resolution owner: THREEJS-072 — UNIFY ONLINE MOVE SKIP TIMEOUT DRAW SCORE ROUND AND MUTATION SEMANTICS.**

THREEJS-062 defines the protocol-level shape and THREEJS-063 provides persistence support.

## 13. GAP-010 — Session recovery, reconnect identity and hydration — OPEN

Current conflict:

- target behavior requires refresh/resume/reconnect to restore the exact claimed seat then hydrate one complete authoritative snapshot before input;
- protocol 5 hashes bearer credentials at rest but does not define the migration credential lifecycle/rotation/recovery contract;
- waiting-room stale presence can remove a non-host/auth entry, while started-room disconnect behavior differs;
- remembered name/color alone is not sufficient identity.

Unresolved decisions and exact owners:

- invitation claim → high-entropy seat session issuance/recovery: **THREEJS-066**;
- same seat open in multiple tabs/windows and controller takeover: **THREEJS-067**;
- monotonic full-snapshot hydration, response ordering, reconnect barrier and stale pending intent cancellation: **THREEJS-074**;
- disconnect grace, presence and room/session expiry: **THREEJS-075**.

The UI task THREEJS-094 only presents these outcomes; it may not define them.

## 14. GAP-011 — Telemetry schema, trust boundary and retention — OPEN

Current telemetry behavior:

- `yakolak_online_telemetry_v1` stores event/trace/request/room/seat/version/round/move context;
- detail keys resembling credentials/auth/secrets are redacted and payload detail is bounded;
- cleanup targets roughly 7 days but runs opportunistically;
- client `eventId`, timestamps, event names and details can be submitted to `/api/telemetry` and therefore are not authoritative gameplay evidence by themselves;
- telemetry delivery is diagnostic and must never sit in the gameplay commit path.

Unresolved decisions:

- rebuild event taxonomy and required fields;
- server-attested versus client-observed event trust classes;
- correlation among intent, request, mutation, room version and server commit;
- endpoint authentication/abuse/rate-limit posture;
- PII/redaction rules and retention/cleanup guarantees;
- which existing room-observation wrapper behavior remains useful after protocol migration.

**Resolution owner: THREEJS-079 — MIGRATE TELEMETRY OBSERVABILITY AND SEMANTIC WATCHDOGS TO THREE.JS.**

THREEJS-077 constrains secret/data exposure; THREEJS-098 verifies redaction and release behavior.

## 15. GAP-012 — Persistence and protocol migration compatibility — OPEN

Current baseline:

- authoritative protocol-5 room state is JSON in `yakolak_online_rooms_v5` with private `auth_json`, integer `version`, and separate presence/rate tables;
- target migration fields do not exist there: configured seat types, lobby generations, invitation reservations, readiness, absolute deadline, timeout/driver metadata and uniform mutation receipts;
- inventory is currently derived from board/rules rather than maintained as a second mutable inventory;
- instance-local caches are performance conveniences, never durable correctness state.

Unresolved decisions:

- isolated new protocol/versioned route strategy versus additive v5 changes;
- schema/table versioning, defaults, indexes and mutation-receipt bounds;
- coexistence rules for Godot v5 rooms and Three.js preview rooms;
- rollback treatment for new lobby/invitation/ready/deadline/bot state;
- active-old-room support at final cutover;
- whether derived inventory/winning evidence stays derived while preserving one rules authority.

**Protocol contract owner: THREEJS-062. Database/schema owner: THREEJS-063. Active-v5-room cutover/rollback owner: THREEJS-099.**

Frontend state models must not become an accidental schema migration layer.

## 16. GAP-013 — Production cutover and Vercel runtime/deployment compatibility — OPEN

Current constraints:

- `threejs-rebuild` is intentionally not the Production deployment branch;
- `vercel.json` currently enables Git deployment only for `main`;
- `yakolak.vercel.app` remains Godot Production;
- connected Vercel Production is READY from `main`;
- repo engine declaration is Node `22.x`, connected Vercel project reports Node `24.x`;
- API requires the existing Turso environment and must not accidentally fork authority into a second production database;
- current Godot/Flash assumptions, cache headers and COOP/COEP policy cannot simply be copied blindly into final Three.js delivery.

Unresolved decisions:

- exact accepted cutover SHA/ref;
- Node/function runtime and any function-duration/background settings actually required by the migration protocol;
- environment-variable/database continuity;
- active v5-room drain/routing/compatibility window;
- domain alias switch, health verification and rollback target;
- HTML/app-shell/cache/service-worker behavior across protocol changes;
- retirement of Godot Flash publishing only after successful health checks.

**Final resolution owner: THREEJS-099 — CUT OVER PRODUCTION WITH ACTIVE-ROOM AND FULL BACKEND ROLLBACK SAFETY.**

THREEJS-009 owns one non-Production Preview path only. THREEJS-097 owns pre-cutover cache/update/security-header strategy. No earlier task may retarget `yakolak.vercel.app` or enable `threejs-rebuild` as a competing Production path.

## 17. Source-of-truth cross-reference

- `SRC-003` seat order/color ownership → GAP-001 → THREEJS-048.
- `SRC-004` invitation semantics are product-resolved by THREEJS-006; backend protocol/lifecycle → GAP-003 → THREEJS-062/063/065/066/068.
- `SRC-005` Computer/mixed authority → GAP-002 → THREEJS-062/064/071.
- `SRC-006` turn deadline/timeouts → GAP-005/GAP-006 → THREEJS-062/070/071.
- `SRC-007` lobby editing/invalidation → GAP-003 → THREEJS-068.
- `SRC-008` room expiry → GAP-007 → THREEJS-075.
- `SRC-009` restart-round → GAP-008 → THREEJS-076.
- `SRC-010` mutation coverage → GAP-009 → THREEJS-072.
- `SRC-011` ready/start → GAP-004 → THREEJS-062/069.
- session recovery → GAP-010 → THREEJS-066/067/074/075.
- telemetry → GAP-011 → THREEJS-079.
- protocol/persistence coexistence → GAP-012 → THREEJS-062/063/099.
- Production cutover/Vercel compatibility → GAP-013 → THREEJS-099.

## 18. Architecture-task collision rule

`THREEJS-008` is **DEFINE THE STATIC NO-BUILD THREE.JS ARCHITECTURE**. It does not resolve seat order or any backend authority gap. `THREEJS_MIGRATION.md` correctly warned about the earlier collision; this corrected register removes that collision and is the authoritative gap-owner mapping going forward.

Likewise, THREEJS-009 through THREEJS-020 are architecture/preview/renderer/assets tasks in the canonical plan, not backend-gap resolution tasks merely because an earlier draft assigned those numbers.

## 19. Closure rule

A later task closes only the decisions it explicitly owns. Closing one gap must not silently close another.

Every owner/closure task must:

1. record the chosen contract in this register and the relevant source-of-truth/contract file;
2. implement backend authority changes when required;
3. define v5/migration compatibility where applicable;
4. add focused contract/regression evidence;
5. keep `main` and Godot Production untouched unless the task is the explicit cutover owner;
6. append a new gap and explicit owner before frontend code depends on any newly discovered authority/persistence/session/cutover decision.
