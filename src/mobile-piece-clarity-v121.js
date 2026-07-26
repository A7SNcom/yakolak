const MOBILE_EMISSIVE_INTENSITY_CAPS = Object.freeze({
  right: 0.04,
  back: 0.06,
  front: 0.055,
  left: 0.06
});

function pieceStyleFor(style, color, mobile) {
  if (!style || !mobile) return style;
  const cap = MOBILE_EMISSIVE_INTENSITY_CAPS[color];
  if (!Number.isFinite(cap)) return style;
  const emissiveIntensity = Number(style.emissiveIntensity);
  if (!Number.isFinite(emissiveIntensity) || emissiveIntensity <= cap) return style;
  return { ...style, emissiveIntensity: cap };
}

globalThis.__yakolakMobilePieceClarityV121 = {
  version: 121,
  change: 'mobile-only-piece-emissive-fill-cap',
  caps: MOBILE_EMISSIVE_INTENSITY_CAPS,
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
