import * as THREE from 'three';

export const CANONICAL_PLAYER_IDS = Object.freeze(['marble', 'blue', 'gold', 'green']);
export const CANONICAL_SURFACE_KEYS = Object.freeze(['wall', 'floor', 'table', 'board', 'ink']);

const PLAYER_FINISHES = Object.freeze({
  marble: Object.freeze({ roughness: 0.88, metalness: 0, finishClass: 'soft-matte', nonColorIdentityCue: 'marble-vein' }),
  blue: Object.freeze({ roughness: 0.72, metalness: 0, finishClass: 'satin-matte', nonColorIdentityCue: 'double-band' }),
  gold: Object.freeze({ roughness: 0.38, metalness: 0.12, finishClass: 'soft-satin', nonColorIdentityCue: 'single-notch' }),
  green: Object.freeze({ roughness: 0.56, metalness: 0, finishClass: 'deep-matte', nonColorIdentityCue: 'dot-band' }),
});

const SURFACE_FINISHES = Object.freeze({
  wall: Object.freeze({ roughness: 1, metalness: 0 }),
  floor: Object.freeze({ roughness: 0.94, metalness: 0 }),
  table: Object.freeze({ roughness: 0.84, metalness: 0 }),
  board: Object.freeze({ roughness: 0.78, metalness: 0 }),
  ink: Object.freeze({ roughness: 0.9, metalness: 0 }),
});

export const VISUAL_STATE_CUES = Object.freeze({
  selected: Object.freeze({
    primaryCue: 'outline',
    secondaryCue: 'lift-or-scale',
    requiresNonColorCue: true,
    hueOnlyAllowed: false,
    brightnessOnlyAllowed: false,
  }),
  active: Object.freeze({
    primaryCue: 'seat-ring',
    secondaryCue: 'turn-label',
    requiresNonColorCue: true,
    hueOnlyAllowed: false,
    brightnessOnlyAllowed: false,
  }),
  winner: Object.freeze({
    primaryCue: 'winning-line-or-badge',
    secondaryCue: 'bounded-motion',
    requiresNonColorCue: true,
    hueOnlyAllowed: false,
    brightnessOnlyAllowed: false,
  }),
});

function requireRuntimeData(runtimeData) {
  if (!runtimeData || typeof runtimeData !== 'object') throw new TypeError('Canonical material system requires validated runtime data');
  const palette = runtimeData.materials?.palette;
  if (!palette || typeof palette !== 'object') throw new Error('Runtime data is missing the approved material palette');
  const colorIdentity = runtimeData.colorIdentity;
  if (!colorIdentity || typeof colorIdentity !== 'object') throw new Error('Runtime data is missing canonical color identity');
  const playableIds = colorIdentity.canonicalPlayableIds;
  if (!Array.isArray(playableIds) || JSON.stringify(playableIds) !== JSON.stringify(CANONICAL_PLAYER_IDS)) {
    throw new Error('Canonical playable color order drift');
  }
  if (!Array.isArray(runtimeData.rules?.colors) || JSON.stringify(runtimeData.rules.colors) !== JSON.stringify(CANONICAL_PLAYER_IDS)) {
    throw new Error('Runtime rules color order drift');
  }
  for (const key of [...CANONICAL_SURFACE_KEYS, ...CANONICAL_PLAYER_IDS]) {
    if (typeof palette[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(palette[key])) throw new Error(`Approved palette is missing canonical ${key}`);
  }
  return { palette, colorIdentity };
}

function displayNameFor(colorId, colorIdentity) {
  const override = colorIdentity.displayMaterial?.[colorId];
  if (override?.materialKey && override.materialKey !== colorId) {
    throw new Error(`Gameplay color ${colorId} must resolve to material key ${colorId}`);
  }
  if (colorId === 'marble') {
    if (override?.displayName !== 'white marble' || override?.materialKey !== 'marble') {
      throw new Error('Marble must remain the canonical gameplay ID for the white-marble presentation');
    }
    return override.displayName;
  }
  return override?.displayName || colorId;
}

export function derivePlayerPresentationMap(runtimeData) {
  const { palette, colorIdentity } = requireRuntimeData(runtimeData);
  const result = {};
  for (const colorId of CANONICAL_PLAYER_IDS) {
    const finish = PLAYER_FINISHES[colorId];
    result[colorId] = Object.freeze({
      gameplayId: colorId,
      displayName: displayNameFor(colorId, colorIdentity),
      materialKey: colorId,
      colorHex: palette[colorId].toLowerCase(),
      roughness: finish.roughness,
      metalness: finish.metalness,
      finishClass: finish.finishClass,
      nonColorIdentityCue: finish.nonColorIdentityCue,
    });
  }
  return Object.freeze(result);
}

function applyOptionalTableMaps(material, optionalMaps) {
  for (const [property, texture] of [
    ['map', optionalMaps?.albedo],
    ['normalMap', optionalMaps?.normal],
    ['roughnessMap', optionalMaps?.roughness],
  ]) {
    if (texture == null) continue;
    if (!texture.isTexture) throw new TypeError(`Optional table ${property} must be a Three.js Texture`);
    material[property] = texture;
  }
  material.needsUpdate = true;
}

function createStandardMaterial({ key, colorHex, roughness, metalness, gameplayId = null, displayName = null, identityCue = null }) {
  const material = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness,
    metalness,
  });
  material.name = `yakolak:${key}`;
  material.userData.canonicalMaterial = true;
  material.userData.canonicalKey = key;
  material.userData.gameplayId = gameplayId;
  material.userData.displayName = displayName;
  material.userData.nonColorIdentityCue = identityCue;
  material.userData.stateCueContract = VISUAL_STATE_CUES;
  material.userData.externalMutableTextureUrls = false;
  if (key === 'marble') {
    material.userData.whiteMarble = true;
    material.userData.proceduralVeining = Object.freeze({ allowed: true, enabled: false, externalImageRequired: false });
  }
  return material;
}

