import {
  INVITE_CODE_CAPACITY,
  MANUAL_INVITATION_TTL_MS,
  normalizeInvitationAllocation,
  shuffledManualInvitationLocators,
} from './authoritative-invitation-allocation.js';
import { failAuthority } from './authoritative-store-contract.js';

function parseState(value) {
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) failAuthority('authoritative_state_corrupt');
    return parsed;
  } catch (error) {
    if (error?.code === 'authoritative_state_corrupt') throw error;
    failAuthority('authoritative_state_corrupt');
  }
}

function invitationFromRows(invitation, locatorRow) {
  return {
    invitationId: String(invitation.invitation_id),
    locator: String(locatorRow.locator),
    roomId: String(invitation.room_id),
    seatId: String(invitation.seat_id),
    lobbyGeneration: Number(invitation.lobby_generation),
    state: String(invitation.state),
    data: invitation.data_json == null ? null : JSON.parse(String(invitation.data_json)),
    expiresAtMs: Number(locatorRow.expires_at_ms),
  };
}

export async function expireTursoManualInvitationLocators({ tx, invitationsTable, manualLocatorsTable, nowMs }) {
  await tx.run(
    `UPDATE ${invitationsTable}
      SET state = 'expired', updated_at_ms = ?
      WHERE state = 'open' AND invitation_id IN (
        SELECT invitation_id FROM ${manualLocatorsTable} WHERE expires_at_ms <= ?
      )`,
    nowMs,
    nowMs,
  );
  await tx.run(`DELETE FROM ${manualLocatorsTable} WHERE expires_at_ms <= ?`, nowMs);
  await tx.run(
    `DELETE FROM ${manualLocatorsTable}
      WHERE invitation_id IN (SELECT invitation_id FROM ${invitationsTable} WHERE state <> 'open')`,
  );
}

export async function allocateTursoInvitation({
  tx,
  tables,
  input,
  nowMs,
  randomUint32,
}) {
  const allocation = normalizeInvitationAllocation(input);
  await expireTursoManualInvitationLocators({
    tx,
    invitationsTable: tables.invitations,
    manualLocatorsTable: tables.manualLocators,
    nowMs,
  });

  const lobby = await tx.get(
    `SELECT lobby_generation, state_json FROM ${tables.lobbies}
      WHERE room_id = ? AND tombstoned_at_ms IS NULL
        AND (expires_at_ms IS NULL OR expires_at_ms > ?) LIMIT 1`,
    allocation.roomId,
    nowMs,
  );
  if (!lobby) failAuthority('room_not_found');
  if (Number(lobby.lobby_generation) !== allocation.lobbyGeneration) failAuthority('invalid_lobby_generation');
  const lobbyState = parseState(lobby.state_json);
  if (lobbyState.status !== 'waiting') failAuthority('room_not_waiting');
  if (Number(lobbyState.lobbyGeneration ?? -1) !== allocation.lobbyGeneration) failAuthority('invalid_lobby_generation');

  const seat = await tx.get(
    `SELECT seat_id, spatial_slot, color, seat_type, configured_index
      FROM ${tables.seatConfigurations}
      WHERE room_id = ? AND lobby_generation = ? AND seat_id = ? LIMIT 1`,
    allocation.roomId,
    allocation.lobbyGeneration,
    allocation.seatId,
  );
  if (!seat || String(seat.seat_type) !== 'online') failAuthority('invitation_seat_not_online');

  const existingLocator = await tx.get(
    `SELECT locator, invitation_id, expires_at_ms FROM ${tables.manualLocators}
      WHERE room_id = ? AND lobby_generation = ? AND seat_id = ? LIMIT 1`,
    allocation.roomId,
    allocation.lobbyGeneration,
    allocation.seatId,
  );
  if (existingLocator) {
    const existingInvitation = await tx.get(
      `SELECT invitation_id, room_id, seat_id, lobby_generation, state, data_json
        FROM ${tables.invitations} WHERE invitation_id = ? LIMIT 1`,
      String(existingLocator.invitation_id),
    );
    if (existingInvitation?.state === 'open') {
      return { status: 'existing', invitation: invitationFromRows(existingInvitation, existingLocator) };
    }
    await tx.run(`DELETE FROM ${tables.manualLocators} WHERE locator = ?`, String(existingLocator.locator));
  }

  const reusedId = await tx.get(
    `SELECT invitation_id FROM ${tables.invitations} WHERE invitation_id = ? LIMIT 1`,
    allocation.invitationId,
  );
  if (reusedId) failAuthority('invitation_id_reused');

  const occupiedRows = await tx.all(`SELECT locator FROM ${tables.manualLocators}`);
  const occupied = new Set(occupiedRows.map(row => String(row.locator)));
  const locator = shuffledManualInvitationLocators(randomUint32).find(candidate => !occupied.has(candidate));
  if (!locator) failAuthority(INVITE_CODE_CAPACITY, { capacity: 100 });

  const expiresAtMs = nowMs + MANUAL_INVITATION_TTL_MS;
  const data = {
    color: String(seat.color),
    spatialSlot: String(seat.spatial_slot),
    configuredIndex: Number(seat.configured_index),
  };
  await tx.run(
    `INSERT INTO ${tables.invitations}
      (invitation_id, schema_version, locator, room_id, seat_id, lobby_generation, state,
       claim_verifier_hash, claim_generation, data_json, created_at_ms, updated_at_ms, expires_at_ms)
     VALUES (?, 1, ?, ?, ?, ?, 'open', NULL, 0, ?, ?, ?, ?)`,
    allocation.invitationId,
    locator,
    allocation.roomId,
    allocation.seatId,
    allocation.lobbyGeneration,
    JSON.stringify(data),
    nowMs,
    nowMs,
    expiresAtMs,
  );
  await tx.run(
    `INSERT INTO ${tables.manualLocators}
      (locator, invitation_id, room_id, seat_id, lobby_generation, expires_at_ms, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    locator,
    allocation.invitationId,
    allocation.roomId,
    allocation.seatId,
    allocation.lobbyGeneration,
    expiresAtMs,
    nowMs,
    nowMs,
  );

  return {
    status: 'allocated',
    invitation: {
      invitationId: allocation.invitationId,
      locator,
      roomId: allocation.roomId,
      seatId: allocation.seatId,
      lobbyGeneration: allocation.lobbyGeneration,
      state: 'open',
      data,
      expiresAtMs,
    },
  };
}
