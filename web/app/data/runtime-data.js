const SCATTER_HEADER = Object.freeze(['id', 'color', 'side', 'size', 'x', 'y', 'z', 'rx', 'ry', 'rz']);
const SIZE_CODE_TO_ID = Object.freeze({ s: 'small', m: 'medium', l: 'large' });

function finiteNumber(value, label) {
  if (value === null || typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '')) {
    throw new TypeError(`${label} must be finite`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function integer(value, label) {
  if (value === null || typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '')) {
    throw new TypeError(`${label} must be an integer`);
  }
  const number = Number(value);
  if (!Number.isInteger(number)) throw new TypeError(`${label} must be an integer`);
  return number;
}

function finiteVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) throw new TypeError(`${label} must contain exactly ${length} values`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function uniqueStrings(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new TypeError(`${label} must be a non-empty string array`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicate IDs`);
  return [...value];
}

function clonePlain(value, label = 'value') {
  if (Array.isArray(value)) return value.map((entry, index) => clonePlain(entry, `${label}[${index}]`));
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must contain plain JSON data only`);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clonePlain(entry, `${label}.${key}`)]));
  }
  if (['string', 'number', 'boolean'].includes(typeof value) || value == null) return value;
  throw new TypeError(`${label} contains unsupported runtime data`);
}

export function deepFreezeRuntimeData(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreezeRuntimeData(child);
  return Object.freeze(value);
}

function validateNumericTree(value, label) {
  if (typeof value === 'number') {
    finiteNumber(value, label);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNumericTree(entry, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'number' || Array.isArray(entry) || (entry && typeof entry === 'object')) validateNumericTree(entry, `${label}.${key}`);
    }
  }
}

export function parseIntroScatterCsv(csvText, { seatIds, sizeIds, expectedCount } = {}) {
  if (typeof csvText !== 'string' || !csvText.trim()) throw new TypeError('intro-scatter.csv text is required');
  const lines = csvText.trim().split(/\r?\n/);
  const header = lines.shift()?.split(',').map((entry) => entry.trim()) || [];
  if (header.length !== SCATTER_HEADER.length || header.some((entry, index) => entry !== SCATTER_HEADER[index])) {
    throw new Error(`intro-scatter.csv header drift: expected ${SCATTER_HEADER.join(',')}`);
  }

  const allowedSeats = new Set(uniqueStrings(seatIds, 'scatter seatIds'));
  const allowedSizes = new Set(uniqueStrings(sizeIds, 'scatter sizeIds'));
  const rows = [];
  const seenIds = new Set();
  const seenSlots = new Set();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex].trim();
    if (!raw) continue;
    const columns = raw.split(',').map((entry) => entry.trim());
    if (columns.length !== SCATTER_HEADER.length) throw new Error(`intro-scatter.csv row ${lineIndex + 2} has ${columns.length} columns`);
    const [idRaw, seatId, sideRaw, sizeCode, x, y, z, rx, ry, rz] = columns;
    const id = integer(idRaw, `intro-scatter row ${lineIndex + 2} id`);
    if (seenIds.has(id)) throw new Error(`Duplicate intro-scatter ID ${id}`);
    seenIds.add(id);
    if (!allowedSeats.has(seatId)) throw new Error(`Unknown intro-scatter seat ${seatId}`);
    const side = integer(sideRaw, `intro-scatter ${id} side`);
    if (![-1, 0, 1].includes(side)) throw new Error(`intro-scatter ${id} side must be -1, 0 or 1`);
    const size = SIZE_CODE_TO_ID[sizeCode];
    if (!size || !allowedSizes.has(size)) throw new Error(`Unknown intro-scatter size code ${sizeCode}`);
    const slotKey = `${seatId}:${side}:${size}`;
    if (seenSlots.has(slotKey)) throw new Error(`Duplicate intro-scatter logical slot ${slotKey}`);
    seenSlots.add(slotKey);
    rows.push({
      id,
      seatId,
      side,
      size,
      sizeCode,
      logicalSlotId: `intro:${seatId}:${side}:${size}`,
      position: [finiteNumber(x, `${slotKey}.x`), finiteNumber(y, `${slotKey}.y`), finiteNumber(z, `${slotKey}.z`)],
      rotationDegrees: [finiteNumber(rx, `${slotKey}.rx`), finiteNumber(ry, `${slotKey}.ry`), finiteNumber(rz, `${slotKey}.rz`)],
    });
  }

  rows.sort((a, b) => a.id - b.id);
  if (rows.length !== expectedCount) throw new Error(`intro-scatter.csv must contain exactly ${expectedCount} starts; found ${rows.length}`);
  rows.forEach((row, index) => {
    if (row.id !== index) throw new Error(`intro-scatter IDs must be contiguous 0..${expectedCount - 1}; missing ${index}`);
  });
  const expectedSlots = allowedSeats.size * 3 * allowedSizes.size;
  if (seenSlots.size !== expectedSlots || rows.length !== expectedSlots) {
    throw new Error(`intro-scatter must cover every seat × side × size exactly once (${expectedSlots})`);
  }
  return rows;
}

