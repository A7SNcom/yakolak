import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SIZES, emptyBoard } from '../web/app/shared/rules.js';
import {
  CANONICAL_CONFIGURED_SEAT_RING,
  NO_LEGAL_MOVE_SKIP_REASON,
  configuredSeatForCredential,
  configuredSeatOrder,
  configuredSeatOrderFromState,
  createCredentialSeatBindings,
  selectNextLegalConfiguredSeat,
} from '../web/app/shared/seat-order.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';

const baseIds = ['right', 'back', 'left', 'front'];
const baseColors = ['marble', 'blue', 'gold', 'green'];
assert.deepEqual(CANONICAL_CONFIGURED_SEAT_RING.map(seat => seat.seatId), baseIds);
assert.deepEqual(CANONICAL_CONFIGURED_SEAT_RING.map(seat => seat.spatialSlot), baseIds);
assert.deepEqual(CANONICAL_CONFIGURED_SEAT_RING.map(seat => seat.color), baseColors);
assert(Object.isFrozen(CANONICAL_CONFIGURED_SEAT_RING));

function expectedRotation(preferredColor, targetPlayers) {
  const start = baseColors.indexOf(preferredColor);
  return Array.from({ length: targetPlayers }, (_, offset) => ({
    seatId: baseIds[(start + offset) % 4],
    color: baseColors[(start + offset) % 4],
  }));
}

let rotationCases = 0;
for (const preferredColor of baseColors) {
  for (const targetPlayers of [2, 3, 4]) {
    const order = configuredSeatOrder(preferredColor, targetPlayers);
    assert.deepEqual(
      order.map(({ seatId, color }) => ({ seatId, color })),
      expectedRotation(preferredColor, targetPlayers),
      `${preferredColor}/${targetPlayers} must rotate only the configured order`,
    );
    for (const slot of CANONICAL_CONFIGURED_SEAT_RING) {
      const fixed = CANONICAL_CONFIGURED_SEAT_RING.find(candidate => candidate.seatId === slot.seatId);
      assert.equal(fixed.spatialSlot, slot.seatId, 'rotation must never rotate physical geometry');
      assert.equal(fixed.color, slot.color, 'rotation must never rebind a physical slot color');
    }
    rotationCases += 1;
  }
}
assert.equal(rotationCases, 12);
assert.throws(() => configuredSeatOrder('white', 4), /invalid_preferred_color/);
assert.throws(() => configuredSeatOrder('marble', 1), /invalid_target_players/);

function configuredSeats(preferredColor, targetPlayers) {
  return configuredSeatOrder(preferredColor, targetPlayers).map((slot, index) => ({
    seatId: slot.seatId,
    type: index === 0 ? 'host-human' : 'online-human',
    color: slot.color,
    ready: true,
  }));
}

// Canonical state persists the resolved configured order, never arbitrary arrival order.
const canonicalSeats = configuredSeats('gold', 4);
const canonical = createCanonicalSessionState({
  preferredColor: 'gold',
  targetPlayers: 4,
  winsToMatch: 3,
  seats: canonicalSeats,
  activeSeatId: 'left',
  lifecycle: { phase: 'turn-loop' },
});
assert.deepEqual(canonical.seats.map(seat => seat.seatId), ['left', 'front', 'right', 'back']);
assert.deepEqual(configuredSeatOrderFromState(canonical).map(seat => seat.seatId), ['left', 'front', 'right', 'back']);
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'gold',
  targetPlayers: 4,
  seats: [canonicalSeats[3], canonicalSeats[1], canonicalSeats[2], canonicalSeats[0]],
}), /configured_seat_order_mismatch/);

// Credential claim arrival order cannot redefine seat authority. The stable opaque
// credential identity maps back to the exact configured seat on reconnect.
const claimsByArrival = [
  { credentialId: 'credential-back-00000000000000000001', seatId: 'back' },
  { credentialId: 'credential-right-0000000000000000001', seatId: 'right' },
  { credentialId: 'credential-front-0000000000000000001', seatId: 'front' },
  { credentialId: 'credential-left-00000000000000000001', seatId: 'left' },
];
const bindings = createCredentialSeatBindings(canonicalSeats, claimsByArrival);
assert.deepEqual(bindings.map(binding => binding.seatId), ['left', 'front', 'right', 'back']);
assert.equal(
  configuredSeatForCredential(canonicalSeats, bindings, 'credential-front-0000000000000000001').seatId,
  'front',
);
assert.equal(
  configuredSeatForCredential([...canonicalSeats].reverse(), bindings, 'credential-front-0000000000000000001').seatId,
  'front',
  'reconnect lookup must resolve the same stable seat even if an adapter presents seats in another arrival order',
);
assert.equal(configuredSeatForCredential(canonicalSeats, bindings, 'credential-missing-000000000000000000'), null);
assert.throws(() => createCredentialSeatBindings(canonicalSeats, [
  { credentialId: 'duplicate-credential-000000000000000001', seatId: 'left' },
  { credentialId: 'duplicate-credential-000000000000000001', seatId: 'front' },
]), /duplicate_credential_id/);
assert.throws(() => createCredentialSeatBindings(canonicalSeats, [
  { credentialId: 'credential-one-000000000000000000001', seatId: 'left' },
  { credentialId: 'credential-two-000000000000000000001', seatId: 'left' },
]), /duplicate_credential_seat/);
assert.throws(() => createCredentialSeatBindings(canonicalSeats, [
  { credentialId: 'credential-invalid-00000000000000001', seatId: 'not-a-seat' },
]), /credential_seat_not_configured/);

