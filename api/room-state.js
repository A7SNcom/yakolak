// Pure state transitions shared by the database adapter and the WebRTC host.
// Both transports use the exact same canonical placement and victory rules.
import {COLORS,SIZES,emptyBoard as rulesEmptyBoard,hasLegalMove as rulesHasLegalMove,isValidPlayerCount,isValidWinsToMatch,validatePlacement,winner as rulesWinner} from './game-rules.js';
const PROTOCOL=5;
function validColor(value) {
  return COLORS.includes(String(value || ''));
}

function validPlayers(value) {
  return isValidPlayerCount(value);
}

function validRounds(value) {
  return isValidWinsToMatch(value);
}

function emptyBoard() {
  return rulesEmptyBoard();
}

function winner(board, color) {
  return rulesWinner(board, color);
}

function hasLegalMove(state, color) {
  return rulesHasLegalMove(state.board, color);
}

function nextPlayablePlayer(state, fromIndex, allowedSeats = null) {
  const allowed = allowedSeats ? new Set(allowedSeats) : null;
  for (let offset = 1; offset < state.players.length; offset += 1) {
    const index = (fromIndex + offset) % state.players.length;
    const player = state.players[index];
    if (allowed && !allowed.has(player.seat)) continue;
    if (hasLegalMove(state, player.color)) return index;
  }
  return -1;
}

function createState(hostColor, targetPlayers, targetRounds) {
  if (!validColor(hostColor)) throw new Error('invalid_color');
  if (!validPlayers(targetPlayers)) throw new Error('invalid_player_count');
  if (!validRounds(targetRounds)) throw new Error('invalid_round_count');
  const winsToMatch = Number(targetRounds);
  return {
    protocol: PROTOCOL,
    status: 'waiting',
    targetPlayers: Number(targetPlayers),
    targetRounds: winsToMatch,
    winsToMatch,
    players: [{ seat: 'p1', color: hostColor }],
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: { p1: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { p1: false },
    skippedSeat: null,
    _mutations: [],
  };
}

function joinState(state, seat, color) {
  if (!validColor(color)) throw new Error('invalid_color');
  if (state.status !== 'waiting') throw new Error('room_not_waiting');
  if (state.players.length >= state.targetPlayers) throw new Error('room_full');
  if (state.players.some(player => player.color === color)) throw new Error('color_taken');
  const players = [...state.players, { seat, color }];
  return {
    ...state,
    players,
    scores: { ...state.scores, [seat]: 0 },
    rematch: { ...state.rematch, [seat]: false },
    status: players.length === state.targetPlayers ? 'playing' : 'waiting'
  };
}

function finishRound(state, { color = null, seat = null, draw = false, lastMove = null }) {
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
    matchWinner: leaders.length === 1 ? { seat: leaders[0].seat, color: leaders[0].color, wins: Number(scores[leaders[0].seat] || 0) } : null,
    matchWinners: leaders.map(player => ({ seat: player.seat, color: player.color, wins: Number(scores[player.seat] || 0) })),
    rematch: Object.fromEntries(state.players.map(player => [player.seat, false])),
    skippedSeat: null,
  };
}

function applyMove(state, seat, move) {
  if (state.status !== 'playing') throw new Error('room_not_playing');
  const current = state.players[state.turnIndex];
  if (!current || current.seat !== seat) throw new Error('not_your_turn');
  const placementError = validatePlacement(state.board, current.color, move);
  if (placementError) throw new Error(placementError);
  const cell = Number(move.cell);
  const size = String(move.size);
  const board = structuredClone(state.board);
  board[String(cell)] ||= {};
  board[String(cell)][size] = current.color;
  const lastMove = { cell, size, color: current.color, seat };
  const next = { ...state, board, lastMove, moveNumber: Number(state.moveNumber || 0) + 1, winner: null, draw: false, skippedSeat: null };
  if (winner(board, current.color)) return finishRound(next, { color: current.color, seat, lastMove });
  const turnIndex = nextPlayablePlayer(next, state.turnIndex);
  if (turnIndex < 0) return finishRound(next, { draw: true, lastMove });
  return { ...next, turnIndex };
}

