# THREEJS-063 — Turso authoritative store schema and transaction contract

Status: **LOCKED by THREEJS-063 (2026-08-20)**

Scope: persistence only. This task does not own HTTP routes, UI, room-feature policy, invitation-code allocation, ready/start policy, timeout semantics, bot choice, rematch semantics, or client integration. Those remain with THREEJS-064+ owners.

## 1. One store, one transaction boundary

`backend/cloudflare/src/authoritative-store.js` remains the Worker-facing store composition point created by THREEJS-062. Turso authority now uses `@tursodatabase/serverless` directly and delegates to `createTursoAuthoritativeStoreFromConnection()`; route handlers contain no SQL.

All authoritative writes go through `transactAuthority()` / `commitMutation()` and use an **IMMEDIATE interactive transaction**. Within one transaction the order is fixed:

1. look up the room-scoped idempotency receipt;
2. if present, require exact operation/fingerprint/actor identity and replay the stored committed result;
3. read the live lobby revision/state;
4. validate seat credential generation when the actor is a seat;
5. require exact `expectedRevision`;
6. read the optional invitation inside the same transaction;
7. execute the pure transition callback;
8. update optional invitation state + lobby state/revision;
9. insert the unique room-scoped durable receipt;
10. commit.

A transient `SQLITE_BUSY*` may retry the whole transaction. Transition callbacks therefore remain pure and may not perform external side effects. Duplicate receipt lookup occurs before revision validation so a retry of an already committed mutation remains idempotent even after the room advanced later.

## 2. Additive v1 schema

THREEJS-063 creates only new `..._v1` tables/indexes with `IF NOT EXISTS` and records migration `threejs-063-authority-v1` in a schema ledger. It does not drop, rename, rewrite, or destructively alter the PAGES-005 probe table.

| Record | Table | Key / uniqueness |
|---|---|---|
| schema migration | `yakolak_authority_schema_migrations_v1` | `schema_version`, unique migration name |
| lobby / canonical state | `yakolak_authority_lobbies_v1` | `room_id` |
| seats / credential generation | `yakolak_authority_seats_v1` | `(room_id, seat_id)`, unique `(room_id, credential_hash)` |
| invitations | `yakolak_authority_invitations_v1` | `invitation_id`; locator indexed but **not made unique by 063** |
| readiness | `yakolak_authority_readiness_v1` | `(room_id, lobby_generation, seat_id)` |
| deadlines | `yakolak_authority_deadlines_v1` | `(room_id, revision)` |
| votes | `yakolak_authority_votes_v1` | `(room_id, vote_kind, scope_generation, seat_id)` |
| mutation receipts | `yakolak_authority_mutation_receipts_v1` | **`(room_id, idempotency_key)`** |

THREEJS-063 deliberately does **not** choose the finite-locator uniqueness/reuse policy: THREEJS-065 owns the `00–99` capacity decision, active uniqueness, expiry/reclamation and saturation behavior. Until 065 locks that policy, `lookupInvitation()` fails closed if storage contains more than one row for the same locator instead of guessing.

The receipt key is deliberately room-scoped, not operation-scoped. Reusing one idempotency key for another operation/actor/fingerprint is rejected.

The existing `yakolak_pages005_room_probe_v1` table remains byte-contract compatible with PAGES-005/PAGES-015 rollback workers.

## 3. Forward-only expand/contract rule

Database migration is forward-only and additive:

1. deploy/run the schema migration before any Worker generation that depends on a new column/table;
2. keep every table/column required by the active release **and** the previous rollback release;
3. add nullable/defaulted fields or new versioned tables first;
4. migrate/backfill separately when a later task needs it;
5. only a future explicit compatibility task may contract old fields after the rollback window no longer needs them;
6. Worker rollback switches code only — **Turso data is never restored or rolled back**.

THREEJS-063 v1 itself requires no data rewrite. Re-running `ensureTable()` is idempotent.

Manual migration command (requires backend-only secrets; never browser/public config):

```bash
node scripts/migrate-threejs-authority.mjs
```

Required environment:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

The script prints only schema version/status; it never prints either secret.

## 4. Race guarantees

The transaction boundary serializes one accepted revision transition for competing operations on the same room. Contract tests prove:

- two competing moves at the same revision converge to one commit + one `revision_conflict`;
- duplicate mutation IDs converge to one commit + one duplicate replay, with the transition executed once;
- competing invitation claims converge to one revision winner;
- timeout reconciliation racing computer reconciliation converges to one revision winner;
- a durable receipt can be replayed from a new connection/store instance;
- cross-operation reuse of an idempotency key is rejected.

Feature policy is not encoded here. The store only guarantees atomic persistence/race ordering for policy supplied later by THREEJS-064+.

## 5. TTL / cleanup safety

Physical cleanup is intentionally conservative:

- PAGES-005 probe rows retain their existing age-based cleanup.
- Authority rows for an **active** lobby are not physically removed, even if a receipt's nominal retention timestamp has elapsed. This preserves exactly-once behavior for a live room.
- Authority child rows and the lobby are physically removed only when the lobby is already tombstoned **and** its expiry is older than the cleanup cutoff.

Later lifecycle tasks may set tombstone/expiry according to their own policy; THREEJS-063 does not invent that policy.

## 6. Verification

Deterministic local SQL/race coverage uses Node 22 `node:sqlite` against the same schema statements and store connection contract; it does not require production Turso credentials:

```bash
node --test tests/threejs063_turso_authority_contract.test.mjs
```

The manual `backend` optional suite installs `@tursodatabase/serverless`, runs the PAGES-005/THREEJS-062 regressions plus THREEJS-063 SQL/race tests, then compiles the Worker with Wrangler dry-run. This proves code/schema integration but is **not** a live Turso deployment/probe.
