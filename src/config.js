export const BUILD_ID = 'yakolak-dev-one-point-v1';

export const STORAGE_KEY = 'yakolak.onePointCalibration.v1';

export const DEFAULT_CALIBRATION = {
  origin: { x: 0, y: 0, z: 0 },
  gridStep: 2.25,
  dropHeight: 0.18,
  pieceScale: 1,
  trayRadius: 5.7,
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
  small: { label: 'S', rank: 0, radius: 0.33, tube: 0.055 },
  medium: { label: 'M', rank: 1, radius: 0.55, tube: 0.06 },
  large: { label: 'L', rank: 2, radius: 0.78, tube: 0.065 }
};

export const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];
