const BOARD_CELL_COUNT = 9;

let generation = 0;
let currentBoardCells = null;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function finiteTriple(value, code) {
  if (!Array.isArray(value) || value.length !== 3) fail(code);
  const triple = value.map(Number);
  if (triple.some(number => !Number.isFinite(number))) fail(code);
  return Object.freeze(triple);
}

function normalizeBoardCells(records) {
  if (!Array.isArray(records) || records.length !== BOARD_CELL_COUNT) fail('rendered_board_requires_nine_cells');
  const seen = new Set();
  const normalized = records.map((record, index) => {
    const cellId = Number(record?.cellId);
    if (!Number.isInteger(cellId) || cellId < 0 || cellId >= BOARD_CELL_COUNT || seen.has(cellId)) {
      fail('invalid_rendered_board_cell_id');
    }
    seen.add(cellId);
    return Object.freeze({
      cellId,
      center: finiteTriple(record?.center, `invalid_rendered_board_cell_center_${cellId}`),
    });
  }).sort((left, right) => left.cellId - right.cellId);
  normalized.forEach((record, index) => {
    if (record.cellId !== index) fail('rendered_board_cell_ids_must_be_zero_to_eight');
  });
  return Object.freeze(normalized);
}

export function registerRenderedBoardCellCenters(records) {
  const token = ++generation;
  currentBoardCells = Object.freeze({ token, records: normalizeBoardCells(records) });
  return function releaseRenderedBoardCellCenters() {
    if (currentBoardCells?.token !== token) return false;
    currentBoardCells = null;
    return true;
  };
}

export function readRenderedBoardCellCenters() {
  return currentBoardCells?.records || null;
}
