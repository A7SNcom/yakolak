export const MOBILE_BOARD_STYLE = Object.freeze({
  color: '#5b6875',
  emissive: '#1f2b36',
  emissiveIntensity: 0.08
});

export function boardStyleFor(baseStyle, mobileView) {
  if (!baseStyle || typeof baseStyle !== 'object') throw new TypeError('board_style_required');
  return mobileView ? { ...baseStyle, ...MOBILE_BOARD_STYLE } : baseStyle;
}

globalThis.__yakolakMobileClarityV120 = Object.freeze({
  version: 120,
  change: 'mobile-only-board-separation',
  boardStyleFor,
  mobileStyle: MOBILE_BOARD_STYLE,
  renderCost: Object.freeze({
    pixelRatioChange: 0,
    shadowsAdded: 0,
    lightsAdded: 0,
    drawCallsAdded: 0,
    postProcessingAdded: 0
  })
});
