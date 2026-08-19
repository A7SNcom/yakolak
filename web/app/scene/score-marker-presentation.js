import { assertCanonicalSessionState } from '../session/canonical-session-state.js';
import { CANONICAL_CONFIGURED_SEAT_RING } from '../shared/seat-order.js';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireScoreInstances(instances) {
  if (!instances || typeof instances.setScores !== 'function' || typeof instances.snapshot !== 'function') {
    fail('invalid_score_marker_instances');
  }
  if (!Array.isArray(instances.records)) fail('invalid_score_marker_records');
  return instances;
}

function recordBySeat(instances) {
  const records = new Map();
  for (const record of instances.records) {
    if (!record || typeof record.seatId !== 'string' || typeof record.colorId !== 'string') {
      fail('invalid_score_marker_record');
    }
    if (records.has(record.seatId)) fail('duplicate_score_marker_seat');
    records.set(record.seatId, record);
  }
  return records;
}

export function derivePersistentScoreMarkerState(state) {
  assertCanonicalSessionState(state);
  const configuredBySeat = new Map(state.seats.map(seat => [seat.seatId, seat]));
  const markers = CANONICAL_CONFIGURED_SEAT_RING.map(slot => {
    const configured = configuredBySeat.get(slot.seatId);
    const count = configured ? state.scores[slot.seatId] : 0;
    if (!Number.isInteger(count) || count < 0) fail('invalid_authoritative_score');
    return {
      seatId: slot.seatId,
      colorId: slot.color,
      count,
      configured: Boolean(configured),
    };
  });

  return deepFreeze({
    revision: state.revision,
    lobbyGeneration: state.lobbyGeneration,
    round: state.round,
    roundEndRevision: state.roundEndRevision,
    countsByColor: Object.fromEntries(markers.map(marker => [marker.colorId, marker.count])),
    countsBySeat: Object.fromEntries(markers.map(marker => [marker.seatId, marker.count])),
    markers,
  });
}

export function syncPersistentScoreMarkerInstances(instances, state) {
  const target = requireScoreInstances(instances);
  const presentation = derivePersistentScoreMarkerState(state);
  const records = recordBySeat(target);

  if (records.size !== CANONICAL_CONFIGURED_SEAT_RING.length) fail('score_marker_seat_set_mismatch');
  for (const marker of presentation.markers) {
    const record = records.get(marker.seatId);
    if (!record) fail('score_marker_seat_set_mismatch');
    if (record.colorId !== marker.colorId) fail('score_marker_color_binding_mismatch');
    const capacity = Array.isArray(record.slots) ? record.slots.length : Number(record.mesh?.userData?.capacity);
    if (!Number.isInteger(capacity) || capacity < 0) fail('invalid_score_marker_capacity');
    if (marker.count > capacity) fail('authoritative_score_exceeds_marker_capacity');
  }

  target.setScores(presentation.countsByColor);
  const snapshot = target.snapshot();
  const renderedCounts = new Map((snapshot?.seats || []).map(entry => [entry.seatId, entry.count]));
  for (const marker of presentation.markers) {
    if (renderedCounts.get(marker.seatId) !== marker.count) fail('score_marker_sync_mismatch');
  }

  return deepFreeze({
    ...presentation,
    renderedCountsBySeat: Object.fromEntries(presentation.markers.map(marker => [
      marker.seatId,
      renderedCounts.get(marker.seatId),
    ])),
  });
}

// Rebuild is intentionally stateless: a newly created GPU instance bundle must be
// populated from a supplied canonical snapshot. No presentation-side score cache
// is allowed to become a second authority after hydration/context restoration.
export function rebuildPersistentScoreMarkerInstances(instances, canonicalSnapshot) {
  return syncPersistentScoreMarkerInstances(instances, canonicalSnapshot);
}
