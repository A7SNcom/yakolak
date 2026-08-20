import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORITATIVE_ACTOR_KINDS,
  AUTHORITATIVE_API,
  AUTHORITATIVE_INVITATION_STATES,
  AUTHORITATIVE_OPERATION_NAMES,
  AUTHORITATIVE_SEAT_TYPES,
  AUTHORITATIVE_TURN_DURATION_MS,
  SERVER_RECONCILIATION_KINDS,
} from '../backend/cloudflare/src/authoritative-api.js';
import { createInMemoryAuthoritativeStore } from '../backend/cloudflare/src/authoritative-store.js';
import { emptyBoard } from '../web/app/shared/rules.js';

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function state() {
  return {
    protocol: 5,
    status: 'waiting',
    targetPlayers: 2,
    targetRounds: 3,
    winsToMatch: 3,
    players: [{ seat: 'p1', color: 'marble' }, { seat: 'p2', color: 'blue' }],
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: { p1: 0, p2: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { p1: false, p2: false },
    skippedSeat: null,
  };
}

test('THREEJS-062 locks only the cross-task vocabulary and leaves feature semantics downstream', () => {
  assert.deepEqual(AUTHORITATIVE_SEAT_TYPES, { HOST: 'host', ONLINE: 'online', COMPUTER: 'computer' });
  assert.deepEqual(AUTHORITATIVE_ACTOR_KINDS, { SEAT: 'seat', CLAIM: 'claim', SERVER: 'server' });
  assert.deepEqual(AUTHORITATIVE_INVITATION_STATES, {
    OPEN: 'open', CLAIMED: 'claimed', REVOKED: 'revoked', EXPIRED: 'expired',
  });
  assert.deepEqual(SERVER_RECONCILIATION_KINDS, { TIMEOUT: 'timeout', COMPUTER: 'computer' });
  assert.equal(AUTHORITATIVE_TURN_DURATION_MS, 18_000);
  assert.deepEqual(AUTHORITATIVE_API.contract.turnDeadline, {
    field: 'deadlineAtMs', durationMs: 18_000, authority: 'server',
  });
  assert.deepEqual(AUTHORITATIVE_API.contract.reservedOperations, [
    'configure-lobby',
    'claim-invitation',
    'invalidate-lobby',
    'set-ready',
    'start-match',
    'move',
    'reconcile-timeout',
    'reconcile-computer',
  ]);
  assert.equal(AUTHORITATIVE_OPERATION_NAMES.CLAIM_INVITATION, 'claim-invitation');
  assert.equal(AUTHORITATIVE_OPERATION_NAMES.RECONCILE_TIMEOUT, 'reconcile-timeout');
  assert.equal(AUTHORITATIVE_OPERATION_NAMES.RECONCILE_COMPUTER, 'reconcile-computer');
});

test('generic store transaction can atomically cover a seeded invitation scope without implementing allocation/claim policy', async () => {
  const credentialHash = await sha256Hex('host_authority_credential_0000000001');
  const store = createInMemoryAuthoritativeStore({
    authoritativeRooms: [{
      roomId: '54', revision: 11, state: state(),
      seats: [{ seatId: 'p1', credentialHash, credentialGeneration: 1 }],
    }],
    authoritativeInvitations: [{
      invitationId: 'invite-seeded-contract-001',
      locator: '42',
      roomId: '54',
      seatId: 'p2',
      lobbyGeneration: 9,
      state: AUTHORITATIVE_INVITATION_STATES.OPEN,
      data: { contractOnly: true },
    }],
  });

  const invitation = await store.lookupInvitation({ locator: '42' });
  assert.deepEqual(invitation, {
    invitationId: 'invite-seeded-contract-001',
    locator: '42',
    roomId: '54',
    seatId: 'p2',
    lobbyGeneration: 9,
    state: 'open',
    data: { contractOnly: true },
  });
  assert.equal(await store.lookupInvitation({ locator: '99' }), null);

  const transaction = {
    roomId: '54',
    actor: { kind: AUTHORITATIVE_ACTOR_KINDS.CLAIM, key: 'claim-hash-contract-001', generation: null },
    expectedRevision: 11,
    idempotencyKey: 'claim_idempotency_contract_00000001',
    fingerprint: 'a'.repeat(64),
    operation: AUTHORITATIVE_OPERATION_NAMES.CLAIM_INVITATION,
    invitationId: invitation.invitationId,
    transition: ({ state: current, invitation: currentInvitation, revision }) => {
      assert.equal(revision, 11);
      assert.equal(currentInvitation.state, 'open');
      return {
        state: { ...current, contractClaimWitness: true },
        invitation: { ...currentInvitation, state: 'claimed' },
      };
    },
  };

  const committed = await store.transactAuthority(transaction);
  assert.equal(committed.status, 'committed');
  assert.equal(committed.snapshot.revision, 12);
  assert.equal(committed.snapshot.state.contractClaimWitness, true);
  assert.equal(committed.invitation.state, 'claimed');
  assert.deepEqual(committed.receipt, {
    idempotencyKey: transaction.idempotencyKey,
    operation: 'claim-invitation',
    revision: 12,
  });

  const duplicate = await store.transactAuthority(transaction);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.snapshot.revision, 12);
  assert.equal(duplicate.invitation.state, 'claimed');
  assert.deepEqual(duplicate.receipt, committed.receipt);

  await assert.rejects(store.transactAuthority({
    ...transaction,
    fingerprint: 'b'.repeat(64),
  }), /idempotency_key_reused/);

  await assert.rejects(store.transactAuthority({
    ...transaction,
    expectedRevision: 12,
    operation: AUTHORITATIVE_OPERATION_NAMES.START_MATCH,
    invitationId: null,
    transition: ({ state: current }) => ({ state: current }),
  }), /idempotency_key_reused/, 'one room-scoped idempotency key cannot be reused by a different operation');
});

test('server reconciliation uses the same revision/idempotency transaction primitive, never a browser seat credential', async () => {
  const credentialHash = await sha256Hex('host_authority_credential_0000000002');
  const store = createInMemoryAuthoritativeStore({
    authoritativeRooms: [{
      roomId: '55', revision: 20, state: state(),
      seats: [{ seatId: 'p1', credentialHash, credentialGeneration: 1 }],
    }],
  });

  let transitionRuns = 0;
  const request = {
    roomId: '55',
    actor: { kind: AUTHORITATIVE_ACTOR_KINDS.SERVER, key: SERVER_RECONCILIATION_KINDS.TIMEOUT, generation: null },
    expectedRevision: 20,
    idempotencyKey: 'timeout_reconcile_contract_0000001',
    fingerprint: 'c'.repeat(64),
    operation: AUTHORITATIVE_OPERATION_NAMES.RECONCILE_TIMEOUT,
    transition: ({ state: current }) => {
      transitionRuns += 1;
      return { state: { ...current, timeoutContractWitness: 1 } };
    },
  };

  const first = await store.transactAuthority(request);
  const second = await store.transactAuthority(request);
  assert.equal(first.status, 'committed');
  assert.equal(second.status, 'duplicate');
  assert.equal(first.snapshot.revision, 21);
  assert.equal(second.snapshot.revision, 21);
  assert.equal(transitionRuns, 1, 'duplicate reconciliation must not run server transition twice');
});
