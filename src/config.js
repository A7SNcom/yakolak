export const DEFAULT_ALIGNMENT = {
  version: "yaklak_rack_alignment_v003_safe",
  note: "Safe config for app-v003. Flat tray attempt with nested piece sets.",

  board: {
    cell1: { x: -47.259, y: 2.8, z: 47.583 },
    cell9: { x: 48.318, y: 2.8, z: -47.335 },
    cellRadius: 13.5,
    snapYOffset: 4.2
  },

  models: {
    rack: { path: "./3.stl", fit: 72, rotateXDeg: 90 },
    small: { path: "./s.stl", fit: 16, rotateXDeg: 90 },
    medium: { path: "./m.stl", fit: 22, rotateXDeg: 90 },
    large: { path: "./l.stl", fit: 28, rotateXDeg: 90 }
  },

  players: [
    { id: 0, label: "south", color: 0x4f7f67 },
    { id: 1, label: "north", color: 0x8f6c2f },
    { id: 2, label: "west", color: 0x4d668f },
    { id: 3, label: "east", color: 0x8b5a5a }
  ],

  racks: [
    { x: 0, y: 0.2, z: 96, rotY: 0 },
    { x: 0, y: 0.2, z: -96, rotY: 180 },
    { x: -96, y: 0.2, z: 0, rotY: 90 },
    { x: 96, y: 0.2, z: 0, rotY: -90 }
  ],

  piecesOnRack: {
    gapX: 23.5,
    gapZ: 2.8,
    centerZ: 0,
    lift: 0.9,
    rackLift: 0,
    sets: 3,
    sizes: ["large", "medium", "small"]
  }
};

export function cloneAlignment() {
  return JSON.parse(JSON.stringify(DEFAULT_ALIGNMENT));
}
