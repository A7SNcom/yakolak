import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const GAMEPLAY_TEST_FILES = Object.freeze([
  'tests/threejs_gameplay_intent_contract.test.mjs',
  'tests/threejs_pointer_gesture_contract.test.mjs',
  'tests/threejs_pointer_css_contract.test.mjs',
  'tests/threejs_interaction_targets_contract.test.mjs',
  'tests/threejs_home_stack_picking_contract.test.mjs',
  'tests/threejs_motion_controller_contract.test.mjs',
  'tests/threejs_motion_controller_source_contract.test.mjs',
  'tests/threejs_stack_motion_sequences_contract.test.mjs',
  'tests/threejs_size_selection_contract.test.mjs',
  'tests/threejs_shared_rules_transitions_contract.test.mjs',
  'tests/threejs_canonical_session_state_contract.test.mjs',
  'tests/threejs_session_lifecycle_contract.test.mjs',
  'tests/threejs_placement_inventory_contract.test.mjs',
  'tests/threejs_winning_patterns_contract.test.mjs',
  'tests/threejs_turn_ring_contract.test.mjs',
  'tests/threejs_local_deadline_contract.test.mjs',
  'tests/threejs_local_timeout_contract.test.mjs',
  'tests/threejs_true_draw_contract.test.mjs',
  'tests/threejs_win_scoring_contract.test.mjs',
  'tests/threejs_persistent_score_markers_contract.test.mjs',
  'tests/threejs_round_advance_contract.test.mjs',
  'tests/threejs_local_restart_contract.test.mjs',
  'tests/threejs_match_end_lifecycle_contract.test.mjs',
  'tests/threejs_local_authority_adapter_contract.test.mjs',
  'tests/threejs_local_authority_queue_contract.test.mjs',
  'tests/threejs_computer_turn_contract.test.mjs',
  'tests/threejs_exactly_once_regression.test.mjs',
]);

const started = performance.now();
const child = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', ...GAMEPLAY_TEST_FILES],
  {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  },
);

if (child.error) throw child.error;
const elapsedMs = Math.round(performance.now() - started);
console.log(`THREEJS-059 deterministic gameplay suite: ${GAMEPLAY_TEST_FILES.length} files, ${elapsedMs} ms`);
process.exit(child.status ?? 1);
