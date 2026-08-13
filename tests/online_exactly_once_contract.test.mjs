import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __testing } from '../api/rooms.js';

const {
  applyMove,
  createState,
  joinState,
  mutationApplied,
  publicRoom,
  recordMutation,
  validMutationId,
} = __testing;

const hardened = fs.readFileSync(new URL('../scripts/online_session_hardened.gd', import.meta.url), 'utf8');
const turnHud = fs.readFileSync(new URL('../scripts/turn_clarity_hud.gd', import.meta.url), 'utf8');

function room() {
  return joinState(createState('marble', 2, 3), 'p2', 'blue');
}

const mutationId = 'a'.repeat(48);
assert.equal(validMutationId(mutationId), true);
assert.equal(validMutationId('short'), false);

// The receipt lives in authoritative room state across later turns, while never
// leaking into the public room payload. This is what makes a response-lost move
// recognizable even after another player's lastMove replaced it.
{
  let state = room();
  state = applyMove(state, 'p1', { cell: 0, size: 'small' });
  state = recordMutation(state, 'p1', 'move', mutationId);
  assert.equal(mutationApplied(state, 'p1', 'move', mutationId), true);

  state = applyMove(state, 'p2', { cell: 8, size: 'large' });
  assert.equal(state.lastMove?.seat, 'p2');
  assert.equal(mutationApplied(state, 'p1', 'move', mutationId), true);

  const row = { room_code: '42', version: 4, state_json: JSON.stringify(state) };
  const visible = publicRoom(row, state);
  assert.equal(Object.hasOwn(visible, '_mutations'), false);
  assert.equal(visible.moveNumber, 2);
}

// Recording the same operation twice is itself idempotent.
{
  const state = room();
  const once = recordMutation(state, 'p1', 'move', mutationId);
  const twice = recordMutation(once, 'p1', 'move', mutationId);
  assert.equal(twice._mutations.length, 1);
}

// Every new client intent gets a stable operation id. Retries preserve the
// original payload/version; stale intents are never rebased onto a later turn.
const submitMove = hardened.match(/func submit_move[\s\S]*?\n\nfunc request_rematch/)?.[0] || '';
assert.ok(submitMove.includes('"mutationId": _new_secret(24)'), 'moves must carry a random stable mutation id');

const rematch = hardened.match(/func request_rematch[\s\S]*?\n\nfunc deactivate/)?.[0] || '';
assert.ok(rematch.includes('"mutationId": _new_secret(24)'), 'rematch votes must carry a random stable mutation id');

const reconcile = hardened.match(/func _reconcile_pending_mutation[\s\S]*?\n\nfunc _clear_queued_action/)?.[0] || '';
assert.ok(reconcile.includes('pending_mutation_payload.duplicate(true)'), 'retry must reuse the original mutation payload');
assert.ok(!reconcile.includes('payload["version"] = int(room.get'), 'retry must never rebase a stale mutation to the latest version');

const flush = hardened.match(/func _flush_queued_action[\s\S]*?\n\nfunc _reconcile_pending_mutation/)?.[0] || '';
assert.ok(!flush.includes('payload["version"] = int(room.get'), 'queued actions must keep the version captured when the user acted');

const prioritized = hardened.match(/func _queue_or_send[\s\S]*?\n\nfunc _enqueue_action/)?.[0] || '';
assert.ok(prioritized.includes('kind == "move" and inflight_kind == "move"'), 'repeated taps must not queue a second move for one turn');
assert.ok(prioritized.includes('kind == "rematch" and inflight_kind == "rematch"'), 'repeated rematch taps must not queue duplicate votes');

const failures = hardened.match(/func _handle_request_failure[\s\S]*?\n\nfunc _accept_room/)?.[0] || '';
assert.ok(failures.includes('error_code == "version_conflict"'), 'stale mutation conflicts need explicit handling');
assert.ok(failures.includes('_clear_pending_mutation()'), 'a rejected stale intent must be discarded instead of retried on a future turn');

// UX-TURN-38: remote identity is the accepted authoritative room seat. The
// compact indicator may use color only as a supporting cue and must remain
// monotonic so stale camera/light/tween work cannot repaint an older opponent.
assert.ok(turnHud.includes('func _remote_player_number(snapshot: Dictionary)'), 'remote player identity must have one resolver');
assert.ok(turnHud.includes('seat.begins_with("p")'), 'remote player label must prefer the stable authoritative seat');
assert.ok(turnHud.includes('indicator_emphasis_key = "remote-authoritative-owner"'), 'remote turn needs a distinct owner emphasis state');
assert.ok(turnHud.includes("yakolakTurnIndicatorRemoteOwnerSource='authoritative-seat'"), 'web contract must expose authoritative-seat ownership');
assert.ok(turnHud.includes("yakolakTurnIndicatorRemoteColorRole='supporting-cue'"), 'seat color must remain a supporting cue');
assert.ok(turnHud.includes('if revision >= 0 and revision <= applied_revision:'), 'older presentation callbacks must be rejected by revision');
assert.ok(!turnHud.includes('func _process('), 'turn indicator must not poll camera/light/tween state');

const remoteNumber = snapshot => {
  const seat = String(snapshot.seat || '').trim().toLowerCase();
  const match = /^p([1-9][0-9]*)$/.exec(seat);
  return match ? Number(match[1]) : Number(snapshot.player_number || 0);
};
const applyRemote = (state, snapshot) => {
  if (snapshot.revision <= state.revision) return state;
  const player = remoteNumber(snapshot);
  return { revision: snapshot.revision, updates: state.updates + 1, player, seat: snapshot.seat, text: `دور لاعب ${player}` };
};
for (const playerCount of [3, 4]) {
  let visible = { revision: 0, updates: 0, player: 0, seat: '', text: '' };
  let revision = 1;
  for (let player = 2; player <= playerCount; player += 1) {
    const before = visible.updates;
    visible = applyRemote(visible, { revision, seat: `p${player}`, player_number: player });
    assert.equal(visible.updates, before + 1, `${playerCount}p P${player} must change visible owner exactly once`);
    assert.equal(visible.player, player, `${playerCount}p P${player} identity must match authoritative seat`);
    assert.equal(visible.text, `دور لاعب ${player}`, `${playerCount}p P${player} must be explicit`);
    assert.doesNotMatch(visible.text, /[٠-٩۰-۹]/, `${playerCount}p P${player} must use Western digits`);
    revision += 1;
  }
  const settled = visible;
  visible = applyRemote(visible, { revision: settled.revision - 1, seat: 'p2', player_number: 2 });
  assert.deepEqual(visible, settled, `${playerCount}p stale camera/light/tween callback cannot overwrite the remote owner`);
}
assert.equal(remoteNumber({ seat: 'p4', player_number: 2 }), 4, 'authoritative seat must beat array-derived player number');

console.log('YAKOLAK_ONLINE_EXACTLY_ONCE_CONTRACT_OK');
