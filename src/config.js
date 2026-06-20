export const DEFAULT_ALIGNMENT = {
  version: "yaklak_rack_alignment_v001",
  note: "4 player racks use 3.stl. Each player starts with 9 pieces arranged on the rack.",

  board: {
    cell1: { x: -47.259, y: 2.8, z: 47.583 },
    cell9: { x: 48.318, y: 2.8, z: -47.335 },
    cellRadius: 13.5,
    snapYOffset: 4.2
  },

  models: {
    rack: { path: "./3.stl", fit: 74 },
    small: { path: "./s.stl", fit: 16 },
    medium: { path: "./m.stl", fit: 22 },
    large: { path: "./l.stl", fit: 28 }
  },

  players: [
    { id: 0, label: "south", color: 0x4fa57d },
    { id: 1, label: "north", color: 0xd79a37 },
    { id: 2, label: "west", color: 0x5a89d6 },
    { id: 3, label: "east", color: 0xc96b6b }
  ],

  racks: [
    { x: 0, y: 0, z: 116, rotY: 0 },
    { x: 0, y: 0, z: -116, rotY: 180 },
    { x: -116, y: 0, z: 0, rotY: 90 },
    { x: 116, y: 0, z: 0, rotY: -90 }
  ],

  piecesOnRack: {
    gapX: 18,
    gapZ: 19,
    lift: 1.2,
    rackLift: 0,
    rows: ["large", "medium", "small"]
  }
};

export function cloneAlignment() {
  return JSON.parse(JSON.stringify(DEFAULT_ALIGNMENT));
}