export function createCanonicalMaterialSystem({ runtimeData, optionalTableMaps = {} } = {}) {
  const { palette } = requireRuntimeData(runtimeData);
  const playerPresentation = derivePlayerPresentationMap(runtimeData);
  const players = {};
  const surfaces = {};

  for (const colorId of CANONICAL_PLAYER_IDS) {
    const profile = playerPresentation[colorId];
    players[colorId] = createStandardMaterial({
      key: profile.materialKey,
      colorHex: profile.colorHex,
      roughness: profile.roughness,
      metalness: profile.metalness,
      gameplayId: profile.gameplayId,
      displayName: profile.displayName,
      identityCue: profile.nonColorIdentityCue,
    });
  }

  for (const key of CANONICAL_SURFACE_KEYS) {
    const finish = SURFACE_FINISHES[key];
    surfaces[key] = createStandardMaterial({
      key,
      colorHex: palette[key],
      roughness: finish.roughness,
      metalness: finish.metalness,
    });
  }
  applyOptionalTableMaps(surfaces.table, optionalTableMaps);

  const materialByKey = Object.freeze({ ...surfaces, ...players });
  let disposed = false;

  function getPlayerMaterial(gameplayId) {
    const material = players[gameplayId];
    if (!material) throw new RangeError(`Unknown canonical gameplay color ${gameplayId}`);
    return material;
  }

  function getPlayerPresentation(gameplayId) {
    const profile = playerPresentation[gameplayId];
    if (!profile) throw new RangeError(`Unknown canonical gameplay color ${gameplayId}`);
    return profile;
  }

  function getSurfaceMaterial(key) {
    const material = surfaces[key];
    if (!material) throw new RangeError(`Unknown canonical surface material ${key}`);
    return material;
  }

  function snapshot() {
    return Object.freeze({
      playerIds: CANONICAL_PLAYER_IDS,
      playerPresentation,
      stateCues: VISUAL_STATE_CUES,
      materials: Object.freeze(Object.fromEntries(Object.entries(materialByKey).map(([key, material]) => [key, Object.freeze({
        uuid: material.uuid,
        name: material.name,
        colorHex: `#${material.color.getHexString()}`,
        roughness: material.roughness,
        metalness: material.metalness,
        gameplayId: material.userData.gameplayId,
        nonColorIdentityCue: material.userData.nonColorIdentityCue,
      })]))),
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const material of Object.values(materialByKey)) material.dispose();
  }

  return Object.freeze({
    playerPresentation,
    players: Object.freeze(players),
    surfaces: Object.freeze(surfaces),
    materialByKey,
    stateCues: VISUAL_STATE_CUES,
    getPlayerMaterial,
    getPlayerPresentation,
    getSurfaceMaterial,
    snapshot,
    dispose,
  });
}
