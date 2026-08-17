const NUMBER = String.raw`-?\d+(?:\.\d+)?`;

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function finiteVec3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must be a vec3`);
  return Object.freeze(value.map((entry, index) => finite(Number(entry), `${label}[${index}]`)));
}

function exactMatch(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) throw new Error(`ROOM.md is missing ${label}`);
  return match;
}

export function parseDefinitiveRoomSpec(roomSpecText) {
  if (typeof roomSpecText !== 'string' || !roomSpecText.trim()) throw new TypeError('ROOM.md text is required');

  const x = exactMatch(roomSpecText, new RegExp(`X extent:\\s*(${NUMBER})\\s*to\\s*(${NUMBER})`, 'i'), 'X extent');
  const y = exactMatch(roomSpecText, new RegExp(`Y extent:\\s*floor\\s*(${NUMBER})\\s*to\\s*ceiling\\s*(${NUMBER})`, 'i'), 'Y extent');
  const z = exactMatch(roomSpecText, new RegExp(`Z extent:\\s*back\\s*(${NUMBER})\\s*to\\s*front\\s*(${NUMBER})`, 'i'), 'Z extent');
  const table = exactMatch(roomSpecText, new RegExp(`table[^\\n]*top Y at\\s*(${NUMBER})`, 'i'), 'table top');
  const clearance = exactMatch(roomSpecText, new RegExp(`table top plus\\s*(${NUMBER})\\s*clearance`, 'i'), 'game clearance');
  const content = exactMatch(roomSpecText, new RegExp(`near Z\\s*(${NUMBER})\\s*or X\\s*(${NUMBER})`, 'i'), 'wall-content coordinates');

  const parsed = Object.freeze({
    minX: Number(x[1]),
    maxX: Number(x[2]),
    floorY: Number(y[1]),
    ceilingY: Number(y[2]),
    backZ: Number(z[1]),
    frontZ: Number(z[2]),
    tableTopY: Number(table[1]),
    gameClearance: Number(clearance[1]),
    backContentZ: Number(content[1]),
    rightContentX: Number(content[2]),
  });

  for (const [key, value] of Object.entries(parsed)) finite(value, `ROOM.md ${key}`);
  if (!(parsed.minX < parsed.maxX && parsed.floorY < parsed.ceilingY && parsed.backZ < parsed.frontZ)) {
    throw new Error('ROOM.md bounds must form a positive enclosed volume');
  }
  return parsed;
}

export function pointInsideRoom(point, bounds, epsilon = 1e-9) {
  const [x, y, z] = finiteVec3(point, 'room point');
  return x >= bounds.minX - epsilon && x <= bounds.maxX + epsilon
    && y >= bounds.floorY - epsilon && y <= bounds.ceilingY + epsilon
    && z >= bounds.backZ - epsilon && z <= bounds.frontZ + epsilon;
}

const CAMERA_TRAVEL_PAIRS = Object.freeze([
  ['entryStarDesktop', 'playDesktop'],
  ['entryStarCompact', 'playCompact'],
  ['entryStarPortrait', 'playPortrait2'],
  ['entryStarPortrait', 'playPortraitCrowded'],
  ['brandWallDesktop', 'setupPrimaryDesktop'],
  ['brandWallCompact', 'setupPrimaryCompact'],
  ['brandWallPortrait', 'setupPrimaryPortrait'],
  ['setupPrimaryDesktop', 'setupSecondaryDesktop'],
  ['setupPrimaryCompact', 'setupSecondaryCompact'],
  ['setupPrimaryPortrait', 'setupSecondaryPortrait'],
]);

const smoothCubic = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpVec3 = (a, b, t) => a.map((value, index) => lerp(value, b[index], t));

export function validateScriptedCameraTravel(cameras, bounds, sampleCount = 65) {
  if (!cameras || typeof cameras !== 'object') throw new TypeError('camera data is required');
  if (!Number.isInteger(sampleCount) || sampleCount < 2) throw new TypeError('sampleCount must be an integer >= 2');

  const cameraNames = Object.keys(cameras);
  if (cameraNames.length === 0) throw new Error('at least one canonical camera is required');

  const normalized = new Map();
  for (const name of cameraNames) {
    const camera = cameras[name];
    const position = finiteVec3(camera?.position, `${name}.position`);
    const target = finiteVec3(camera?.target, `${name}.target`);
    finite(Number(camera?.fov), `${name}.fov`);
    if (!pointInsideRoom(position, bounds)) throw new Error(`${name}.position lies outside definitive room bounds`);
    if (!pointInsideRoom(target, bounds)) throw new Error(`${name}.target lies outside definitive room bounds`);
    normalized.set(name, Object.freeze({ position, target, fov: Number(camera.fov) }));
  }

  const travel = [];
  for (const [fromName, toName] of CAMERA_TRAVEL_PAIRS) {
    if (!normalized.has(fromName) || !normalized.has(toName)) throw new Error(`missing canonical scripted camera pair ${fromName} -> ${toName}`);
    const from = normalized.get(fromName);
    const to = normalized.get(toName);
    for (let index = 0; index < sampleCount; index += 1) {
      const t = smoothCubic(index / (sampleCount - 1));
      if (!pointInsideRoom(lerpVec3(from.position, to.position, t), bounds)) {
        throw new Error(`${fromName} -> ${toName} camera position exits room at sample ${index}`);
      }
      if (!pointInsideRoom(lerpVec3(from.target, to.target, t), bounds)) {
        throw new Error(`${fromName} -> ${toName} camera target exits room at sample ${index}`);
      }
    }
    travel.push(Object.freeze({ from: fromName, to: toName, samples: sampleCount }));
  }

  return Object.freeze({ cameraCount: normalized.size, travel: Object.freeze(travel) });
}

export function deriveNeutralRoomLayout({ worldLayout, approvedContract, roomSpecText }) {
  if (!worldLayout?.room || !worldLayout?.cameras) throw new TypeError('world-layout room and cameras are required');
  const parsed = parseDefinitiveRoomSpec(roomSpecText);
  const canonical = worldLayout.room;
  for (const key of ['minX', 'maxX', 'floorY', 'ceilingY', 'backZ', 'frontZ', 'tableTopY', 'gameClearance']) {
    if (Number(canonical[key]) !== parsed[key]) throw new Error(`ROOM.md and world-layout disagree on room.${key}`);
  }

  const wallColor = approvedContract?.materials?.palette?.wall;
  const floorColor = approvedContract?.materials?.palette?.floor;
  if (typeof wallColor !== 'string' || typeof floorColor !== 'string') throw new Error('approved neutral wall/floor palette is required');

  const bounds = Object.freeze({
    minX: parsed.minX,
    maxX: parsed.maxX,
    floorY: parsed.floorY,
    ceilingY: parsed.ceilingY,
    backZ: parsed.backZ,
    frontZ: parsed.frontZ,
  });
  const width = bounds.maxX - bounds.minX;
  const height = bounds.ceilingY - bounds.floorY;
  const depth = bounds.frontZ - bounds.backZ;
  const centerY = (bounds.floorY + bounds.ceilingY) / 2;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.backZ + bounds.frontZ) / 2;

  const backContentInset = parsed.backContentZ - bounds.backZ;
  const rightContentInset = bounds.maxX - parsed.rightContentX;
  if (!(backContentInset > 0) || backContentInset !== rightContentInset) {
    throw new Error('wall-content anti-z-fighting inset must be positive and equal on back/right surfaces');
  }

  const cameraValidation = validateScriptedCameraTravel(worldLayout.cameras, bounds);

  return Object.freeze({
    bounds,
    dimensions: Object.freeze({ width, height, depth }),
    center: Object.freeze([centerX, centerY, centerZ]),
    palette: Object.freeze({ wall: wallColor, floor: floorColor }),
    matte: Object.freeze({ metalness: 0, roughness: 1 }),
    tableTopY: parsed.tableTopY,
    gameClearance: parsed.gameClearance,
    frontWallVisibleDefault: true,
    wallContent: Object.freeze({
      inset: backContentInset,
      back: Object.freeze({ position: Object.freeze([centerX, centerY, parsed.backContentZ]), facing: '+z' }),
      right: Object.freeze({ position: Object.freeze([parsed.rightContentX, centerY, centerZ]), facing: '-x' }),
    }),
    surfaceIds: Object.freeze(['floor', 'ceiling', 'back', 'front', 'left', 'right']),
    cameraValidation,
    voidSafety: Object.freeze({
      enclosedSurfaceCount: 6,
      defaultFrontWallVisible: true,
      interpolation: 'smooth-cubic convex blend of canonical position/target/FOV endpoints',
    }),
  });
}
