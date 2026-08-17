import * as THREE from 'three';

const REQUIRED_RATIO_KEYS = Object.freeze(['hemisphere', 'key', 'fill', 'rim']);
const BASELINE_SCREENSHOTS = Object.freeze([
  'docs/threejs-baseline/screenshots/production-320x568.png',
  'docs/threejs-baseline/screenshots/production-390x844.png',
  'docs/threejs-baseline/screenshots/production-1440x900.png',
]);

export const MINIMAL_LIGHTING_POLICY = Object.freeze({
  source: 'runtimeData.materials.lightingReferenceOnly.normalizedRatios',
  baselineTuningSource: 'docs/threejs-baseline/screenshots',
  baselineScreenshots: BASELINE_SCREENSHOTS,
  neutralLightCount: 3,
  fillFold: 'hemisphere',
  environmentMap: false,
  shadows: false,
  turnEmphasisLightCount: 0,
  neutralMutationFromTurnState: false,
  baselineTunedScale: 1.3,
});

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${label} must be a positive finite number`);
  return number;
}

export function deriveMinimalLightingProfile(runtimeData) {
  const ratios = runtimeData?.materials?.lightingReferenceOnly?.normalizedRatios;
  if (!ratios || typeof ratios !== 'object') throw new Error('Runtime data is missing portable lighting reference ratios');
  const keys = Object.keys(ratios).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...REQUIRED_RATIO_KEYS].sort())) {
    throw new Error(`Lighting reference ratio keys drift: ${keys.join(',')}`);
  }

  const reference = Object.fromEntries(REQUIRED_RATIO_KEYS.map((key) => [key, finitePositive(ratios[key], `lighting.${key}`)]));
  const keyUnit = reference.key;
  const relative = Object.freeze({
    hemisphere: (reference.hemisphere + reference.fill) / keyUnit,
    key: 1,
    rim: reference.rim / keyUnit,
  });
  const scale = MINIMAL_LIGHTING_POLICY.baselineTunedScale;
  const intensities = Object.freeze({
    hemisphere: relative.hemisphere * scale,
    key: relative.key * scale,
    rim: relative.rim * scale,
  });

  return Object.freeze({
    reference: Object.freeze(reference),
    relative,
    intensities,
    fillFold: MINIMAL_LIGHTING_POLICY.fillFold,
    neutralLightCount: MINIMAL_LIGHTING_POLICY.neutralLightCount,
    baselineTunedScale: scale,
  });
}

function configureNeutralLight(light, role) {
  light.name = `yakolak:neutral-light:${role}`;
  light.castShadow = false;
  light.userData.presentationOnly = true;
  light.userData.neutralLightingRole = role;
  light.userData.shadowPolicy = 'disabled-until-threejs-026';
  return light;
}

export function createTurnEmphasisPresentation({ materialSystem } = {}) {
  if (!materialSystem?.getPlayerPresentation || !materialSystem?.stateCues?.active) {
    throw new TypeError('Turn emphasis presentation requires the canonical material system');
  }
  let activePlayerId = null;

  function setActivePlayer(playerId = null) {
    if (playerId == null) {
      activePlayerId = null;
      return null;
    }
    materialSystem.getPlayerPresentation(playerId);
    activePlayerId = playerId;
    return materialSystem.getPlayerPresentation(playerId);
  }

  function snapshot() {
    return Object.freeze({
      activePlayerId,
      layer: 'turn-emphasis-presentation',
      neutralLightingMutation: false,
      lightCount: 0,
      primaryCue: materialSystem.stateCues.active.primaryCue,
      secondaryCue: materialSystem.stateCues.active.secondaryCue,
      colorOrBrightnessAloneAllowed: false,
    });
  }

  return Object.freeze({ setActivePlayer, snapshot });
}

export function createMinimalLightingRig({ runtimeData } = {}) {
  const profile = deriveMinimalLightingProfile(runtimeData);
  const palette = runtimeData?.materials?.palette;
  if (!palette?.wall || !palette?.floor) throw new Error('Minimal lighting rig requires canonical neutral palette colors');

  const root = new THREE.Group();
  root.name = 'yakolak:minimal-neutral-lighting';
  root.userData.presentationOnly = true;
  root.userData.authority = 'portable-lighting-ratios-plus-baseline-pixels';

  const hemisphere = configureNeutralLight(new THREE.HemisphereLight(
    new THREE.Color(palette.wall),
    new THREE.Color(palette.floor),
    profile.intensities.hemisphere,
  ), 'hemisphere-plus-fill');

  const key = configureNeutralLight(new THREE.DirectionalLight(
    new THREE.Color(palette.wall),
    profile.intensities.key,
  ), 'key');
  key.position.set(4, 8, 6);
  key.target.position.set(0, 0, 0);

  const rim = configureNeutralLight(new THREE.DirectionalLight(
    new THREE.Color(palette.wall),
    profile.intensities.rim,
  ), 'rim');
  rim.position.set(-5, 4, -6);
  rim.target.position.set(0, 0, 0);

  root.add(hemisphere, key, key.target, rim, rim.target);
  const lights = Object.freeze({ hemisphere, key, rim });
  let disposed = false;

  function snapshot() {
    return Object.freeze({
      policy: MINIMAL_LIGHTING_POLICY,
      referenceRatios: profile.reference,
      relativeWeights: profile.relative,
      intensities: profile.intensities,
      neutralLightCount: 3,
      lightTypes: Object.freeze(['HemisphereLight', 'DirectionalLight', 'DirectionalLight']),
      fillFold: profile.fillFold,
      environmentMap: false,
      shadows: false,
      turnEmphasisIntegratedIntoNeutralRig: false,
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root.remove(hemisphere, key, key.target, rim, rim.target);
  }

  return Object.freeze({ root, lights, profile, snapshot, dispose });
}
