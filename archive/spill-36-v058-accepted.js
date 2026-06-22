// YAKOLAK accepted temporary spilled pieces state
// Version: v058-spill-36-marble-lay
// Branch backup: snapshot/spill-36-v058-accepted
// Status: accepted as current visual baseline, marble still needs recovery from earlier successful texture calibration.

const YAKOLAK_SPILL_36_ACCEPTED_STATE = {
  version: 'v058-spill-36-marble-lay',
  status: 'accepted_temporary_baseline',
  note_ar: 'الوضعية الحالية مقبولة وتوثق كبداية، مع ملاحظة أن الرخامي لم يصل لجودة النسخة السابقة الناجحة.',
  base: { px: 0, py: 6, pz: 0, rx: -90, ry: 0, rz: 0 },
  walls: {
    right: { px: 81, py: 35, pz: 0, rx: -90, ry: -90, rz: 0 },
    left: { px: -81, py: 35, pz: 0, rx: -90, ry: 90, rz: 180 },
    front: { px: 0, py: 35, pz: 81, rx: -180, ry: 0, rz: 90 },
    back: { px: 0, py: 35, pz: -81, rx: -180, ry: 180, rz: -90 }
  },
  config: { seed: 4128, spread: 1.08, height: 0.82, clearance: 1.32 },
  count: 36,
  colors: ['marble', 'gold', 'blue', 'green'],
  rule: '4 colors x 9 pieces; each color has 3 s + 3 m + 3 l',
  runtime_file: 'app-hejaz-v043.js'
};
