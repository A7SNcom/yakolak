import { AUTHORITATIVE_ACTOR_KINDS, AUTHORITATIVE_OPERATION_NAMES } from './authoritative-api.js';
import { validateMaterializedLobbySeatRecords } from './authoritative-lobby-config.js';
import { failAuthority } from './authoritative-store-contract.js';

function changes(result) {
  return Number(result?.changes ?? result?.rowsAffected ?? 0);
}

export async function materializeTursoLobbySeatBindings({
  tx,
  seatsTable,
  seatConfigurationsTable,
  transaction,
  state,
  records,
  nowMs,
}) {
  if (transaction.operation !== AUTHORITATIVE_OPERATION_NAMES.CONFIGURE_LOBBY) {
    failAuthority('unexpected_seat_materialization');
  }
  if (transaction.actor.kind !== AUTHORITATIVE_ACTOR_KINDS.SEAT) failAuthority('host_only_lobby_configuration');
  validateMaterializedLobbySeatRecords(records, state);
  if (records[0].seatId !== transaction.actor.key) failAuthority('host_only_lobby_configuration');

  const existing = await tx.all(
    `SELECT seat_id, credential_hash, credential_generation FROM ${seatsTable} WHERE room_id = ? ORDER BY seat_id`,
    transaction.roomId,
  );
  const currentHost = existing.find(row => String(row.seat_id) === transaction.actor.key);
  if (!currentHost?.credential_hash) failAuthority('seat_credential_rejected');
  for (const seat of existing) {
    if (String(seat.seat_id) !== transaction.actor.key && seat.credential_hash != null) {
      failAuthority('lobby_configuration_has_bound_seat');
    }
  }

  const existingConfiguration = await tx.all(
    `SELECT seat_id FROM ${seatConfigurationsTable}
      WHERE room_id = ? AND lobby_generation = ? LIMIT 1`,
    transaction.roomId,
    records[0].lobbyGeneration,
  );
  if (existingConfiguration.length > 0) failAuthority('lobby_already_configured');

  for (const record of records) {
    await tx.run(
      `INSERT INTO ${seatConfigurationsTable}
        (room_id, lobby_generation, seat_id, schema_version, configured_index,
         spatial_slot, color, seat_type, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      transaction.roomId,
      record.lobbyGeneration,
      record.seatId,
      record.configuredIndex,
      record.spatialSlot,
      record.color,
      record.type,
      nowMs,
      nowMs,
    );
  }

  await tx.run(
    `DELETE FROM ${seatsTable} WHERE room_id = ? AND seat_id <> ? AND credential_hash IS NULL`,
    transaction.roomId,
    transaction.actor.key,
  );
  const updatedHost = await tx.run(
    `UPDATE ${seatsTable}
      SET seat_type = 'host', lobby_generation = ?, updated_at_ms = ?
      WHERE room_id = ? AND seat_id = ? AND credential_generation = ?`,
    records[0].lobbyGeneration,
    nowMs,
    transaction.roomId,
    transaction.actor.key,
    transaction.actor.generation,
  );
  if (changes(updatedHost) !== 1) failAuthority('seat_credential_generation_stale');

  for (const record of records.slice(1)) {
    await tx.run(
      `INSERT INTO ${seatsTable}
        (room_id, seat_id, schema_version, seat_type, lobby_generation,
         credential_hash, credential_generation, created_at_ms, updated_at_ms)
       VALUES (?, ?, 1, ?, ?, NULL, 0, ?, ?)`,
      transaction.roomId,
      record.seatId,
      record.type,
      record.lobbyGeneration,
      nowMs,
      nowMs,
    );
  }
}
