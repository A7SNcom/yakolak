export const ONLINE_COLORS = ['right', 'back', 'left', 'front'];
export const ONLINE_SIZES = ['s', 'm', 'l'];
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

export function validOnlineColor(color) {
  return ONLINE_COLORS.includes(color);
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

export function createOnlineState(hostColor) {
  if (!validOnlineColor(hostColor)) throw new Error('invalid_color');
  return {
    protocol: 1,
    status: 'waiting',
    players: [{ seat: 'host', color: hostColor }],
    turnIndex: 0,
    board: emptyOnlineBoard(),
    round: 1,
    winner: null,
    lastMove: null,
    moveNumber: 0,
    rematch: { host: false, guest: false }
  };
}

export function joinOnlineState(state, guestColor) {
  if (!state || state.status !== 'waiting' || !validOnlineColor(guestColor)) {
    throw new Error('room_not_joinable');
  }
  return {
    ...state,
    status: 'playing',
    players: [
      state.players[0],
      { seat: 'guest', color: guestColor }
    ],
    turnIndex: 0,
    winner: null,
    rematch: { host: false, guest: false }
  };
}

export function applyOnlineMove(state, seat, move) {
  if (!state || state.status !== 'playing') throw new Error('room_not_playing');
  if (!validOnlineMove(move)) throw new Error('invalid_move');
  const current = state.players[state.turnIndex % state.players.length];
  if (!current || current.seat !== seat) throw new Error('not_your_turn');
  const slot = state.board[String(move.zone)]?.[move.size];
  if (slot) throw new Error('occupied_slot');

  const board = structuredClone(state.board);
  board[String(move.zone)][move.size] = current.color;
  const winner = onlineWinner(board, current.color);
  return {
    ...state,
    board,
    winner,
    status: winner ? 'finished' : 'playing',
    turnIndex: winner ? state.turnIndex : (state.turnIndex + 1) % state.players.length,
    lastMove: {
      color: current.color,
      size: move.size,
      zone: move.zone,
      seat
    },
    moveNumber: state.moveNumber + 1,
    rematch: { host: false, guest: false }
  };
}

export function requestOnlineRematch(state, seat) {
  if (!state || state.status !== 'finished') throw new Error('round_not_finished');
  if (seat !== 'host' && seat !== 'guest') throw new Error('invalid_seat');
  const rematch = { ...state.rematch, [seat]: true };
  if (!rematch.host || !rematch.guest) return { ...state, rematch };
  return {
    ...state,
    status: 'playing',
    turnIndex: (state.round || 1) % state.players.length,
    board: emptyOnlineBoard(),
    round: (state.round || 1) + 1,
    winner: null,
    lastMove: null,
    rematch: { host: false, guest: false }
  };
}
