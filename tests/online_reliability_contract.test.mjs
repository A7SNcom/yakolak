import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scripts/online_session.gd', import.meta.url), 'utf8');

const required = [
  ['queued actions', 'queued_action_kind'],
  ['request timeout', 'REQUEST_TIMEOUT_MS'],
  ['browser abort controller', 'AbortController'],
  ['request ids', 'active_request_id'],
  ['reconnect backoff', '_retry_delay_ms'],
  ['authoritative reconciliation', '_reconcile_pending_mutation'],
  ['version conflict recovery', 'version_conflict'],
  ['persistent identity', 'localStorage.setItem'],
  ['resume/focus recovery', '__yakolakOnlineWake'],
  ['nonfatal reconnect state', '_mark_reconnecting'],
];

for (const [name, marker] of required) {
  assert.ok(source.includes(marker), `missing online reliability contract: ${name}`);
}

const submitMove = source.match(/func submit_move[\s\S]*?\n\nfunc request_rematch/)?.[0] || '';
assert.ok(submitMove.includes('_queue_or_send'), 'submit_move must queue while a poll is busy');
assert.ok(!submitMove.includes('or busy'), 'submit_move must not silently drop a move because transport is busy');

const fatalError = source.match(/func _fatal_error[\s\S]*?\n\nfunc _accept_room/)?.[0] || '';
assert.ok(fatalError.includes('deactivate'), 'fatal online errors must stop polling instead of hammering the API');

const transient = source.match(/func _handle_request_failure[\s\S]*?\n\nfunc _is_transient_failure/)?.[0] || '';
assert.ok(transient.includes('_mark_reconnecting'), 'transient failures must reconnect without ejecting the match');

console.log('YAKOLAK_ONLINE_RELIABILITY_CONTRACT_OK');
