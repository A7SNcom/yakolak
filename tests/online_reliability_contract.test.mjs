import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scripts/online_session.gd', import.meta.url), 'utf8');
const gameplay = fs.readFileSync(new URL('../scripts/gameplay_session_resilient.gd', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../api/rooms.js', import.meta.url), 'utf8');

const required = [
  ['protocol v5', 'const PROTOCOL: int = 5'],
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
  ['idempotent bootstrap token', 'clientToken'],
  ['idempotent bootstrap request', 'requestId'],
  ['bootstrap retry', 'MAX_BOOTSTRAP_RETRIES'],
  ['best effort leave', 'keepalive:true'],
];

for (const [name, marker] of required) {
  assert.ok(source.includes(marker), `missing online reliability contract: ${name}`);
}

assert.ok(server.includes("const ROOM_PATTERN = /^\\d{2}$/"), 'server room code must be exactly two digits');
assert.ok(server.includes("const TABLE = 'yakolak_online_rooms_v5'"), 'v5 rooms must be isolated from legacy room state');
assert.ok(server.includes('create_key TEXT NOT NULL UNIQUE'), 'room creation must be idempotent');
assert.ok(server.includes('joinKey'), 'room joining must be idempotent');

const submitMove = source.match(/func submit_move[\s\S]*?\n\nfunc request_rematch/)?.[0] || '';
assert.ok(submitMove.includes('_queue_or_send'), 'submit_move must use the prioritized mutation path');
assert.ok(!submitMove.includes('or busy'), 'submit_move must not silently drop a move because transport is busy');

const prioritized = source.match(/func _queue_or_send[\s\S]*?\n\nfunc _flush_queued_action/)?.[0] || '';
assert.ok(prioritized.includes('inflight_kind == "poll"'), 'a real move must recognize a background poll');
assert.ok(prioritized.includes('_abort_active_request()'), 'a real move must preempt a slow background poll');
assert.ok(prioritized.includes('_clear_inflight()'), 'poll preemption must clear the old request before sending the move');

const clearInflight = source.match(/func _clear_inflight[\s\S]*?\n\nfunc _abort_active_request/)?.[0] || '';
assert.ok(clearInflight.includes('active_request_id = 0'), 'cleared requests must reject very late browser responses');

const fatalError = source.match(/func _fatal_error[\s\S]*?\n\nfunc _accept_room/)?.[0] || '';
assert.ok(fatalError.includes('deactivate'), 'fatal online errors must stop polling instead of hammering the API');

const transient = source.match(/func _handle_request_failure[\s\S]*?\n\nfunc _is_transient_failure/)?.[0] || '';
assert.ok(transient.includes('_mark_reconnecting'), 'transient failures must reconnect without ejecting the match');
assert.ok(transient.includes('bootstrap_attempts'), 'lost create/join responses must be retried safely');

assert.ok(gameplay.includes('_maybe_auto_advance_online_round'), 'online rounds must not freeze after round one');
assert.ok(gameplay.includes('online.call("request_rematch")'), 'every client must automatically acknowledge the next online round');
assert.ok(gameplay.includes('stability_round_reset_tween'), 'round reset animation must be tracked and cancellable');
assert.ok(gameplay.includes('_clean_visual_board'), 'new games must explicitly clear previous physical board state');

console.log('YAKOLAK_ONLINE_RELIABILITY_CONTRACT_OK');
