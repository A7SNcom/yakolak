const game = globalThis.__yakolakGame;
if (!game?.THREE?.RingGeometry || !game?.gameGroup?.add) {
  throw new Error('v119 last-move marker hooks unavailable');
}

const SOURCE_INNER = 31;
const SOURCE_OUTER = 35;
const TARGET_INNER = 30.5;
const TARGET_OUTER = 33;
const ACTIVE_OPACITY = 0.42;
const FINISHED_OPACITY = 0.28;

function isLastMoveRing(object) {
  const parameters = object?.geometry?.parameters;
  return object?.geometry?.type === 'RingGeometry' &&
    Number(parameters?.innerRadius) === SOURCE_INNER &&
    Number(parameters?.outerRadius) === SOURCE_OUTER;
}

function currentOpacity() {
  return globalThis.__yakolakOnlineV114?.room?.status === 'finished'
    ? FINISHED_OPACITY
    : ACTIVE_OPACITY;
}

function softenLastMoveRing(object) {
  if (!isLastMoveRing(object) || object.userData?.v119SubtleLastMove) return object;

  const previousGeometry = object.geometry;
  object.geometry = new game.THREE.RingGeometry(TARGET_INNER, TARGET_OUTER, 64);
  previousGeometry?.dispose?.();

  if (object.material) {
    object.material.transparent = true;
    object.material.opacity = currentOpacity();
    object.material.depthTest = true;
    object.material.depthWrite = false;
    object.material.needsUpdate = true;
  }

  object.renderOrder = Math.min(Number(object.renderOrder) || 0, 10010);
  object.userData ||= {};
  object.userData.v119SubtleLastMove = true;
  return object;
}

for (const child of game.gameGroup.children || []) softenLastMoveRing(child);

const originalAdd = game.gameGroup.add;
game.gameGroup.add = function v119Add(...objects) {
  objects.forEach(softenLastMoveRing);
  return originalAdd.apply(this, objects);
};

globalThis.__yakolakV119LastMove = {
  version: 119,
  source: [SOURCE_INNER, SOURCE_OUTER],
  target: [TARGET_INNER, TARGET_OUTER],
  opacity: { active: ACTIVE_OPACITY, finished: FINISHED_OPACITY }
};
