import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBoardMove,
  createEmptyBoard,
  hasLegalMove,
  listLegalMoves,
  nextPlayableTurn,
  winnerForBoard
} from '../src/game-rules-v126.js';

test('resolves all three Yakolak win patterns from the shared rules', () => {
  const same = createEmptyBoard();
  [0, 1, 2].forEach(zone => { same[zone].l = 'right'; });
  assert.equal(winnerForBoard(same, 'right')?.type, 'same-size');

  const graded = createEmptyBoard();
  graded[6].s = 'back';
  graded[4].m = 'back';
  graded[2].l = 'back';
  assert.equal(winnerForBoard(graded, 'back')?.type, 'graded');

  const cell = createEmptyBoard();
  ['s', 'm', 'l'].forEach(size => { cell[4][size] = 'front'; });
  assert.equal(winnerForBoard(cell, 'front')?.type, 'cell');
});

test('enforces the three-piece inventory and occupied slots', () => {
  let board = createEmptyBoard();
  board = applyBoardMove(board, 'right', { zone: 0, size: 's' });
  board = applyBoardMove(board, 'right', { zone: 1, size: 's' });
  board = applyBoardMove(board, 'right', { zone: 3, size: 's' });
  assert.equal(listLegalMoves(board, 'right').some(move => move.size === 's'), false);
  assert.throws(() => applyBoardMove(board, 'right', { zone: 4, size: 's' }), /no_piece_remaining/);
  assert.throws(() => applyBoardMove(board, 'back', { zone: 0, size: 's' }), /occupied_slot/);
});

test('skips players with no legal move using the same turn resolver', () => {
  const board = createEmptyBoard();
  for (const size of ['s', 'm', 'l']) {
    [0, 1, 2].forEach(zone => { board[zone][size] = 'right'; });
  }
  assert.equal(hasLegalMove(board, 'right'), false);
  assert.equal(nextPlayableTurn([{ color: 'back' }, { color: 'right' }], 0, board), 0);
});
