import { DEFAULT_CALIBRATION, STORAGE_KEY } from './config.js';

export function cloneCalibration(value = DEFAULT_CALIBRATION) {
  return JSON.parse(JSON.stringify(value));
}

export function loadCalibration() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeCalibration(JSON.parse(saved)) : cloneCalibration();
  } catch {
    return cloneCalibration();
  }
}

export function saveCalibration(calibration) {
  const clean = normalizeCalibration(calibration);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export function resetCalibration() {
  localStorage.removeItem(STORAGE_KEY);
  return cloneCalibration();
}

export function normalizeCalibration(input) {
  const fallback = cloneCalibration();
  const source = input && typeof input === 'object' ? input : {};
  const origin = source.origin && typeof source.origin === 'object' ? source.origin : {};
  return {
    ...fallback,
    ...source,
    origin: {
      x: safeNumber(origin.x, fallback.origin.x),
      y: safeNumber(origin.y, fallback.origin.y),
      z: safeNumber(origin.z, fallback.origin.z)
    },
    gridStep: safeNumber(source.gridStep, fallback.gridStep),
    dropHeight: safeNumber(source.dropHeight, fallback.dropHeight),
    pieceScale: safeNumber(source.pieceScale, fallback.pieceScale),
    trayRadius: safeNumber(source.trayRadius, fallback.trayRadius),
    modelFiles: {
      ...fallback.modelFiles,
      ...(source.modelFiles || {})
    }
  };
}

export function getCellPosition(index, calibration, rank = 0) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const c = normalizeCalibration(calibration);
  return {
    x: c.origin.x + (col - 1) * c.gridStep,
    y: c.origin.y + c.dropHeight + rank * 0.07,
    z: c.origin.z + (row - 1) * c.gridStep
  };
}

export function getAllCellPositions(calibration) {
  return Array.from({ length: 9 }, (_, index) => getCellPosition(index, calibration, 0));
}

export function getCalibrationExport(calibration) {
  return JSON.stringify(normalizeCalibration(calibration), null, 2);
}

function safeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