function advanceRoundState(state, seat) {
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

function restartMatchState(state) {
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

function rematchState(state, seat, requiredSeats = null) {
  if (state.status !== 'finished') throw new Error('round_not_finished');
  if (!state.players.some(player => player.seat === seat)) throw new Error('invalid_seat');
  const rematch = { ...state.rematch, [seat]: true };
  const required = requiredSeats || state.players.map(player => player.seat);
  if (!required.every(requiredSeat => rematch[requiredSeat])) return { ...state, rematch };
  return state.matchComplete ? restartMatchState({ ...state, rematch }) : advanceRoundState({ ...state, rematch }, seat);
}

function leaveState(state, seat) {
  if (!state.players.some(player => player.seat === seat)) throw new Error('invalid_seat');
  // A completed match is already terminal authority. Leaving it detaches only
  // this client; it must not rewrite the shared result into a cancellation.
  // Clear a prior rematch vote so a player cannot leave behind consent that
  // later restarts the room with a ghost seat.
  if (state.status === 'finished' && state.matchComplete) {
    return { ...state, rematch: { ...state.rematch, [seat]: false }, cancelledBy: null };
  }
  if (state.status === 'waiting' && seat !== 'p1') {
    const players = state.players.filter(player => player.seat !== seat);
    const scores = { ...state.scores };
    const rematch = { ...state.rematch };
    delete scores[seat];
    delete rematch[seat];
    return { ...state, players, scores, rematch, cancelledBy: null };
  }
  return { ...state, status: 'cancelled', cancelledBy: seat };
}

// Room settings are mutable only while the lobby is waiting, and only by the
// authoritative owner seat. The editable surface is deliberately an allowlist:
// changing player/turn/board/status ownership would create a second rules path.
function applyRoomEdit(state, seat, changes) {
  if (seat !== 'p1') throw new Error('unauthorized');
  if (state.status !== 'waiting') throw new Error('room_edit_forbidden');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('invalid_payload');
  const keys = Object.keys(changes);
  if (!keys.length) throw new Error('invalid_payload');
  const allowed = new Set(['color', 'targetPlayers', 'targetRounds']);
  if (keys.some(key => !allowed.has(key))) throw new Error('unsafe_room_edit');

  let targetPlayers = Number(state.targetPlayers);
  let winsToMatch = Number(state.winsToMatch ?? state.targetRounds);
  let players = state.players.map(player => ({ ...player }));

  if (Object.hasOwn(changes, 'targetPlayers')) {
    const requestedPlayers = Number(changes.targetPlayers);
    if (!validPlayers(requestedPlayers)) throw new Error('invalid_player_count');
    // Editing must never become an alternate "start now" transition. A waiting
    // lobby always retains at least one open seat; joinState remains the sole
    // transition that turns a filled lobby into a playing match.
    if (requestedPlayers <= players.length) throw new Error('unsafe_room_edit');
    targetPlayers = requestedPlayers;
  }

  if (Object.hasOwn(changes, 'targetRounds')) {
    const requestedRounds = Number(changes.targetRounds);
    if (!validRounds(requestedRounds)) throw new Error('invalid_round_count');
    winsToMatch = requestedRounds;
  }

  if (Object.hasOwn(changes, 'color')) {
    const requestedColor = String(changes.color || '');
    if (!validColor(requestedColor)) throw new Error('invalid_color');
    if (players.some(player => player.seat !== 'p1' && player.color === requestedColor)) throw new Error('color_taken');
    players = players.map(player => player.seat === 'p1' ? { ...player, color: requestedColor } : player);
  }

  return {
    ...state,
    targetPlayers,
    targetRounds: winsToMatch,
    winsToMatch,
    players,
  };
}

export {validColor,validPlayers,validRounds,emptyBoard,winner,hasLegalMove,nextPlayablePlayer,createState,joinState,finishRound,applyMove,advanceRoundState,restartMatchState,rematchState,leaveState,applyRoomEdit};
