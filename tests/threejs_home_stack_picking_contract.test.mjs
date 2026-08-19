import assert from 'node:assert/strict';

import { emptyBoard } from '../web/app/shared/rules.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';
import {
  NESTED_HOME_SIZE_ORDER,
  deriveActiveHomeStackTargets,
  remainingHomeSizeTargetsForStack,
  resolveHomePieceTarget,
} from '../web/app/gameplay/home-stack-picking.js';

const seats = configuredSeatOrder('marble', 2).map((slot, index) => ({
  seatId: slot.seatId,
  type: index === 0 ? 'human' : 'computer',
  color: slot.color,
  ready: true,
}));

const board = emptyBoard();
board['0'].small = 'marble';
board['1'].small = 'marble';
board['2'].medium = 'marble';
const state = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats,
  board,
  activeSeatId: 'right',
  deadlineAtMs: 20_000,
  revision: 17,
  lifecycle: { phase: 'turn-loop' },
});

assert.deepEqual(NESTED_HOME_SIZE_ORDER, ['large', 'medium', 'small']);
assert.deepEqual(state.inventory.right, { small: 1, medium: 2, large: 3 });

const targets = deriveActiveHomeStackTargets(state);
assert.equal(targets.seatId, 'right');
assert.equal(targets.color, 'marble');
assert.equal(targets.revision, 17);
assert.equal(targets.stacks.length, 3);
assert.equal(targets.remainingTargets.length, 6);
assert(Object.isFrozen(targets));

assert.deepEqual(targets.stacks.map(stack => ({
  id: stack.id,
  enabled: stack.enabled,
  remaining: stack.remainingPieceTargetIds,
})), [
  {
    id: 'stack:right:0',
    enabled: true,
    remaining: [
      'home-piece:right:0:large',
      'home-piece:right:0:medium',
      'home-piece:right:0:small',
    ],
  },
  {
    id: 'stack:right:1',
    enabled: true,
    remaining: [
      'home-piece:right:1:large',
      'home-piece:right:1:medium',
    ],
  },
  {
    id: 'stack:right:2',
    enabled: true,
    remaining: ['home-piece:right:2:large'],
  },
]);

const usedSmall = targets.stacks[1].pieces.find(piece => piece.size === 'small');
assert.equal(usedSmall.available, false);
assert.equal(usedSmall.unavailableReason, 'used-size-copy');
assert.equal(usedSmall.remainingCount, 1);
assert.equal(usedSmall.copyIndex, 1);

assert.deepEqual(resolveHomePieceTarget(state, {
  stackTargetId: 'stack:right:0',
  size: 'small',
}), targets.stacks[0].pieces.find(piece => piece.size === 'small'));
assert.deepEqual(resolveHomePieceTarget(state, {
  stackTargetId: 'stack:right:1',
  size: 'medium',
}), targets.stacks[1].pieces.find(piece => piece.size === 'medium'));
assert.deepEqual(remainingHomeSizeTargetsForStack(state, 'stack:right:2').map(piece => piece.size), ['large']);

assert.throws(() => resolveHomePieceTarget(state, {
  stackTargetId: 'stack:right:1',
  size: 'small',
}), /home_piece_already_used/);
assert.throws(() => resolveHomePieceTarget(state, {
  stackTargetId: 'stack:back:0',
  size: 'large',
}), /home_stack_not_active_seat/);
assert.throws(() => remainingHomeSizeTargetsForStack(state, 'stack:back:0'), /home_stack_not_active_seat/);
assert.throws(() => resolveHomePieceTarget(state, {
  stackTargetId: 'stack:right:0',
  size: 'giant',
}), /invalid_home_piece_size/);

// Exhaust all large copies without constructing a winning line; this fixture is
// strictly about inventory/remaining-target behavior.
const noLargeBoard = emptyBoard();
noLargeBoard['0'].large = 'marble';
noLargeBoard['4'].large = 'marble';
noLargeBoard['7'].large = 'marble';
const noLargeState = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats,
  board: noLargeBoard,
  activeSeatId: 'right',
  deadlineAtMs: 30_000,
  revision: 18,
  lifecycle: { phase: 'turn-loop' },
});
const noLargeTargets = deriveActiveHomeStackTargets(noLargeState);
assert.equal(noLargeTargets.remainingTargets.some(piece => piece.size === 'large'), false);
for (const stackIndex of [0, 1, 2]) {
  assert.throws(() => resolveHomePieceTarget(noLargeState, {
    stackTargetId: `stack:right:${stackIndex}`,
    size: 'large',
  }), /home_piece_already_used/);
}

assert.deepEqual(deriveActiveHomeStackTargets(state), targets);
assert.deepEqual(state.inventory.right, { small: 1, medium: 2, large: 3 });

console.log('THREEJS-031 home-stack picking contract: PASS');
