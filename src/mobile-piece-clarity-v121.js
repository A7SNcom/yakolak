const MOBILE_ACTIVE_EMISSIVE_INTENSITY_CAP = 0.28;

function pieceStyleFor(style, color, mobile, state='normal') {
  if (!style || !mobile || state !== 'active') return style;
  const emissiveIntensity = Number(style.emissiveIntensity);
  if (!Number.isFinite(emissiveIntensity) || emissiveIntensity <= MOBILE_ACTIVE_EMISSIVE_INTENSITY_CAP) return style;
  return { ...style, emissiveIntensity: MOBILE_ACTIVE_EMISSIVE_INTENSITY_CAP };
}

globalThis.__yakolakMobilePieceClarityV121 = {
  version: 121,
  change: 'mobile-only-active-piece-emissive-cap',
  activeEmissiveIntensityCap: MOBILE_ACTIVE_EMISSIVE_INTENSITY_CAP,
  renderCost: Object.freeze({
    pixelRatioChange: 0,
    geometryAdded: 0,
    materialsAdded: 0,
    shadersAdded: 0,
    lightsAdded: 0,
    shadowsAdded: 0,
    drawCallsAdded: 0,
    postProcessingAdded: 0
  }),
  pieceStyleFor
};