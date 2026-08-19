import { assertCanonicalSessionState } from '../session/canonical-session-state.js';
import { remainingHomeSizeTargetsForStack } from './home-stack-picking.js';

export const STACK_OPEN_SEPARATION_Y = 19;
export const STACK_CLOSE_ARC_HEIGHT = 10;
export const STACK_MOTION_EASING = 'easeInOutCubic';

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

function finiteTriple(value, code) {
  if (!Array.isArray(value) || value.length !== 3) fail(code);
  const triple = value.map(Number);
  if (triple.some(number => !Number.isFinite(number))) fail(code);
  return Object.freeze(triple);
}

function requireWorldLayout(worldLayout) {
  if (!worldLayout?.homeStacks || !Array.isArray(worldLayout?.pieceRotationDegrees)) fail('stack_motion_world_layout_required');
  return worldLayout;
}

function requireMotionContract(approvedContract) {
  const motion = approvedContract?.motion;
  if (!motion) fail('stack_motion_contract_required');
  if (motion.stackOpenMs !== 360 || motion.stackCloseMs !== 360) fail('stack_motion_timing_drift');
  return motion;
}

function parseStackTargetId(stackTargetId) {
  if (typeof stackTargetId !== 'string') fail('invalid_stack_motion_target_id');
  const match = /^stack:([^:]+):([0-2])$/.exec(stackTargetId);
  if (!match) fail('invalid_stack_motion_target_id');
  return { seatId: match[1], stackIndex: Number(match[2]) };
}

function pieceId(target) {
  return `piece:${target.color}:${target.size}:${target.copyIndex + 1}`;
}

function transformAt(position, rotationDegrees) {
  return deepFreeze({
    position: finiteTriple(position, 'invalid_stack_motion_position'),
    rotationDegrees: finiteTriple(rotationDegrees, 'invalid_stack_motion_rotation'),
    scale: Object.freeze([1, 1, 1]),
  });
}

function requireAction(action) {
  if (action !== 'open' && action !== 'close') fail('invalid_stack_motion_action');
  return action;
}

export function deriveStackMotionPlan({
  state,
  stackTargetId,
  action,
  worldLayout,
  approvedContract,
} = {}) {
  assertCanonicalSessionState(state);
  const normalizedAction = requireAction(action);
  const layout = requireWorldLayout(worldLayout);
  const motion = requireMotionContract(approvedContract);
  const parsed = parseStackTargetId(stackTargetId);
  const homeCenters = layout.homeStacks?.[parsed.seatId];
  if (!Array.isArray(homeCenters) || homeCenters.length !== 3) fail('stack_motion_home_center_missing');
  const homeCenter = finiteTriple(homeCenters[parsed.stackIndex], 'invalid_stack_motion_home_center');
  const rotationDegrees = finiteTriple(layout.pieceRotationDegrees, 'invalid_stack_motion_rotation');
  const remaining = remainingHomeSizeTargetsForStack(state, stackTargetId);
  if (remaining.length === 0) fail('stack_motion_no_remaining_pieces');

  const pieces = remaining.map((target, rank) => {
    const homeTransform = transformAt(homeCenter, rotationDegrees);
    const openTransform = transformAt([
      homeCenter[0],
      homeCenter[1] + STACK_OPEN_SEPARATION_Y * rank,
      homeCenter[2],
    ], rotationDegrees);
    return deepFreeze({
      targetId: target.id,
      pieceId: pieceId(target),
      seatId: target.seatId,
      color: target.color,
      stackIndex: target.stackIndex,
      size: target.size,
      copyIndex: target.copyIndex,
      rank,
      homeTransform,
      openTransform,
      targetTransform: normalizedAction === 'open' ? openTransform : homeTransform,
      arcHeight: normalizedAction === 'close' && rank > 0 ? STACK_CLOSE_ARC_HEIGHT : 0,
    });
  });

  return deepFreeze({
    action: normalizedAction,
    stackTargetId,
    seatId: parsed.seatId,
    stackIndex: parsed.stackIndex,
    generation: state.lifecycle.presentationGeneration,
    revision: state.revision,
    durationMs: normalizedAction === 'open' ? motion.stackOpenMs : motion.stackCloseMs,
    easing: STACK_MOTION_EASING,
    separationY: STACK_OPEN_SEPARATION_Y,
    closeArcHeight: STACK_CLOSE_ARC_HEIGHT,
    pieces,
    lifecycle: state.lifecycle,
  });
}

function requireMotionController(motionController) {
  if (!motionController?.animate || !motionController?.snapshot || !motionController?.syncSessionAuthority || !motionController?.cancelScope) {
    fail('stack_motion_controller_required');
  }
  return motionController;
}

function requirePresentation(presentation) {
  for (const method of ['readPieceTransform', 'applyPieceTransform', 'snapPieceHome', 'isPieceLive']) {
    if (typeof presentation?.[method] !== 'function') fail(`stack_motion_presentation_${method}_required`);
  }
  return presentation;
}

function assertForwardAuthority(controllerSnapshot, plan) {
  if (plan.generation < controllerSnapshot.generation) fail('stale_stack_motion_generation');
  if (plan.revision < controllerSnapshot.revision) fail('stale_stack_motion_revision');
}

function arcAdjustedTransform(value, easedProgress, arcHeight) {
  if (!arcHeight) return value;
  const position = [...value.position];
  position[1] += Math.sin(Math.PI * easedProgress) * arcHeight;
  return deepFreeze({
    ...value,
    position: Object.freeze(position),
  });
}

export function submitStackMotionPlan({
  plan,
  motionController,
  presentation,
} = {}) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.pieces)) fail('stack_motion_plan_required');
  const controller = requireMotionController(motionController);
  const view = requirePresentation(presentation);
  const before = controller.snapshot();
  assertForwardAuthority(before, plan);
  controller.syncSessionAuthority(plan.lifecycle, plan.revision);

  const handles = plan.pieces.map(piece => {
    const from = view.readPieceTransform(piece.pieceId);
    if (!from) fail('stack_motion_piece_transform_missing');
    return controller.animate({
      scope: plan.stackTargetId,
      key: `piece:${piece.pieceId}`,
      generation: plan.generation,
      revision: plan.revision,
      durationMs: plan.durationMs,
      from,
      to: piece.targetTransform,
      easing: plan.easing,
      apply(value, meta) {
        view.applyPieceTransform(
          piece.pieceId,
          arcAdjustedTransform(value, meta.easedProgress, piece.arcHeight),
          meta,
        );
      },
      isTargetLive: () => view.isPieceLive(piece.pieceId),
      snapToCanonical(meta) {
        view.snapPieceHome(piece.pieceId, piece.homeTransform, meta);
      },
    });
  });

  return Object.freeze({
    plan,
    handles: Object.freeze(handles),
  });
}

export function cancelStackMotion({
  motionController,
  stackTargetId,
  reason = 'stack-motion-cancelled',
} = {}) {
  parseStackTargetId(stackTargetId);
  return requireMotionController(motionController).cancelScope(stackTargetId, reason);
}
