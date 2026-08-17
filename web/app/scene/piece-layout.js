export const PIECE_SIZES = Object.freeze(['small', 'medium', 'large']);
export const PIECE_COLOR_IDS = Object.freeze(['marble', 'blue', 'gold', 'green']);
export const PIECE_COPIES_PER_SIZE_PER_COLOR = 3;
export const PIECE_INSTANCES_PER_SIZE = 12;
export const PIECE_TOTAL_INSTANCES = 36;

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function freezeCenter(center, label) {
  if (!Array.isArray(center) || center.length !== 3 || center.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`${label} must be one finite XYZ center`);
  }
  return Object.freeze([...center]);
}

function validateContract(worldLayout, approvedContract) {
  const rules = approvedContract?.rules;
  if (!worldLayout?.identities || !worldLayout?.homeStacks || !Array.isArray(worldLayout?.zones)) {
    throw new TypeError('Pieces require authoritative world-layout identities, homeStacks and zones');
  }
  if (!sameArray(rules?.sizes, PIECE_SIZES)) throw new Error('Canonical piece-size order drift');
  if (!sameArray(rules?.colors, PIECE_COLOR_IDS)) throw new Error('Canonical piece-color IDs drift');
  if (rules?.copiesPerSizePerColor !== PIECE_COPIES_PER_SIZE_PER_COLOR) throw new Error('Canonical piece copy count drift');
  if (rules?.totalPieces !== PIECE_TOTAL_INSTANCES) throw new Error('Canonical total piece count drift');
  if (!Array.isArray(worldLayout.turnRing) || worldLayout.turnRing.length !== PIECE_COLOR_IDS.length) {
    throw new Error('Canonical physical seat ring drift');
  }
  if (!sameArray(worldLayout.pieceRotationDegrees, [-90, 0, 0])) throw new Error('Canonical piece rotation drift');

  const seenColors = new Set();
  for (const seatId of worldLayout.turnRing) {
    const colorId = worldLayout.identities[seatId];
    if (!PIECE_COLOR_IDS.includes(colorId) || seenColors.has(colorId)) throw new Error(`Invalid canonical piece color for ${seatId}`);
    seenColors.add(colorId);
    if (!Array.isArray(worldLayout.homeStacks[seatId]) || worldLayout.homeStacks[seatId].length !== PIECE_COPIES_PER_SIZE_PER_COLOR) {
      throw new Error(`Canonical home-stack count drift for ${seatId}`);
    }
    worldLayout.homeStacks[seatId].forEach((center, stackIndex) => freezeCenter(center, `${seatId} home stack ${stackIndex}`));
  }

  if (worldLayout.zones.length !== 9) throw new Error('Canonical board zone count drift');
  const zoneIds = new Set();
  for (const zone of worldLayout.zones) {
    if (!Number.isInteger(zone?.id) || zone.id < 0 || zone.id > 8 || zoneIds.has(zone.id)) throw new Error('Canonical board zone IDs drift');
    zoneIds.add(zone.id);
    freezeCenter(zone.position, `board zone ${zone.id}`);
  }
}

function pieceId(colorId, size, copyIndex) {
  return `piece:${colorId}:${size}:${copyIndex + 1}`;
}

export function createLogicalPieceCatalog({ worldLayout, approvedContract } = {}) {
  validateContract(worldLayout, approvedContract);

  const pieces = [];
  const byId = new Map();
  const zoneById = new Map(worldLayout.zones.map((zone) => [zone.id, freezeCenter(zone.position, `board zone ${zone.id}`)]));

  // Logical identity is derived only from canonical color, size and physical copy number.
  // Mesh grouping, mesh object identity and instance index are deliberately absent here.
  for (const size of PIECE_SIZES) {
    for (const seatId of worldLayout.turnRing) {
      const colorId = worldLayout.identities[seatId];
      for (let copyIndex = 0; copyIndex < PIECE_COPIES_PER_SIZE_PER_COLOR; copyIndex += 1) {
        const id = pieceId(colorId, size, copyIndex);
        const homeCenter = freezeCenter(worldLayout.homeStacks[seatId][copyIndex], `${id} home`);
        const piece = Object.freeze({
          id,
          colorId,
          size,
          copyIndex,
          homeSeatId: seatId,
          homeStackIndex: copyIndex,
          homeCenter,
        });
        if (byId.has(id)) throw new Error(`Duplicate logical piece ID ${id}`);
        byId.set(id, piece);
        pieces.push(piece);
      }
    }
  }

  if (pieces.length !== PIECE_TOTAL_INSTANCES || byId.size !== PIECE_TOTAL_INSTANCES) {
    throw new Error(`Expected exactly ${PIECE_TOTAL_INSTANCES} stable logical pieces`);
  }
  for (const size of PIECE_SIZES) {
    if (pieces.filter((piece) => piece.size === size).length !== PIECE_INSTANCES_PER_SIZE) {
      throw new Error(`Expected exactly ${PIECE_INSTANCES_PER_SIZE} logical ${size} pieces`);
    }
  }

  const frozenPieces = Object.freeze(pieces);
  return Object.freeze({
    pieces: frozenPieces,
    pieceIds: Object.freeze(frozenPieces.map((piece) => piece.id)),
    rotationDegrees: Object.freeze([...worldLayout.pieceRotationDegrees]),
    getPiece(id) {
      return byId.get(id) || null;
    },
    getHomeDestination(id) {
      const piece = byId.get(id);
      if (!piece) throw new TypeError(`Unknown logical piece ${id}`);
      return Object.freeze({
        kind: 'home',
        seatId: piece.homeSeatId,
        stackIndex: piece.homeStackIndex,
        center: piece.homeCenter,
      });
    },
    getBoardDestination(cellId) {
      const center = zoneById.get(cellId);
      if (!center) throw new RangeError(`Unknown board cell ${cellId}`);
      return Object.freeze({ kind: 'board', cellId, center });
    },
  });
}
