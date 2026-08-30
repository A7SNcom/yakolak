import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __testing } from '../api/rooms.js';

const { applyMove, createState, joinState, leaveState, rematchState } = __testing;
const gameplay = fs.readFileSync(new URL('../scripts/gameplay_rematch_lifecycle.gd', import.meta.url), 'utf8');
const gameplayUi = fs.readFileSync(new URL('../scripts/gameplay_session_ui.gd', import.meta.url), 'utf8');
const roomsSource = fs.readFileSync(new URL('../api/rooms.js', import.meta.url), 'utf8');

function completedOnlineMatch() {
  let state = joinState(createState('marble', 2, 3), 'p2', 'blue');
  state = { ...state, scores: { ...state.scores, p1: 2 } };
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
  assert.equal(firstVote.scores.p1, 3);

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

// A final-match leave detaches only the departing client. The authoritative
// result remains readable, and a vote made before leaving cannot restart a
// ghost match after the other player votes.
{
  const finished = completedOnlineMatch();
  const voted = rematchState(finished, 'p1');
  const detached = leaveState(voted, 'p1');
  assert.equal(detached.status, 'finished');
  assert.equal(detached.matchComplete, true);
  assert.equal(detached.cancelledBy, null);
  assert.deepEqual(detached.players, finished.players);
  assert.equal(detached.rematch.p1, false);
  const remainingVote = rematchState(detached, 'p2');
  assert.equal(remainingVote.status, 'finished');
  assert.equal(remainingVote.rematch.p1, false);
  assert.equal(remainingVote.rematch.p2, true);

  const active = joinState(createState('marble', 2, 3), 'p2', 'blue');
  assert.equal(leaveState(active, 'p1').status, 'cancelled', 'active-match exit keeps cancellation semantics');
}

// Both the explicit post-match return and the existing quick-menu Exit converge
// on _return_to_setup(). At final online match end that path now uses terminal
// detach; auth is retained for the historical seat mapping so the peer can poll.
{
  const secondary = gameplay.match(/func _on_post_match_secondary_action\(\)[\s\S]*?\n\nfunc _on_online_room_changed/)?.[0] || '';
  assert.ok(gameplay.includes('post_match_secondary_button.visible = true'), 'completed online match exposes return to setup');
  assert.ok(secondary.includes('if not round_complete or not match_complete or action_in_progress:'), 'secondary action accepts completed online matches');
  assert.ok(secondary.includes('_return_to_setup()'), 'secondary action uses the existing setup lifecycle');
  const quickExit = gameplayUi.match(/func _quick_exit\(\)[\s\S]*?\n\nfunc _quick_round_action/)?.[0] || '';
  assert.ok(quickExit.includes('_return_to_setup()'), 'quick Exit converges on the same safe detach path');
  assert.ok(roomsSource.includes("const terminalMatchLeave = action === 'leave' && state.status === 'finished' && state.matchComplete;"), 'handler recognizes terminal match detach');
  assert.ok(roomsSource.includes("action === 'leave' && !terminalMatchLeave"), 'terminal detach retains auth required by historical seat ownership');
}

console.log('YAKOLAK_MATCH_END_ACTIONS_CONTRACT_OK');