function exhaustColor(board, color, cells) {
  for (const size of SIZES) {
    for (const cell of cells) board[String(cell)][size] = color;
  }
  return board;
}

function turnState(preferredColor, targetPlayers, board) {
  return {
    preferredColor,
    targetPlayers,
    seats: configuredSeats(preferredColor, targetPlayers),
    board,
  };
}

// 2 seats: back has no legal move, current right is the only legal mover and may
// receive a consecutive turn after the full configured scan wraps once.
let board2 = emptyBoard();
board2 = exhaustColor(board2, 'blue', [0, 1, 2]);
const select2 = selectNextLegalConfiguredSeat(turnState('marble', 2, board2), 'right');
assert.deepEqual(select2, {
  nextSeatId: 'right',
  skips: [{ seatId: 'back', reason: NO_LEGAL_MOVE_SKIP_REASON }],
  allSeatsBlocked: false,
});

// 3 seats: both following seats are exhausted; current right remains the only legal mover.
let board3 = emptyBoard();
board3 = exhaustColor(board3, 'blue', [0, 1, 2]);
board3 = exhaustColor(board3, 'gold', [3, 4, 5]);
const select3 = selectNextLegalConfiguredSeat(turnState('marble', 3, board3), 'right');
assert.deepEqual(select3, {
  nextSeatId: 'right',
  skips: [
    { seatId: 'back', reason: NO_LEGAL_MOVE_SKIP_REASON },
    { seatId: 'left', reason: NO_LEGAL_MOVE_SKIP_REASON },
  ],
  allSeatsBlocked: false,
});

// 4 seats: back and left are skipped in canonical order, then front becomes active.
let board4 = emptyBoard();
board4 = exhaustColor(board4, 'blue', [0, 1, 2]);
board4 = exhaustColor(board4, 'gold', [3, 4, 5]);
const select4 = selectNextLegalConfiguredSeat(turnState('marble', 4, board4), 'right');
assert.deepEqual(select4, {
  nextSeatId: 'front',
  skips: [
    { seatId: 'back', reason: NO_LEGAL_MOVE_SKIP_REASON },
    { seatId: 'left', reason: NO_LEGAL_MOVE_SKIP_REASON },
  ],
  allSeatsBlocked: false,
});

// When every configured seat is exhausted, return complete evidence; THREEJS-051
// owns the draw commit, not this selector.
let blocked = emptyBoard();
blocked = exhaustColor(blocked, 'marble', [0, 1, 2]);
blocked = exhaustColor(blocked, 'blue', [3, 4, 5]);
const noMover = selectNextLegalConfiguredSeat(turnState('marble', 2, blocked), 'right');
assert.deepEqual(noMover, {
  nextSeatId: null,
  skips: [
    { seatId: 'back', reason: NO_LEGAL_MOVE_SKIP_REASON },
    { seatId: 'right', reason: NO_LEGAL_MOVE_SKIP_REASON },
  ],
  allSeatsBlocked: true,
});

// Rotation is equally authoritative during skipping: green preference 3-player
// order is front -> right -> back, regardless of connection order.
let rotatedBoard = emptyBoard();
rotatedBoard = exhaustColor(rotatedBoard, 'marble', [0, 1, 2]);
const rotatedSkip = selectNextLegalConfiguredSeat(turnState('green', 3, rotatedBoard), 'front');
assert.deepEqual(rotatedSkip, {
  nextSeatId: 'back',
  skips: [{ seatId: 'right', reason: NO_LEGAL_MOVE_SKIP_REASON }],
  allSeatsBlocked: false,
});

assert.throws(() => selectNextLegalConfiguredSeat(turnState('marble', 2, emptyBoard()), 'front'), /current_seat_not_configured/);

const source = await readFile(new URL('../web/app/shared/seat-order.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\bcamera\b|THREE\.|\bwindow\.|\bdocument\.|joinOrder|arrivalOrder/, 'camera/presentation/join arrival must never define seat authority');

console.log('THREEJS-048 turn ring contract: PASS rotations=12');
