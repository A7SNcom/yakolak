export const DEFAULT_ALIGNMENT = {
  version: "yaklak_transform_controls_v005",
  note: "9.stl is the real board. 3.stl is the player tray. Calibration uses Three.js TransformControls.",

  models: {
    board: { path: "./9.stl", fit: 150, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, yOffset: 0 },
    rack: { path: "./3.stl", fit: 72, rx: 90, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, yOffset: 0 },
    small: { path: "./s.stl", fit: 16, rx: 90, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, yOffset: 0 },
    medium: { path: "./m.stl", fit: 22, rx: 90, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, yOffset: 0 },
    large: { path: "./l.stl", fit: 28, rx: 90, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, yOffset: 0 }
  },

  board: {
    transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
    cellRadius: 13.5,
    snapYOffset: 4.2,
    stackGap: 3.2,
    cells: [
      { x: -47.259, y: 2.8, z: 47.583 }, { x: 0.529, y: 2.8, z: 47.583 }, { x: 48.318, y: 2.8, z: 47.583 },
      { x: -47.259, y: 2.8, z: 0.124 }, { x: 0.529, y: 2.8, z: 0.124 }, { x: 48.318, y: 2.8, z: 0.124 },
      { x: -47.259, y: 2.8, z: -47.335 }, { x: 0.529, y: 2.8, z: -47.335 }, { x: 48.318, y: 2.8, z: -47.335 }
    ]
  },

  players: [
    { id: 0, label: "south", color: 0x4f7f67 },
    { id: 1, label: "north", color: 0x8f6c2f },
    { id: 2, label: "west", color: 0x4d668f },
    { id: 3, label: "east", color: 0x8b5a5a }
  ],

  racks: [
    { x: 0, y: 0.2, z: 96, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
    { x: 0, y: 0.2, z: -96, rx: 0, ry: 180, rz: 0, sx: 1, sy: 1, sz: 1 },
    { x: -96, y: 0.2, z: 0, rx: 0, ry: 90, rz: 0, sx: 1, sy: 1, sz: 1 },
    { x: 96, y: 0.2, z: 0, rx: 0, ry: -90, rz: 0, sx: 1, sy: 1, sz: 1 }
  ],

  rackHomes: [
    [{ x: -23.5, y: 0.9, z: 0 }, { x: 0, y: 0.9, z: 0 }, { x: 23.5, y: 0.9, z: 0 }],
    [{ x: -23.5, y: 0.9, z: 0 }, { x: 0, y: 0.9, z: 0 }, { x: 23.5, y: 0.9, z: 0 }],
    [{ x: -23.5, y: 0.9, z: 0 }, { x: 0, y: 0.9, z: 0 }, { x: 23.5, y: 0.9, z: 0 }],
    [{ x: -23.5, y: 0.9, z: 0 }, { x: 0, y: 0.9, z: 0 }, { x: 23.5, y: 0.9, z: 0 }]
  ],

  pieceOffsets: {
    large: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
    medium: { x: 0, y: 2.8, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
    small: { x: 0, y: 5.6, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 }
  }
};

export function cloneAlignment() {
  return JSON.parse(JSON.stringify(DEFAULT_ALIGNMENT));
}
