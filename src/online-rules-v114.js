export const ONLINE_COLORS = ['right', 'back', 'left', 'front'];
export const ONLINE_SIZES = ['s', 'm', 'l'];
export const ONLINE_PLAYER_COUNTS = [2, 3, 4];
export const ONLINE_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

export function emptyOnlineBoard() {
  return Object.fromEntries(
    Array.from({ length: 9 }, (_, zone) => [
      String(zone),
      { s: null, m: null, l: null }
    ])
  );
}

export function nextOnlineColor(color) {
  const at = ONLINE_COLORS.indexOf(color);
  return ONLINE_COLORS[(at < 0 ? 0 : at + 1) % ONLINE_COLORS.length];
}

export function validOnlinePlayerCount(value) {
  return ONLINE_PLAYER_COUNTS.includes(Number(value));
}

export function validOnlineColor(color) {
  return ONLINE_COLORS.includes(color);
}

export function availableOnlineColors(state) {
  const used = new Set((state?.players || []).map(player => player.color));
  return ONLINE_COLORS.filter(color => !used.has(color));
}

export function validOnlineMove(move) {
  return Boolean(
    move &&
    Number.isInteger(move.zone) &&
    move.zone >= 0 &&
    move.zone < 9 &&
    ONLINE_SIZES.includes(move.size)
  );
}

export function onlinePiecesUsed(board, color, size) {
  if (!board || !validOnlineColor(color) || !ONLINE_SIZES.includes(size)) return 0;
  return Object.values(board).filter(slot => slot?.[size] === color).length;
}

export function hasOnlineLegalMove(board, color) {
  if (!board || !validOnlineColor(color)) return false;
  return ONLINE_SIZES.some(size =>
    onlinePiecesUsed(board, color, size) < 3 &&
    Object.values(board).some(slot => !slot?.[size])
  );
}

export function onlineWinner(board, color) {
  if (!validOnlineColor(color) || !board) return null;
  for (const line of ONLINE_LINES) {
    for (const size of ONLINE_SIZES) {
      if (line.every(zone => board[String(zone)]?.[size] === color)) {
        return {
          color,
          type: 'same-size',
          cells: line.map(zone => ({ zone, size }))
        };
      }
    }
    for (const sequence of [['s', 'm', 'l'], ['l', 'm', 's']]) {
      if (sequence.every((size, index) => board[String(line[index])]?.[size] === color)) {
        return {
          color,
          type: 'graded',
          cells: line.map((zone, index) => ({ zone, size: sequence[index] }))
        };
      }
    }
  }
  for (let zone = 0; zone < 9; zone += 1) {
    if (ONLINE_SIZES.every(size => board[String(zone)]?.[size] === color)) {
      return {
        color,
        type: 'cell',
        cells: ONLINE_SIZES.map(size => ({ zone, size }))
      };
    }
  }
  return null;
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

  const board = structuredClone(state.board);
  board[String(move.zone)][move.size] = current.color;
  const winner = onlineWinner(board, current.color);
  let nextTurnIndex = state.turnIndex;
  if (!winner) {
    for (let offset = 1; offset <= state.players.length; offset += 1) {
      const candidate = (state.turnIndex + offset) % state.players.length;
      if (hasOnlineLegalMove(board, state.players[candidate].color)) {
        nextTurnIndex = candidate;
        break;
      }
    }
  }
  const draw = !winner && !state.players.some(player => hasOnlineLegalMove(board, player.color));
  return {
    ...state,
    board,
    winner,
    draw,
    status: winner || draw ? 'finished' : 'playing',
    turnIndex: winner || draw ? state.turnIndex : nextTurnIndex,
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