function validateWorldLayout(worldLayout, approvedContract) {
  if (!worldLayout || typeof worldLayout !== 'object') throw new TypeError('world-layout.json data is required');
  if (!approvedContract || typeof approvedContract !== 'object') throw new TypeError('approved-contract.json data is required');
  if (approvedContract.status !== 'definitive') throw new Error('Approved contract must be definitive');
  if (worldLayout.units !== approvedContract.units) throw new Error('world-layout and approved-contract units drift');

  const seatIds = uniqueStrings(worldLayout.turnRing, 'world-layout.turnRing');
  const colorIds = uniqueStrings(approvedContract.rules?.colors, 'approved-contract.rules.colors');
  const sizeIds = uniqueStrings(approvedContract.rules?.sizes, 'approved-contract.rules.sizes');
  const identityColors = seatIds.map((seatId) => worldLayout.identities?.[seatId]);
  if (identityColors.some((colorId) => !colorIds.includes(colorId)) || new Set(identityColors).size !== colorIds.length) {
    throw new Error('world-layout identities must map seats one-to-one onto canonical playable colors');
  }
  if (JSON.stringify(identityColors) !== JSON.stringify(approvedContract.rules.turnRing)) {
    throw new Error('Physical turn ring and approved playable-color turn ring drift');
  }
  const introColorOrder = uniqueStrings(approvedContract.rules.introOrder, 'approved-contract.rules.introOrder');
  const introSeatOrder = uniqueStrings(worldLayout.introOrder, 'world-layout.introOrder');
  if (JSON.stringify(introSeatOrder.map((seatId) => worldLayout.identities[seatId])) !== JSON.stringify(introColorOrder)) {
    throw new Error('Physical intro order and approved playable-color intro order drift');
  }

  if (!Array.isArray(worldLayout.zones) || worldLayout.zones.length === 0) throw new Error('world-layout.zones is required');
  const zoneIds = new Set();
  const cells = worldLayout.zones.map((zone, index) => {
    const id = integer(zone?.id, `zones[${index}].id`);
    if (zoneIds.has(id)) throw new Error(`Duplicate board cell ID ${id}`);
    zoneIds.add(id);
    return { id, position: finiteVector(zone.position, 3, `zones[${index}].position`) };
  }).sort((a, b) => a.id - b.id);
  cells.forEach((cell, index) => {
    if (cell.id !== index) throw new Error(`Board cell IDs must be contiguous from 0; missing ${index}`);
  });

  const bases = {};
  const homeStacks = {};
  for (const seatId of seatIds) {
    const base = worldLayout.bases?.[seatId];
    bases[seatId] = {
      position: finiteVector(base?.position, 3, `bases.${seatId}.position`),
      rotationDegrees: finiteVector(base?.rotationDegrees, 3, `bases.${seatId}.rotationDegrees`),
    };
    const stacks = worldLayout.homeStacks?.[seatId];
    if (!Array.isArray(stacks) || stacks.length !== approvedContract.rules.copiesPerSizePerColor) {
      throw new Error(`homeStacks.${seatId} must contain exactly ${approvedContract.rules.copiesPerSizePerColor} centers`);
    }
    homeStacks[seatId] = stacks.map((center, index) => finiteVector(center, 3, `homeStacks.${seatId}[${index}]`));
  }

  const score = worldLayout.score;
  if (!score) throw new Error('world-layout.score is required');
  const scoreOrder = score.order?.map((value, index) => finiteNumber(value, `score.order[${index}]`));
  if (!Array.isArray(scoreOrder) || scoreOrder.length === 0 || new Set(scoreOrder).size !== scoreOrder.length) throw new Error('score.order must be unique and non-empty');

  const room = clonePlain(worldLayout.room, 'room');
  for (const [key, value] of Object.entries(room)) finiteNumber(value, `room.${key}`);
  if (!(room.minX < room.maxX && room.floorY < room.ceilingY && room.backZ < room.frontZ)) throw new Error('Room bounds are malformed');

  const cameras = {};
  const cameraEntries = Object.entries(worldLayout.cameras || {});
  if (cameraEntries.length === 0) throw new Error('world-layout.cameras is required');
  for (const [cameraId, camera] of cameraEntries) {
    cameras[cameraId] = {
      position: finiteVector(camera.position, 3, `cameras.${cameraId}.position`),
      target: finiteVector(camera.target, 3, `cameras.${cameraId}.target`),
      fov: finiteNumber(camera.fov, `cameras.${cameraId}.fov`),
    };
    if (!(cameras[cameraId].fov > 0 && cameras[cameraId].fov < 180)) throw new Error(`cameras.${cameraId}.fov is malformed`);
  }

  const expectedPieces = colorIds.length * sizeIds.length * approvedContract.rules.copiesPerSizePerColor;
  if (approvedContract.rules.totalPieces !== expectedPieces) throw new Error(`approved totalPieces drift: expected ${expectedPieces}`);
  validateNumericTree(approvedContract.motion, 'motion');
  validateNumericTree(approvedContract.network, 'network');

  return {
    seatIds,
    colorIds,
    sizeIds,
    cells,
    bases,
    homeStacks,
    pieceRotationDegrees: finiteVector(worldLayout.pieceRotationDegrees, 3, 'pieceRotationDegrees'),
    score: { radius: finiteNumber(score.radius, 'score.radius'), gap: finiteNumber(score.gap, 'score.gap'), order: scoreOrder },
    room,
    cameras,
    expectedPieces,
  };
}

