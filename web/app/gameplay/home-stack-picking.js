import { SIZES } from '../shared/rules.js';
import { assertCanonicalSessionState } from '../session/canonical-session-state.js';

export const NESTED_HOME_SIZE_ORDER = Object.freeze(['large', 'medium', 'small']);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireActiveTurnSeat(state, seatId) {
  assertCanonicalSessionState(state);
  if (state.lifecycle.phase !== 'turn-loop' || state.lifecycle.interrupt !== null) fail('home_stack_requires_active_turn');
  if (typeof seatId !== 'string' || !seatId) fail('home_stack_seat_required');
  if (state.activeSeatId !== seatId) fail('home_stack_not_active_seat');
  const seat = state.seats.find(candidate => candidate.seatId === seatId);
  if (!seat) fail('home_stack_seat_not_configured');
  return seat;
}

function remainingCount(state, seatId, size) {
  const count = state.inventory?.[seatId]?.[size];
  if (!Number.isInteger(count) || count < 0 || count > 3) fail('invalid_home_piece_inventory');
  return count;
}

function pieceTarget(state, seat, stackIndex, size) {
  const count = remainingCount(state, seat.seatId, size);
  const available = stackIndex < count;
  return deepFreeze({
    id: `home-piece:${seat.seatId}:${stackIndex}:${size}`,
    kind: 'home-piece',
    stackTargetId: `stack:${seat.seatId}:${stackIndex}`,
    seatId: seat.seatId,
    color: seat.color,
    stackIndex,
    copyIndex: stackIndex,
    size,
    remainingCount: count,
    available,
    unavailableReason: available ? null : 'used-size-copy',
  });
}

export function deriveActiveHomeStackTargets(state, seatId = state?.activeSeatId) {
  const seat = requireActiveTurnSeat(state, seatId);
  const stacks = [0, 1, 2].map(stackIndex => {
    const pieces = NESTED_HOME_SIZE_ORDER.map(size => pieceTarget(state, seat, stackIndex, size));
    const availablePieces = pieces.filter(piece => piece.available);
    return deepFreeze({
      id: `stack:${seat.seatId}:${stackIndex}`,
      kind: 'piece-stack',
      seatId: seat.seatId,
      color: seat.color,
      stackIndex,
      enabled: availablePieces.length > 0,
      pieces,
      remainingPieceTargetIds: Object.freeze(availablePieces.map(piece => piece.id)),
    });
  });

  return deepFreeze({
    seatId: seat.seatId,
    color: seat.color,
    revision: state.revision,
    round: state.round,
    activeSeatId: state.activeSeatId,
    stacks,
    remainingTargets: Object.freeze(stacks.flatMap(stack => stack.pieces.filter(piece => piece.available))),
  });
}

function parseStackTargetId(targetId) {
  if (typeof targetId !== 'string') fail('invalid_home_stack_target_id');
  const match = /^stack:([^:]+):([0-2])$/.exec(targetId);
  if (!match) fail('invalid_home_stack_target_id');
  return { seatId: match[1], stackIndex: Number(match[2]) };
}

function requireSize(size) {
  if (!SIZES.includes(size)) fail('invalid_home_piece_size');
  return size;
}

export function resolveHomePieceTarget(state, {
  stackTargetId,
  size,
} = {}) {
  const parsed = parseStackTargetId(stackTargetId);
  const requestedSize = requireSize(size);
  const derived = deriveActiveHomeStackTargets(state, parsed.seatId);
  const stack = derived.stacks[parsed.stackIndex];
  const target = stack.pieces.find(piece => piece.size === requestedSize);
  if (!target) fail('home_piece_target_missing');
  if (!target.available) fail('home_piece_already_used');
  return target;
}

export function remainingHomeSizeTargetsForStack(state, stackTargetId) {
  const parsed = parseStackTargetId(stackTargetId);
  const derived = deriveActiveHomeStackTargets(state, parsed.seatId);
  return Object.freeze(derived.stacks[parsed.stackIndex].pieces.filter(piece => piece.available));
}
