export const AUTHORITY_SCHEMA_VERSION = 1;
export const PROBE_TABLE = 'yakolak_pages005_room_probe_v1';

export const AUTHORITY_TABLES = Object.freeze({
  migrations: 'yakolak_authority_schema_migrations_v1',
  lobbies: 'yakolak_authority_lobbies_v1',
  seats: 'yakolak_authority_seats_v1',
  seatConfigurations: 'yakolak_authority_seat_configurations_v1',
  invitations: 'yakolak_authority_invitations_v1',
  readiness: 'yakolak_authority_readiness_v1',
  deadlines: 'yakolak_authority_deadlines_v1',
  votes: 'yakolak_authority_votes_v1',
  receipts: 'yakolak_authority_mutation_receipts_v1',
});

const T = AUTHORITY_TABLES;

export const AUTHORITY_SCHEMA_STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (
    room_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    integrity TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ${T.migrations} (
    schema_version INTEGER PRIMARY KEY,
    migration_name TEXT NOT NULL UNIQUE,
    applied_at_ms INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ${T.lobbies} (
    room_id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL DEFAULT 1,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    lobby_generation INTEGER NOT NULL DEFAULT 0 CHECK (lobby_generation >= 0),
    state_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER,
    tombstoned_at_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS ${T.seats} (
    room_id TEXT NOT NULL,
    seat_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    seat_type TEXT NOT NULL CHECK (seat_type IN ('host','online','computer')),
    lobby_generation INTEGER NOT NULL CHECK (lobby_generation >= 0),
    credential_hash TEXT,
    credential_generation INTEGER NOT NULL DEFAULT 0 CHECK (credential_generation >= 0),
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (room_id, seat_id),
    UNIQUE (room_id, credential_hash),
    CHECK ((seat_type = 'computer' AND credential_hash IS NULL) OR seat_type <> 'computer')
  )`,
  `CREATE TABLE IF NOT EXISTS ${T.seatConfigurations} (
    room_id TEXT NOT NULL,
    lobby_generation INTEGER NOT NULL CHECK (lobby_generation >= 0),
    seat_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    configured_index INTEGER NOT NULL CHECK (configured_index >= 0 AND configured_index <= 3),
    spatial_slot TEXT NOT NULL CHECK (spatial_slot IN ('right','back','left','front')),
    color TEXT NOT NULL CHECK (color IN ('marble','blue','gold','green')),
    seat_type TEXT NOT NULL CHECK (seat_type IN ('host','online','computer')),
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (room_id, lobby_generation, seat_id),
    UNIQUE (room_id, lobby_generation, configured_index),
    UNIQUE (room_id, lobby_generation, spatial_slot),
    UNIQUE (room_id, lobby_generation, color)
  )`,
  `CREATE TABLE IF NOT EXISTS ${T.invitations} (
    invitation_id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL DEFAULT 1,
    locator TEXT NOT NULL,
    room_id TEXT NOT NULL,
    seat_id TEXT NOT NULL,
    lobby_generation INTEGER NOT NULL CHECK (lobby_generation >= 0),
    state TEXT NOT NULL CHECK (state IN ('open','claimed','revoked','expired')),
    claim_verifier_hash TEXT,
    claim_generation INTEGER NOT NULL DEFAULT 0 CHECK (claim_generation >= 0),
    data_json TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS ${T.readiness} (
    room_id TEXT NOT NULL,
    lobby_generation INTEGER NOT NULL CHECK (lobby_generation >= 0),
    seat_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    ready INTEGER NOT NULL CHECK (ready IN (0,1)),
    hydrated_revision INTEGER CHECK (hydrated_revision IS NULL OR hydrated_revision >= 0),
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (room_id, lobby_generation, seat_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ${T.deadlines} (
    room_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    schema_version INTEGER NOT NULL DEFAULT 1,
    deadline_at_ms INTEGER NOT NULL,
    reconciled_at_ms INTEGER,
    outcome TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (room_id, revision)
  )`,
  `CREATE TABLE IF NOT EXISTS ${T.votes} (
    room_id TEXT NOT NULL,
    vote_kind TEXT NOT NULL,
    scope_generation INTEGER NOT NULL CHECK (scope_generation >= 0),
    seat_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    vote_value TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (room_id, vote_kind, scope_generation, seat_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ${T.receipts} (
    room_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    operation TEXT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('seat','claim','server')),
    actor_key TEXT NOT NULL,
    actor_generation INTEGER,
    fingerprint TEXT NOT NULL,
    committed_revision INTEGER NOT NULL CHECK (committed_revision >= 0),
    invitation_id TEXT,
    snapshot_json TEXT NOT NULL,
    invitation_json TEXT,
    committed_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER,
    PRIMARY KEY (room_id, idempotency_key)
  )`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_lobbies_expiry_v1
    ON ${T.lobbies} (tombstoned_at_ms, expires_at_ms)`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_seats_credential_v1
    ON ${T.seats} (room_id, credential_hash)`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_seat_configurations_room_v1
    ON ${T.seatConfigurations} (room_id, lobby_generation)`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_invitations_locator_v1
    ON ${T.invitations} (locator, state, expires_at_ms)`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_invitations_room_state_v1
    ON ${T.invitations} (room_id, lobby_generation, state)`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_invitations_expiry_v1
    ON ${T.invitations} (expires_at_ms, state)`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_readiness_room_v1
    ON ${T.readiness} (room_id, lobby_generation, ready)`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_deadlines_due_v1
    ON ${T.deadlines} (deadline_at_ms, reconciled_at_ms)`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_votes_scope_v1
    ON ${T.votes} (room_id, vote_kind, scope_generation)`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_receipts_revision_v1
    ON ${T.receipts} (room_id, committed_revision)`,
  `CREATE INDEX IF NOT EXISTS yakolak_authority_receipts_expiry_v1
    ON ${T.receipts} (expires_at_ms)`,
]);

export function authorityMigrationStatement(appliedAtMs) {
  return {
    sql: `INSERT OR IGNORE INTO ${T.migrations} (schema_version, migration_name, applied_at_ms) VALUES (?, ?, ?)`,
    args: [AUTHORITY_SCHEMA_VERSION, 'threejs-063-authority-v1', appliedAtMs],
  };
}
