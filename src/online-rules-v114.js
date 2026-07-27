import {
  GAME_COLORS,
  GAME_LINES,
  GAME_PLAYER_COUNTS,
  GAME_SIZES,
  applyBoardMove,
  createEmptyBoard,
  hasLegalMove,
  isGameColor,
  isGameMove,
  isPlayerCount,
  nextPlayableTurn,
  piecesUsed,
  winnerForBoard
} from './game-rules-v126.js';

export const ONLINE_COLORS = GAME_COLORS;
export const ONLINE_SIZES = GAME_SIZES;
export const ONLINE_PLAYER_COUNTS = GAME_PLAYER_COUNTS;
export const ONLINE_LINES = GAME_LINES;

export function emptyOnlineBoard() {
  return createEmptyBoard();
}

export function nextOnlineColor(color) {
  const at = ONLINE_COLORS.indexOf(color);
  return ONLINE_COLORS[(at < 0 ? 0 : at + 1) % ONLINE_COLORS.length];
}

export function validOnlinePlayerCount(value) {
  return isPlayerCount(value);
}

export function validOnlineColor(color) {
  return isGameColor(color);
}

export function availableOnlineColors(state) {
  const used = new Set((state?.players || []).map(player => player.color));
  return ONLINE_COLORS.filter(color => !used.has(color));
}

export function validOnlineMove(move) {
  return isGameMove(move);
}

export function onlinePiecesUsed(board, color, size) {
  return piecesUsed(board, color, size);
}

export function hasOnlineLegalMove(board, color) {
  return hasLegalMove(board, color);
}

export function onlineWinner(board, color) {
  return winnerForBoard(board, color);
}

export function createOnlineState(hostColor, targetPlayers = 2) {
  if (!validOnlineColor(hostColor)) throw new Error('invalid_color');
  if (!validOnlinePlayerCount(targetPlayers)) throw new Error('invalid_player_count');
  return {
    protocol: 2,
    status: 'waiting',
    targetPlayers: Number(targetPlayers),
    players: [{ seat: 'p1', color: hostColor }],
    turnIndex: 0,
    board: emptyOnlineBoard(),
    round: 1,
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    rematch: { p1: false }
  };
}

export function joinOnlineState(state, seat, color) {
  if (!state || state.status !== 'waiting') throw new Error('room_not_joinable');
  if (!/^p[2-4]$/.test(String(seat || ''))) throw new Error('invalid_seat');
  if (!validOnlineColor(color)) throw new Error('invalid_color');
  if (state.players.length >= state.targetPlayers) throw new Error('room_full');
  if (state.players.some(player => player.seat === seat)) throw new Error('seat_taken');
  if (!availableOnlineColors(state).includes(color)) throw new Error('color_taken');
  const players = [...state.players, { seat, color }];
  const rematch = Object.fromEntries(players.map(player => [player.seat, false]));
  return {
    ...state,
    status: players.length === state.targetPlayers ? 'playing' : 'waiting',
    players,
    turnIndex: 0,
    winner: null,
    draw: false,
    rematch
  };
}

export function applyOnlineMove(state, seat, move) {
  if (!state || state.status !== 'playing') throw new Error('room_not_playing');
  if (!validOnlineMove(move)) throw new Error('invalid_move');
  const current = state.players[state.turnIndex % state.players.length];
  if (!current || current.seat !== seat) throw new Error('not_your_turn');
  if (onlinePiecesUsed(state.board, current.color, move.size) >= 3) {
    throw new Error('no_piece_remaining');
  }
  const slot = state.board[String(move.zone)]?.[move.size];
  if (slot) throw new Error('occupied_slot');

  const board = applyBoardMove(state.board, current.color, move);
  const winner = onlineWinner(board, current.color);
  const playableTurn = winner ? state.turnIndex : nextPlayableTurn(state.players, state.turnIndex, board);
  const draw = !winner && playableTurn == null;
  return {
    ...state,
    board,
    winner,
    draw,
    status: winner || draw ? 'finished' : 'playing',
    turnIndex: winner || draw ? state.turnIndex : playableTurn,
    lastMove: {
      color: current.color,
      size: move.size,
      zone: move.zone,
      seat
    },
    moveNumber: state.moveNumber + 1,
    rematch: Object.fromEntries(state.players.map(player => [player.seat, false]))
  };
}

export function requestOnlineRematch(state, seat) {
  if (!state || state.status !== 'finished') throw new Error('round_not_finished');
  if (!state.players.some(player => player.seat === seat)) throw new Error('invalid_seat');
  const rematch = { ...state.rematch, [seat]: true };
  if (!state.players.every(player => rematch[player.seat])) return { ...state, rematch };
  return {
    ...state,
    status: 'playing',
    turnIndex: (state.round || 1) % state.players.length,
    board: emptyOnlineBoard(),
    round: (state.round || 1) + 1,
    winner: null,
    draw: false,
    lastMove: null,
    rematch: Object.fromEntries(state.players.map(player => [player.seat, false]))
  };
}

export function leaveOnlineState(state, seat) {
  if (!state?.players?.some(player => player.seat === seat)) throw new Error('invalid_seat');
  if (seat === 'p1' || state.status !== 'waiting') {
    return { ...state, status: 'cancelled', cancelledBy: seat };
  }
  const players = state.players.filter(player => player.seat !== seat);
  return {
    ...state,
    players,
    rematch: Object.fromEntries(players.map(player => [player.seat, false]))
  };
}
