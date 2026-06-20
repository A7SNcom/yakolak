export const BUILD_ID = 'yakolak-dev-alignment-v002';

export const STORAGE_KEY = 'yakolak.alignment.v002';

export const YAKLAK_ALIGNMENT = {
  version: 'yaklak_dev_alignment_v002',
  note: 'cell1 + cell9 فقط، وبقية الخانات محسوبة تلقائياً',
  cell1: { x: -47.259, y: 47.583, z: 2.8 },
  cell9: { x: 48.318, y: -47.335, z: 2.8 },
  cellHalf: 30,
  snapZOffset: 0.42,
  derived: { stepX: 47.789, stepY: -47.459, stepZ: 0 }
};

export const DEFAULT_CALIBRATION = {
  origin: { x: 0.5295, y: 2.8, z: 0.124 },
  stepX: 47.789,
  stepZ: -47.459,
  dropHeight: 0.42,
  pieceScale: 1,
  trayRadius: 132,
  modelBaseUrl: 'https://a7sn.com/mtkyf/yakolak/',
  modelFiles: {
    small: 's.stl',
    medium: 'm.stl',
    large: 'l.stl'
  }
};

export const PLAYER_COLORS = [
  0xd37c00,
  0x637b69,
  0xb35a5a,
  0x3d5a80
];

export const SIZE_DATA = {
  small: { label: 'S', rank: 0, radius: 7, tube: 1.2 },
  medium: { label: 'M', rank: 1, radius: 11, tube: 1.4 },
  large: { label: 'L', rank: 2, radius: 15, tube: 1.6 }
};

export const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];
