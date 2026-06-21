// Yakolak Golden State v036
// Archived: 2026-06-21
// Status: golden_locked_do_not_overwrite_without_visual_approval
// أهم قاعدة: لا نعاير كل جهة. المراكز ثابتة. المعايرة الوحيدة هي pPieceGap = 11.

const YAKOLAK_GOLDEN_V036 = {
  version: 'v036-p-gap-11',
  rule: 'Only pPieceGap is adjustable. Board, 3.stl centers, p.stl row centers, and stone distance are fixed.',
  fixed: {
    stoneDistance: 48,
    threeRadius: 135,
    pRadius: 85,
    pPieceGap: 11,
    pRows: 4,
    pInstancesPerRow: 7,
    pTotalInstances: 28
  },
  baseModelsAlignment: {
    '9': { px: 0, py: 6, pz: 0, rx: -90, ry: 0, rz: 0 },
    '3-right': { px: 135, py: 6, pz: 0, rx: -90, ry: 0, rz: 0 },
    '3-left': { px: -135, py: 6, pz: 0, rx: -90, ry: 0, rz: 180 },
    '3-front': { px: 0, py: 6, pz: 135, rx: -90, ry: 0, rz: 90 },
    '3-back': { px: 0, py: 6, pz: -135, rx: -90, ry: 0, rz: -90 }
  },
  pRowsAlignment: {
    'p-front': { px: 0, py: 7, pz: 85, rx: -90, ry: 0, rz: 0, spreadAxis: 'x' },
    'p-back': { px: 0, py: 7, pz: -85, rx: -90, ry: 0, rz: 0, spreadAxis: 'x' },
    'p-right': { px: 85, py: 7, pz: 0, rx: -90, ry: 0, rz: 90, spreadAxis: 'z' },
    'p-left': { px: -85, py: 7, pz: 0, rx: -90, ry: 0, rz: 90, spreadAxis: 'z' }
  },
  pInstanceFormula: {
    sideValues: [-3, -2, -1, 0, 1, 2, 3],
    frontBack: 'px = row.px + side * 11; pz = row.pz',
    rightLeft: 'px = row.px; pz = row.pz + side * 11'
  },
  lms: { px: 0, py: 2, pz: 0, rx: -90, ry: 0, rz: 0 }
};
