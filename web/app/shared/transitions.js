// THREEJS-044: pure gameplay/session transitions shared by local authority and
// the future online authority. This module intentionally does not decide stable
// seat topology, timeout authority, bot authority, readiness, restart policy,
// or rematch consensus; those contracts are owned by later explicit tasks.

import {
  emptyBoard,
  hasLegalMove,
  placePiece,
  winner,
} from './rules.js';

export function nextPlayablePlayerIndex(state, fromIndex, allowedSeats = null) {
  const allowed = allowedSeats ? new Set(allowedSeats) : null;
  for (let offset = 1; offset < state.players.length; offset += 1) {
    const index = (fromIndex + offset) % state.players.length;
    const player = state.players[index];
    if (allowed && !allowed.has(player.seat)) continue;
    if (hasLegalMove(state.board, player.color)) return index;
  }
  return -1;
}

export function finishRoundTransition(state, { color = null, seat = null, draw = false, lastMove = null } = {}) {
  const scores = { ...state.scores };
  if (seat) scores[seat] = Number(scores[seat] || 0) + 1;
  const completedRounds = Number(state.completedRounds || 0) + 1;
  const winsToMatch = Number(state.winsToMatch ?? state.targetRounds);
  const matchComplete = Boolean(seat) && Number(scores[seat] || 0) >= winsToMatch;
  const leaders = matchComplete
    ? state.players.filter(player => Number(scores[player.seat] || 0) === Math.max(...Object.values(scores).map(Number)))
    : [];
  return {
    ...state,
    winsToMatch,
    targetRounds: winsToMatch,
    status: 'finished',
    scores,
    completedRounds,
    winner: color && seat ? { color, seat } : null,
    draw,
    lastMove,
    matchComplete,
    matchWinner: leaders.length === 1
      ? { seat: leaders[0].seat, color: leaders[0].color, wins: Number(scores[leaders[0].seat] || 0) }
      : null,
    matchWinners: leaders.map(player => ({ seat: player.seat, color: player.color, wins: Number(scores[player.seat] || 0) })),
    rematch: Object.fromEntries(state.players.map(player => [player.seat, false])),
    skippedSeat: null,
  };
}

export function applyMoveTransition(state, seat, move) {
  if (state.status !== 'playing') throw new Error('room_not_playing');
  const current = state.players[state.turnIndex];
  if (!current || current.seat !== seat) throw new Error('not_your_turn');

  const board = placePiece(state.board, current.color, move);
  const cell = Number(move.cell);
  const size = String(move.size);
  const lastMove = { cell, size, color: current.color, seat };
  const next = {
    ...state,
    board,
    lastMove,
    moveNumber: Number(state.moveNumber || 0) + 1,
    winner: null,
    draw: false,
    skippedSeat: null,
  };

  if (winner(board, current.color)) return finishRoundTransition(next, { color: current.color, seat, lastMove });
  const turnIndex = nextPlayablePlayerIndex(next, state.turnIndex);
  if (turnIndex < 0) return finishRoundTransition(next, { draw: true, lastMove });
  return { ...next, turnIndex };
}

export function advanceRoundTransition(state, seat) {
  if (state.status !== 'finished' || state.matchComplete) throw new Error('round_not_finished');
  if (!state.players.some(player => player.seat === seat)) throw new Error('invalid_seat');
  const cleared = Object.fromEntries(state.players.map(player => [player.seat, false]));
  return {
    ...state,
    status: 'playing',
    turnIndex: Number(state.round || 1) % state.players.length,
    board: emptyBoard(),
    round: Number(state.round || 1) + 1,
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: cleared,
    skippedSeat: null,
  };
}

export function restartMatchTransition(state) {
  const cleared = Object.fromEntries(state.players.map(player => [player.seat, false]));
  return {
    ...state,
    status: 'playing',
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: Object.fromEntries(state.players.map(player => [player.seat, 0])),
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: cleared,
    skippedSeat: null,
  };
}
