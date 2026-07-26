const MOBILE_ROUGHNESS_CAPS = Object.freeze({
  right: 0.72,
  back: 0.60,
  front: 0.54,
  left: 0.48
});

function cloneStyle(style) {
  return style && typeof style === 'object' ? { ...style } : style;
}

function pieceStyleFor(style, color, mobile) {
  if (!style || !mobile) return style;
  const cap = MOBILE_ROUGHNESS_CAPS[color];
  if (!Number.isFinite(cap)) return style;
  const roughness = Number(style.roughness);
  if (!Number.isFinite(roughness) || roughness <= cap) return style;
  return { ...cloneStyle(style), roughness: cap };
}

globalThis.__yakolakMobilePieceClarityV121 = {
  version: 121,
  change: 'mobile-only-piece-roughness-cap',
  caps: MOBILE_ROUGHNESS_CAPS,
  pieceStyleFor
};
