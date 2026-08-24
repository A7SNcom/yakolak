import { readRenderedBoardCellCenters } from './rendered-hit-transforms.js';

export const GAMEPLAY_INTERACTION_LAYER = 31;
export const BOARD_ZONE_TOUCH_RADIUS = 42;
export const INTERACTION_PROXY_HEIGHT = 6;

const PHYSICAL_SEATS = Object.freeze(['right', 'back', 'left', 'front']);
const INTERACTION_STATE_KEYS = Object.freeze(['hovered', 'pressed', 'focused']);

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

function finitePoint(value, code) {
  if (!Array.isArray(value) || value.length !== 3 || value.some(number => !Number.isFinite(Number(number)))) fail(code);
  return Object.freeze(value.map(Number));
}

function distanceXZ(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function deriveStackTouchRadius(homeStacks) {
  let minimum = Infinity;
  for (const seatId of PHYSICAL_SEATS) {
    const centers = homeStacks?.[seatId];
    if (!Array.isArray(centers) || centers.length !== 3) fail('invalid_home_stack_centers');
    const normalized = centers.map((center, index) => finitePoint(center, `invalid_home_stack_center_${seatId}_${index}`));
    for (let left = 0; left < normalized.length; left += 1) {
      for (let right = left + 1; right < normalized.length; right += 1) {
        minimum = Math.min(minimum, distanceXZ(normalized[left], normalized[right]));
      }
    }
  }
  if (!Number.isFinite(minimum) || minimum <= 0) fail('invalid_home_stack_spacing');
  return minimum / 2;
}

function renderedBoardCenterMap() {
  const rendered = readRenderedBoardCellCenters();
  if (rendered === null) return null;
  if (!Array.isArray(rendered) || rendered.length !== 9) fail('interaction_rendered_board_requires_nine_cells');
  return new Map(rendered.map(record => [record.cellId, record.center]));
}

export function deriveGameplayInteractionTargets(worldLayout) {
  if (!worldLayout || typeof worldLayout !== 'object') fail('world_layout_required');
  if (!Array.isArray(worldLayout.zones) || worldLayout.zones.length !== 9) fail('interaction_requires_nine_zones');
  if (!worldLayout.homeStacks || typeof worldLayout.homeStacks !== 'object') fail('interaction_requires_home_stacks');

  const renderedCenters = renderedBoardCenterMap();
  const stackTouchRadius = deriveStackTouchRadius(worldLayout.homeStacks);
  const zones = [...worldLayout.zones]
    .sort((a, b) => a.id - b.id)
    .map((zone, index) => {
      if (!Number.isInteger(zone?.id) || zone.id !== index) fail('interaction_zone_ids_must_be_zero_to_eight');
      const renderedCenter = renderedCenters?.get(zone.id) || null;
      if (renderedCenters && !renderedCenter) fail(`interaction_rendered_board_cell_missing_${zone.id}`);
      return deepFreeze({
        id: `board:${zone.id}`,
        kind: 'board-zone',
        cellId: zone.id,
        center: finitePoint(renderedCenter || zone.position, `invalid_interaction_zone_${zone.id}`),
        radius: BOARD_ZONE_TOUCH_RADIUS,
        height: INTERACTION_PROXY_HEIGHT,
      });
    });

  const stacks = [];
  for (const seatId of PHYSICAL_SEATS) {
    const centers = worldLayout.homeStacks[seatId];
    if (!Array.isArray(centers) || centers.length !== 3) fail(`interaction_requires_three_stacks_${seatId}`);
    centers.forEach((center, stackIndex) => {
      stacks.push(deepFreeze({
        id: `stack:${seatId}:${stackIndex}`,
        kind: 'piece-stack',
        seatId,
        stackIndex,
        center: finitePoint(center, `invalid_interaction_stack_${seatId}_${stackIndex}`),
        radius: stackTouchRadius,
        height: INTERACTION_PROXY_HEIGHT,
      }));
    });
  }

  const targets = Object.freeze([...zones, ...stacks]);
  return deepFreeze({
    layer: GAMEPLAY_INTERACTION_LAYER,
    boardZoneTouchRadius: BOARD_ZONE_TOUCH_RADIUS,
    stackTouchRadius,
    zones: Object.freeze(zones),
    stacks: Object.freeze(stacks),
    targets,
  });
}

function defaultInteractionState() {
  return { hovered: false, pressed: false, focused: false };
}

export function createInteractionStateStore(targetDescriptors = []) {
  if (!Array.isArray(targetDescriptors)) fail('interaction_targets_required');
  const known = new Set();
  const states = new Map();
  for (const descriptor of targetDescriptors) {
    if (!descriptor || typeof descriptor.id !== 'string' || !descriptor.id || known.has(descriptor.id)) fail('invalid_interaction_target_id');
    known.add(descriptor.id);
    states.set(descriptor.id, defaultInteractionState());
  }

  function register(targetId) {
    if (typeof targetId !== 'string' || !targetId || known.has(targetId)) fail('invalid_interaction_target_id');
    known.add(targetId);
    states.set(targetId, defaultInteractionState());
  }

  function unregister(targetId) {
    known.delete(targetId);
    states.delete(targetId);
  }

  function set(targetId, patch = {}) {
    if (!known.has(targetId)) fail('unknown_interaction_target');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('invalid_interaction_state_patch');
    const keys = Object.keys(patch);
    if (keys.some(key => !INTERACTION_STATE_KEYS.includes(key))) fail('invalid_interaction_state_key');
    const next = { ...states.get(targetId) };
    for (const key of keys) {
      if (typeof patch[key] !== 'boolean') fail('invalid_interaction_state_value');
      next[key] = patch[key];
    }
    states.set(targetId, next);
    return deepFreeze({ targetId, ...next });
  }

  function get(targetId) {
    if (!known.has(targetId)) return null;
    return deepFreeze({ targetId, ...states.get(targetId) });
  }

  function snapshot() {
    return Object.freeze([...known].sort().map(targetId => get(targetId)));
  }

  return Object.freeze({ register, unregister, set, get, snapshot });
}
