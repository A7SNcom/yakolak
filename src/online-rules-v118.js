import {
  ONLINE_COLORS,
  ONLINE_LINES,
  ONLINE_PLAYER_COUNTS,
  ONLINE_SIZES,
  applyOnlineMove as applyBaseOnlineMove,
  availableOnlineColors,
  emptyOnlineBoard,
  hasOnlineLegalMove,
  joinOnlineState as joinBaseOnlineState,
  leaveOnlineState,
  nextOnlineColor,
  onlinePiecesUsed,
  onlineWinner,
  validOnlineColor,
  validOnlineMove,
  validOnlinePlayerCount
} from './online-rules-v114.js';

export {
  ONLINE_COLORS,
  ONLINE_LINES,
  ONLINE_PLAYER_COUNTS,
  ONLINE_SIZES,
  availableOnlineColors,
  emptyOnlineBoard,
  hasOnlineLegalMove,
  leaveOnlineState,
  nextOnlineColor,
  onlinePiecesUsed,
  onlineWinner,
  validOnlineColor,
  validOnlineMove,
  validOnlinePlayerCount
};

export const ONLINE_ROUND_COUNTS = [3, 5];

export function validOnlineRoundCount(value) {
  return ONLINE_ROUND_COUNTS.includes(Number(value));
}

function emptyScores(players) {
  return Object.fromEntries(players.map(player => [player.seat, 0]));
}

function normalizedScores(state) {
  return Object.fromEntries(
    (state.players || []).map(player => [
      player.seat,
      Math.max(0, Number(state.scores?.[player.seat] || 0))
    ])
  );
}

function matchLeaders(state) {
  const scores = normalizedScores(state);
  const best = Math.max(0, ...Object.values(scores));
  if (best <= 0) return [];
  return state.players
    .filter(player => scores[player.seat] === best)
    .map(player => ({ seat: player.seat, color: player.color, wins: best }));
}

export function createOnlineState(hostColor, targetPlayers = 2, targetRounds) {
  if (!validOnlineColor(hostColor)) throw new Error('invalid_color');
  if (!validOnlinePlayerCount(targetPlayers)) throw new Error('invalid_player_count');
  if (!validOnlineRoundCount(targetRounds)) throw new Error('invalid_round_count');
  const players = [{ seat: 'p1', color: hostColor }];
  return {
    protocol: 3,
    status: 'waiting',
    targetPlayers: Number(targetPlayers),
    targetRounds: Number(targetRounds),
    players,
    turnIndex: 0,
    board: emptyOnlineBoard(),
    round: 1,
    completedRounds: 0,
    scores: emptyScores(players),
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { p1: false }
  };
}

export function joinOnlineState(state, seat, color) {
  if (!validOnlineRoundCount(state?.targetRounds)) throw new Error('invalid_round_count');
  const next = joinBaseOnlineState(state, seat, color);
  return {
    ...next,
    protocol: 3,
    targetRounds: Number(state.targetRounds),
    completedRounds: Number(state.completedRounds || 0),
    scores: {
      ...normalizedScores(state),
      [seat]: Math.max(0, Number(state.scores?.[seat] || 0))
    },
    matchComplete: false,
    matchWinner: null,
    matchWinners: []
  };
}

export function applyOnlineMove(state, seat, move) {
  if (!validOnlineRoundCount(state?.targetRounds)) throw new Error('invalid_round_count');
  const next = applyBaseOnlineMove(state, seat, move);
  if (next.status !== 'finished') {
    return {
      ...next,
      protocol: 3,
      targetRounds: Number(state.targetRounds),
      completedRounds: Number(state.completedRounds || 0),
      scores: normalizedScores(state),
      matchComplete: false,
      matchWinner: null,
      matchWinners: []
    };
  }

  const scores = normalizedScores(state);
  if (next.winner?.color) {
    const winner = state.players.find(player => player.color === next.winner.color);
    if (winner) scores[winner.seat] = Number(scores[winner.seat] || 0) + 1;
  }
  const completedRounds = Math.min(Number(state.targetRounds), Number(state.round || 1));
  const matchComplete = completedRounds >= Number(state.targetRounds);
  const withScore = {
    ...next,
    protocol: 3,
    targetRounds: Number(state.targetRounds),
    completedRounds,
    scores,
    matchComplete,
    matchWinner: null,
    matchWinners: []
  };
  if (!matchComplete) return withScore;
  const leaders = matchLeaders(withScore);
  return {
    ...withScore,
    matchWinner: leaders.length === 1 ? leaders[0] : null,
    matchWinners: leaders
  };
}

function resetRound(state, rematch) {
  return {
    ...state,
    status: 'playing',
    turnIndex: Number(state.round || 1) % state.players.length,
    board: emptyOnlineBoard(),
    round: Number(state.round || 1) + 1,
    winner: null,
    draw: false,
    lastMove: null,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch
  };
}

function resetMatch(state, rematch) {
  return {
    ...state,
    status: 'playing',
    turnIndex: 0,
    board: emptyOnlineBoard(),
    round: 1,
    completedRounds: 0,
    scores: emptyScores(state.players),
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch
  };
}

export function requestOnlineRematch(state, seat) {
  if (!state || state.status !== 'finished') throw new Error('round_not_finished');
  if (!state.players.some(player => player.seat === seat)) throw new Error('invalid_seat');
  if (!validOnlineRoundCount(state.targetRounds)) throw new Error('invalid_round_count');
  const rematch = { ...state.rematch, [seat]: true };
  if (!state.players.every(player => rematch[player.seat])) return { ...state, rematch };
  const cleared = Object.fromEntries(state.players.map(player => [player.seat, false]));
  return state.matchComplete ? resetMatch(state, cleared) : resetRound(state, cleared);
}
