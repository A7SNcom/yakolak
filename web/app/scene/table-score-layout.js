const EPSILON = 1e-9;

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function pair(value, label) {
  if (!Array.isArray(value) || value.length < 2) throw new TypeError(`${label} must contain at least two coordinates`);
  return [finiteNumber(value[0], `${label}[0]`), finiteNumber(value[1], `${label}[1]`)];
}

function triple(value, label) {
  if (!Array.isArray(value) || value.length < 3) throw new TypeError(`${label} must contain three coordinates`);
  return [
    finiteNumber(value[0], `${label}[0]`),
    finiteNumber(value[1], `${label}[1]`),
    finiteNumber(value[2], `${label}[2]`),
  ];
}

function freezePoint(point) {
  return Object.freeze([...point]);
}

function nearlyEqual(a, b, epsilon = EPSILON) {
  return Math.abs(a - b) <= epsilon;
}

export function parseAuthoritativeTableFootprint(svgText) {
  if (typeof svgText !== 'string' || !svgText.trim()) throw new TypeError('Authoritative table SVG text is required');

  const pathMatch = svgText.match(/<path\s+d="([^"]+)"/i);
  const matrixMatch = svgText.match(/transform="matrix\(([^)]+)\)"/i);
  if (!pathMatch || !matrixMatch) throw new Error('Authoritative table SVG path or transform is missing');

  const pathData = pathMatch[1].trim();
  const coordinatePattern = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
  const sourcePoints = [...pathData.matchAll(coordinatePattern)].map((match) => [Number(match[1]), Number(match[2])]);
  const unexplained = pathData.replace(coordinatePattern, '').replace(/[MLZ\s]/gi, '');
  if (unexplained) throw new Error(`Unsupported table SVG path syntax: ${unexplained}`);
  if (sourcePoints.length < 3) throw new Error('Authoritative table SVG must contain at least three polygon points');
  if (sourcePoints.length > 1
      && nearlyEqual(sourcePoints[0][0], sourcePoints.at(-1)[0])
      && nearlyEqual(sourcePoints[0][1], sourcePoints.at(-1)[1])) {
    sourcePoints.pop();
  }

  const matrix = matrixMatch[1].trim().split(/[ ,]+/).map(Number);
  if (matrix.length !== 6 || matrix.some((value) => !Number.isFinite(value))) {
    throw new Error('Authoritative table SVG matrix must contain six finite values');
  }
  const [a, b, c, d, e, f] = matrix;
  const transformed = sourcePoints.map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  const xs = transformed.map(([x]) => x);
  const ys = transformed.map(([, y]) => y);
  const bounds = {
    min: [Math.min(...xs), Math.min(...ys)],
    max: [Math.max(...xs), Math.max(...ys)],
  };
  const center = [
    (bounds.min[0] + bounds.max[0]) * 0.5,
    (bounds.min[1] + bounds.max[1]) * 0.5,
  ];
  const centered = transformed.map(([x, y]) => freezePoint([x - center[0], y - center[1]]));

  return Object.freeze({
    matrix: Object.freeze([...matrix]),
    sourcePointCount: sourcePoints.length,
    sourcePoints: Object.freeze(sourcePoints.map(freezePoint)),
    transformedPoints: Object.freeze(transformed.map(freezePoint)),
    centeredPoints: Object.freeze(centered),
    transformedBounds: Object.freeze({ min: freezePoint(bounds.min), max: freezePoint(bounds.max) }),
    transformedCenter: freezePoint(center),
    transformedSpan: freezePoint([bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]]),
  });
}

function authoritativeScorePlaneY(worldLayout) {
  if (!Array.isArray(worldLayout?.zones) || worldLayout.zones.length !== 9) {
    throw new Error('world-layout must provide nine authoritative zones');
  }
  const ys = worldLayout.zones.map((zone, index) => triple(zone.position, `zones[${index}].position`)[1]);
  if (!ys.every((value) => nearlyEqual(value, ys[0]))) throw new Error('Authoritative board zones do not share one score/contact plane');
  return ys[0];
}

