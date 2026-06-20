export const DEFAULT_ALIGNMENT = {
  version: "yaklak_smart_calibration_v004",
  note: "Smart calibration for board, board cells, flat 3.stl trays, tray home positions, piece offsets, and model transforms.",

  board: {
    transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
    base: { width: 126, depth: 126, height: 8, rimWidth: 142, rimDepth: 142, rimHeight: 4 },
    cellRadius: 13.5,
    snapYOffset: 4.2,
    stackGap: 3.2,
    cells: [
      { x: -47.259, y: 2.8, z: 47.583 },
      { x: 0.5295, y: 2.8, z: 47.583 },
      { x: 48.318, y: 2.8, z: 47.583 },
      { x: -47.259, y: 2.8, z: 0.124 },
      { x: 0.5295, y: 2.8, z: 0.124 },
      { x: 48.318, y: 2.8, z: 0.124 },
      { x: -47.259, y: 2.8, z: -47.335 },
      { x: 0.5295, y: 2.8, z: -47.335 },
      { x: 48.318, y: 2.8, z: -47.335 }
    ]
  },

  models: {
    rack: { path: "./3.stl", fit: 72, rx: 90, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, yOffset: 0 },
    small: { path: "./s.stl", fit: 16, rx: 90, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, yOffset: 0 },
    medium: { path: "./m.stl", fit: 22, rx: 90, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, yOffset: 0 },
    large: { path: "./l.stl", fit: 28, rx: 90, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, yOffset: 0 }
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
    [ { x: -23.5, y: 0.9, z: 0 }, { x: 0, y: 0.9, z: 0 }, { x: 23.5, y: 0.9, z: 0 } ],
    [ { x: -23.5, y: 0.9, z: 0 }, { x: 0, y: 0.9, z: 0 }, { x: 23.5, y: 0.9, z: 0 } ],
    [ { x: -23.5, y: 0.9, z: 0 }, { x: 0, y: 0.9, z: 0 }, { x: 23.5, y: 0.9, z: 0 } ],
    [ { x: -23.5, y: 0.9, z: 0 }, { x: 0, y: 0.9, z: 0 }, { x: 23.5, y: 0.9, z: 0 } ]
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
