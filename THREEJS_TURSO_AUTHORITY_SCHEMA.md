# THREEJS-063 — Turso authoritative store schema and transaction contract

Status: **LOCKED by THREEJS-063 (2026-08-20); finite manual-locator reservation extension locked by THREEJS-065 (2026-08-20)**

Scope: persistence and transaction boundaries. THREEJS-065 adds only the finite active manual-locator reservation policy/table; claim identity/session recovery remains THREEJS-066, lobby invalidation THREEJS-068, readiness/start THREEJS-069, timeout THREEJS-070 and Computer execution THREEJS-071.

## 1. One store, one transaction boundary

`backend/cloudflare/src/authoritative-store.js` remains the Worker-facing store composition point created by THREEJS-062. Turso authority uses `@tursodatabase/serverless` directly and delegates to `createTursoAuthoritativeStoreFromConnection()`; route handlers contain no SQL.

Authoritative room writes use an **IMMEDIATE interactive transaction**. Within one room transaction the order remains receipt lookup, live state/revision read, actor validation, exact revision check, optional invitation read, pure transition, state/invitation/configuration writes, durable receipt and commit. A transient `SQLITE_BUSY*` may retry the whole transaction, so callbacks remain pure.

THREEJS-065 also performs manual invitation allocation inside `withImmediate()`. Therefore two allocators cannot both commit one globally unique two-digit reservation: the active reservation table is checked/written while the database write lock is held.

## 2. Additive v1 schema

The migration remains forward-only and additive. The authority tables now include:

| Record | Table | Key / uniqueness |
|---|---|---|
| schema migration | `yakolak_authority_schema_migrations_v1` | `schema_version`, unique migration name |
| lobby / canonical state | `yakolak_authority_lobbies_v1` | `room_id` |
| current seat credential/controller binding | `yakolak_authority_seats_v1` | `(room_id, seat_id)`, unique `(room_id, credential_hash)` |
| generation-scoped configured seat identity | `yakolak_authority_seat_configurations_v1` | `(room_id, lobby_generation, seat_id)` plus unique index/slot/color per generation |
| invitation history | `yakolak_authority_invitations_v1` | `invitation_id`; locator indexed but intentionally not globally unique in history |
| **active manual 2-digit locator reservation** | **`yakolak_authority_manual_invitation_locators_v1`** | **`locator` primary key**, unique `invitation_id`, unique `(room_id,lobby_generation,seat_id)` |
| readiness | `yakolak_authority_readiness_v1` | `(room_id, lobby_generation, seat_id)` |
| deadlines | `yakolak_authority_deadlines_v1` | `(room_id, revision)` |
| votes | `yakolak_authority_votes_v1` | `(room_id, vote_kind, scope_generation, seat_id)` |
| mutation receipts | `yakolak_authority_mutation_receipts_v1` | `(room_id, idempotency_key)` |

The separate active-locator table is deliberate. Historical invitation rows may keep an old `locator` after claim/revoke/expiry and a later invitation may reuse that same value. Manual resolution consults only the one active reservation row, so historical duplicate locator strings are not ambiguous and no destructive unique-index migration is required.

The active reservation stores exactly one ASCII `00–99` value, invitation/room/seat/generation identity and expiry. Its primary key is the global finite-capacity boundary.

The existing `yakolak_pages005_room_probe_v1` table remains compatible with PAGES-005/PAGES-015 rollback workers.

## 3. THREEJS-065 finite locator lifecycle

Outcome A preserves the two-digit product contract:

- exactly 100 active manual locators globally;
- 10-minute TTL from first allocation;
- retry for the same current Online seat returns the existing reservation and does not extend TTL;
- `claimed`, `revoked` and `expired` invitations lose their active locator reservation immediately;
- a released locator may be reused by another invitation;
- a claimed seat is never re-invited merely because its locator was released;
- allocation when all 100 are active fails `INVITE_CODE_CAPACITY` with capacity 100;
- free-code ordering uses Web Crypto plus rejection-sampled Fisher–Yates shuffling.

`lookupInvitation()` resolves only an unexpired reservation whose invitation history state is still `open`. This means the short locator stops resolving immediately after claim and cannot be used as reconnect/recovery identity.

## 4. Forward-only expand/contract rule

Database migration is forward-only and additive:

1. deploy/run schema expansion before a Worker generation depends on it;
2. keep everything required by the active and previous rollback release;
3. add new versioned tables/indexes before feature use;
4. never rewrite historical invitation locator values merely to enforce active uniqueness;
5. Worker rollback switches code only — Turso data is never restored;
6. only a future compatibility task may contract old structures after the rollback window closes.

Re-running `ensureTable()` is idempotent. Manual migration still requires only backend secrets:

```bash
node scripts/migrate-threejs-authority.mjs
```

## 5. Race guarantees

The transaction boundary continues to prove one revision winner for competing moves/claims/reconciliation, exactly-once receipt replay and cross-operation idempotency rejection. THREEJS-065 adds a separate global uniqueness guarantee for active manual locators: the reservation primary key plus IMMEDIATE allocation transaction prevents two successful active reservations for one code.

Feature ownership remains separated: THREEJS-066 defines claim credential identity/recovery; 065 only guarantees reservation capacity, uniqueness, expiry/revocation/reuse and short-locator release when invitation state leaves `open`.

## 6. TTL / cleanup safety

- PAGES-005 probe rows retain their existing cleanup.
- Active lobby authority rows remain conservative and are not deleted merely because a receipt retention timestamp elapsed.
- Expired manual locator reservations are reclaimed opportunistically during allocation and cleanup, and their invitation history is marked `expired` when still `open`.
- Authority child rows and lobby rows are physically removed only after lobby tombstone + expiry.

## 7. Verification

Deterministic Node 22 / `node:sqlite` coverage includes the original THREEJS-063 transaction races plus THREEJS-065 finite-namespace contracts:

```bash
node --test tests/threejs063_turso_authority_contract.test.mjs
node --test tests/threejs065_finite_invitation_codes.test.mjs
```

The 065 contract proves exact `00–99`, unbiased rejection sampling, 100 successful active reservations, deterministic 101st-capacity failure, idempotent same-seat allocation, host/current-generation/Online guards, expiry/revocation reclamation, claim locator release and claimed-seat reallocation rejection. The manual backend optional suite is not a live Turso deployment/probe.