export function deriveAuthoritativeScoreLayout(worldLayout) {
  const score = worldLayout?.score;
  if (!score) throw new Error('world-layout.score is required');
  const radius = finiteNumber(score.radius, 'score.radius');
  const gap = finiteNumber(score.gap, 'score.gap');
  if (!(radius > 0) || !(gap > 0)) throw new Error('Score radius and gap must be positive');
  if (!Array.isArray(score.order) || score.order.length === 0) throw new Error('score.order must be a non-empty array');
  const order = score.order.map((value, index) => finiteNumber(value, `score.order[${index}]`));
  if (new Set(order).size !== order.length) throw new Error('score.order must not contain duplicates');

  const seatOrder = Array.isArray(worldLayout.turnRing) ? [...worldLayout.turnRing] : [];
  if (seatOrder.length !== 4 || new Set(seatOrder).size !== 4) throw new Error('world-layout.turnRing must contain four unique seats');
  const scorePlaneY = authoritativeScorePlaneY(worldLayout);
  const seats = [];

  for (const seatId of seatOrder) {
    const base = worldLayout?.bases?.[seatId];
    const colorId = worldLayout?.identities?.[seatId];
    if (!base || typeof colorId !== 'string' || !colorId) throw new Error(`Missing authoritative base/identity for ${seatId}`);
    const [baseX, , baseZ] = triple(base.position, `bases.${seatId}.position`);
    const radialLength = Math.hypot(baseX, baseZ);
    if (radialLength <= EPSILON) throw new Error(`Seat ${seatId} cannot derive a radial score direction from its base position`);
    const radial = [baseX / radialLength, baseZ / radialLength];
    const tangent = [-radial[1], radial[0]];
    const sideCenter = [radial[0] * radius, scorePlaneY, radial[1] * radius];
    const slots = order.map((orderValue, index) => Object.freeze({
      index,
      orderValue,
      position: freezePoint([
        sideCenter[0] + tangent[0] * gap * orderValue,
        scorePlaneY,
        sideCenter[2] + tangent[1] * gap * orderValue,
      ]),
    }));
    seats.push(Object.freeze({
      seatId,
      colorId,
      radial: freezePoint(radial),
      tangent: freezePoint(tangent),
      sideCenter: freezePoint(sideCenter),
      slots: Object.freeze(slots),
    }));
  }

  return Object.freeze({
    radius,
    gap,
    order: Object.freeze(order),
    scorePlaneY,
    seats: Object.freeze(seats),
  });
}

export function deriveScoreMarkerContactPivot(sourceBounds) {
  const min = triple(sourceBounds?.min, 'score marker sourceBounds.min');
  const max = triple(sourceBounds?.max, 'score marker sourceBounds.max');
  if (max.some((value, index) => value < min[index])) throw new Error('Score marker source bounds are inverted');
  return freezePoint([
    (min[0] + max[0]) * 0.5,
    (min[1] + max[1]) * 0.5,
    min[2],
  ]);
}

export function deriveTableGameContactReport({ worldLayout, boardLayout = null } = {}) {
  const tableTopY = finiteNumber(worldLayout?.room?.tableTopY, 'room.tableTopY');
  const declaredGameClearance = finiteNumber(worldLayout?.room?.gameClearance, 'room.gameClearance');
  const declaredGameContactY = tableTopY + declaredGameClearance;
  const boardBottomY = boardLayout?.board?.worldBoundsAtFinal?.min?.[1];
  const measuredBoardGap = Number.isFinite(Number(boardBottomY)) ? Number(boardBottomY) - tableTopY : null;

  return Object.freeze({
    tableTopY,
    declaredGameClearance,
    declaredGameContactY,
    boardBottomY: measuredBoardGap == null ? null : Number(boardBottomY),
    measuredBoardGap,
    declaredClearanceMatchesBoardBounds: measuredBoardGap == null ? null : nearlyEqual(measuredBoardGap, declaredGameClearance),
    hiddenGameOffsetApplied: false,
  });
}
