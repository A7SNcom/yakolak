import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __testing } from '../api/rooms.js';

const { applyMove, createState, joinState, rematchState } = __testing;
const gameplay = fs.readFileSync(new URL('../scripts/gameplay_rematch_lifecycle.gd', import.meta.url), 'utf8');

function completedOnlineMatch() {
  let state = joinState(createState('marble', 2, 1), 'p2', 'blue');
  state = applyMove(state, 'p1', { cell: 0, size: 'small' });
  state = applyMove(state, 'p2', { cell: 3, size: 'large' });
  state = applyMove(state, 'p1', { cell: 1, size: 'small' });
  state = applyMove(state, 'p2', { cell: 4, size: 'large' });
  state = applyMove(state, 'p1', { cell: 2, size: 'small' });
  assert.equal(state.status, 'finished');
  assert.equal(state.matchComplete, true);
  return state;
}

// Online rematch remains server-authoritative: one vote cannot reset anything,
// and all required votes produce the same clean session baseline in one state transition.
{
  const finished = completedOnlineMatch();
  const firstVote = rematchState(finished, 'p1');
  assert.equal(firstVote.status, 'finished');
  assert.equal(firstVote.matchComplete, true);
  assert.equal(firstVote.rematch.p1, true);
  assert.equal(firstVote.scores.p1, 1);

  const restarted = rematchState(firstVote, 'p2');
  assert.equal(restarted.status, 'playing');
  assert.equal(restarted.matchComplete, false);
  assert.equal(restarted.round, 1);
  assert.equal(restarted.completedRounds, 0);
  assert.equal(restarted.turnIndex, 0);
  assert.deepEqual(restarted.scores, { p1: 0, p2: 0 });
  assert.equal(restarted.winner, null);
  assert.equal(restarted.matchWinner, null);
  assert.deepEqual(restarted.matchWinners, []);
  assert.equal(restarted.lastMove, null);
  assert.equal(restarted.moveNumber, 0);
  assert.deepEqual(restarted.rematch, { p1: false, p2: false });
  assert.ok(Object.values(restarted.board).every(slots => Object.keys(slots).length === 0));
}

// The gameplay layer must lock the primary action before creating the transport
// intent, so duplicate taps cannot generate a second mutationId/rematch vote.
{
  const roundAction = gameplay.match(/func _on_round_action\(\)[\s\S]*?\n\nfunc _on_post_match_secondary_action/)?.[0] || '';
  const pendingAt = roundAction.indexOf('post_match_action_pending = "rematch"');
  const lockAt = roundAction.indexOf('action_in_progress = true', pendingAt);
  const requestAt = roundAction.indexOf('online.call("request_rematch")', lockAt);
  assert.ok(pendingAt >= 0, 'rematch must claim one post-match action');
  assert.ok(lockAt > pendingAt, 'rematch must lock duplicate taps before transport');
  assert.ok(requestAt > lockAt, 'transport request must occur only after the local idempotency lock');
}

// Online leave/setup is deliberately not exposed until it has an individual,
// non-cancelling room lifecycle. Local setup is the only secondary post-match action.
{
  const secondary = gameplay.match(/func _on_post_match_secondary_action\(\)[\s\S]*?\n\nfunc _on_online_room_changed/)?.[0] || '';
  assert.ok(secondary.includes('if online_active or not round_complete or not match_complete or action_in_progress:'), 'secondary action must reject online matches');
  assert.ok(secondary.includes('_return_to_setup()'), 'local secondary action must use the existing setup lifecycle');
  assert.ok(!secondary.includes('online.call("leave")'), 'unsafe online leave must not be exposed as a post-match action');
}

console.log('YAKOLAK_MATCH_END_ACTIONS_CONTRACT_OK');
