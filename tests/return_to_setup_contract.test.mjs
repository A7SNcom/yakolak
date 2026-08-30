import assert from 'node:assert/strict';
import fs from 'node:fs';

const resilient = fs.readFileSync(new URL('../scripts/gameplay_session_resilient.gd', import.meta.url), 'utf8');
const session = fs.readFileSync(new URL('../scripts/gameplay_session.gd', import.meta.url), 'utf8');

const lifecycle = resilient.match(/func _return_to_setup\(\)[\s\S]*?\r?\n\r?\nfunc _publish_return_to_setup_state/)?.[0] || '';
assert.ok(lifecycle.includes('_reset_session_transients()'), 'return must cancel timers/tweens/input transients');
assert.ok(lifecycle.includes('_clean_visual_board()'), 'return must clean the physical board and winner state');
assert.ok(lifecycle.includes('players.clear()') && lifecycle.includes('scores.clear()'), 'return must clear match roster/score state');
assert.ok(lifecycle.includes('online_identity.clear()') && lifecycle.includes('pending_online_configuration.clear()'), 'return must clear gameplay online residue');
assert.ok(lifecycle.includes('_publish_return_to_setup_state()'), 'return must close the browser-facing match lifecycle');

const browserState = resilient.match(/func _publish_return_to_setup_state\(\)[\s\S]*?\r?\n\r?\nfunc _reset_session_transients/)?.[0] || '';
for (const key of ['yakolakMatchState','yakolakCurrentPlayer','yakolakRound','yakolakRoundCount','yakolakWinsToWin','yakolakTurnRemaining','yakolakWinner','yakolakPlayers']) {
  assert.ok(browserState.includes(`'${key}'`), `return must clear stale ${key}`);
}
assert.ok(browserState.includes("d.yakolakGameplay='setup'"), 'gameplay/input state must become setup');
assert.ok(browserState.includes("d.yakolakMoves='0'"), 'move count must be reset');
assert.ok(browserState.includes("d.yakolakSelected=''"), 'selection must be cleared');

const baseReturn = session.match(/func _return_to_setup\(\)[\s\S]*?\r?\n\r?\nfunc _reset_board_for_round/)?.[0] || '';
assert.ok(baseReturn.includes('online.call("deactivate", true)'), 'return must fully deactivate and forget online transport state');
assert.ok(baseReturn.includes('turn_deadline_msec = 0'), 'turn timer must be stopped');
assert.ok(baseReturn.includes('waiting_for_setup = true'), 'editable setup must regain lifecycle ownership');
assert.ok(baseReturn.includes('setup.call_deferred("show_after_intro")'), 'setup must be shown after cleanup');

console.log('YAKOLAK_RETURN_TO_SETUP_CONTRACT_OK');