export function createCanonicalRuntimeData({ worldLayout, introScatterText, approvedContract } = {}) {
  const world = clonePlain(worldLayout, 'worldLayout');
  const contract = clonePlain(approvedContract, 'approvedContract');
  const validated = validateWorldLayout(world, contract);
  const introStarts = parseIntroScatterCsv(introScatterText, {
    seatIds: validated.seatIds,
    sizeIds: validated.sizeIds,
    expectedCount: validated.expectedPieces,
  });

  const data = {
    schemaVersion: 1,
    source: {
      worldLayout: 'data.world-layout',
      introScatter: 'data.intro-scatter',
      approvedContract: 'data.approved-contract',
    },
    units: world.units,
    seats: {
      order: validated.seatIds,
      introOrder: [...world.introOrder],
      identities: clonePlain(world.identities, 'identities'),
      bases: validated.bases,
      homeStacks: validated.homeStacks,
    },
    cells: validated.cells,
    board: clonePlain(world.board, 'board'),
    pieceRotationDegrees: validated.pieceRotationDegrees,
    score: validated.score,
    room: validated.room,
    cameras: validated.cameras,
    rules: clonePlain(contract.rules, 'rules'),
    colorIdentity: clonePlain(contract.colorIdentity, 'colorIdentity'),
    materials: clonePlain(contract.materials, 'materials'),
    motion: clonePlain(contract.motion, 'motion'),
    network: clonePlain(contract.network, 'network'),
    introStarts,
    counts: {
      cells: validated.cells.length,
      seats: validated.seatIds.length,
      homeStacks: Object.values(validated.homeStacks).reduce((sum, stacks) => sum + stacks.length, 0),
      cameras: Object.keys(validated.cameras).length,
      introStarts: introStarts.length,
      pieces: validated.expectedPieces,
    },
  };

  return deepFreezeRuntimeData(data);
}
