import assert from 'node:assert/strict';

import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  GAMEPLAY_INTENT_SCHEMA,
} from '../web/app/gameplay/gameplay-intent.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';
import { createLocalAuthorityAdapter } from '../web/app/session/local-authority-adapter.js';

const isOnlineSeatType = type => type === 'online-human';
const configured = configuredSeatOrder('marble', 2).map((slot, index) => ({
  seatId: slot.seatId,
  type: index === 0 ? 'human' : 'computer',
  color: slot.color,
  ready: true,
}));

function state() {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats: configured,
    activeSeatId: 'right',
    deadlineAtMs: 20_000,
    revision: 9,
    lifecycle: { phase: 'turn-loop' },
  });
}

function mutableMove(cell) {
  return {
    schema: GAMEPLAY_INTENT_SCHEMA,
    kind: GAMEPLAY_INTENT_KINDS.MOVE,
    origin: GAMEPLAY_INTENT_ORIGINS.HUMAN,
    authority: {
      adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
      seat: 'right',
      revision: 9,
    },
    payload: { cell, size: 'small' },
    presentation: { source: GAMEPLAY_PRESENTATION_SOURCES.CLICK },
  };
}

// submit() captures a validated immutable value synchronously. Mutating the caller's
// object after submit cannot alter the queued authority operation.
const captureAuthority = createLocalAuthorityAdapter({
  initialState: state(),
  isOnlineSeatType,
  clock: () => 1_000,
});
const mutable = mutableMove(4);
const pending = captureAuthority.submit(mutable);
mutable.payload.cell = 5;
mutable.authority.seat = 'back';
const captured = await pending;
assert.equal(captured.snapshot.board['4'].small, 'marble');
assert.deepEqual(captured.snapshot.board['5'], {});
assert.equal(captured.snapshot.lastMove.cell, 4);
assert.equal(captured.snapshot.lastMove.seatId, 'right');

// Two queued submissions that both observed revision 9 cannot both commit. The
// first produces revision 10; the second is stale when it reaches authority.
const queueAuthority = createLocalAuthorityAdapter({
  initialState: state(),
  isOnlineSeatType,
  clock: () => 1_000,
});
const first = queueAuthority.submit(mutableMove(0));
const second = queueAuthority.submit(mutableMove(1));
const firstResult = await first;
assert.equal(firstResult.revision, 10);
await assert.rejects(second, error => error.code === 'stale_local_authority_revision');
const queuedSnapshot = await queueAuthority.snapshot();
assert.equal(queuedSnapshot.revision, 10);
assert.equal(queuedSnapshot.board['0'].small, 'marble');
assert.deepEqual(queuedSnapshot.board['1'], {});

console.log('THREEJS-057 local authority queue/capture contract: PASS');
