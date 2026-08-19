# THREEJS-059 — Fast deterministic gameplay tests

Status: **LOCKED by THREEJS-059 (2026-08-19)**

THREEJS-059 consolidates the pure Node gameplay/rules/lifecycle contracts created through THREEJS-029 and THREEJS-044→058 into one deterministic, targeted suite. It does not add a daily deployment gate.

## One local/manual command

Run:

```text
npm run test:threejs:gameplay
```

The command invokes `scripts/run-threejs-gameplay-tests.mjs`, which runs the locked gameplay contract files with Node 22 and `--test-concurrency=1`.

The suite has no Playwright/browser installation, no Godot export, no Pages deployment, no backend/network dependency, and no asset build. Randomness used by Computer tests is injected with fixed values; clocks and timers are also deterministic fixtures.

## Coverage map

The suite covers the task requirements through focused pure-module contracts:

- validation / intent shape: `threejs_gameplay_intent_contract`, `threejs_shared_rules_transitions_contract`, `threejs_placement_inventory_contract`;
- canonical state / lifecycle: `threejs_canonical_session_state_contract`, `threejs_session_lifecycle_contract`;
- win patterns: `threejs_winning_patterns_contract`;
- seat rotation / legal-move skips: `threejs_turn_ring_contract`, `threejs_round_advance_contract`;
- deadlines / timeout: `threejs_local_deadline_contract`, `threejs_local_timeout_contract`;
- true draw: `threejs_true_draw_contract`;
- score / `winsToMatch`: `threejs_win_scoring_contract`, `threejs_persistent_score_markers_contract`;
- restart: `threejs_local_restart_contract`;
- match end / rematch: `threejs_match_end_lifecycle_contract`;
- unified local authority / queued submissions: `threejs_local_authority_adapter_contract`, `threejs_local_authority_queue_contract`;
- Computer shared-intent path: `threejs_computer_turn_contract`;
- direct exactly-once replay regression: `threejs_exactly_once_regression`.

## Exactly-once regression

`tests/threejs_exactly_once_regression.test.mjs` deliberately replays already accepted local actions and proves that:

- a move cannot place/consume a second piece;
- a timeout cannot skip twice;
- restart cannot reset the same round twice or create a second deadline;
- a winning move cannot award the score twice;
- Rematch cannot reset/start a fresh match twice.

Each first acceptance advances authority revision once. The replay carries the old revision and fails stale while canonical board/inventory/score/turn/deadline/presentation generation remain unchanged after the first result.

This local deterministic coverage does not claim the final network mutation-ID/receipt contract; THREEJS-072 still owns unified online exactly-once semantics.

## Flash Mode / CI placement

`.github/workflows/threejs-optional-checks.yml` remains `workflow_dispatch` only. Its `fast` job calls the same `npm run test:threejs:gameplay` command alongside existing tiny shell/vendor/Pages contracts.

No push, pull-request, Pages signal, composite deploy or ordinary Three.js edit automatically invokes this suite. Heavy browser checks remain a separate manual `browser/full` choice.

This preserves Flash Mode: ordinary Three.js pushes continue toward the composite Pages path without waiting for broad gameplay, browser or legacy Godot regression work.

## Determinism rule

Tests in this suite must not depend on live network responses, wall-clock waiting, random unseeded strategy choices, rendered pixels, browser scheduling or Godot runtime state. Use explicit snapshots, clocks, random samples and fake timers/resources instead.

The runner prints elapsed time for visibility but intentionally has no fragile wall-clock pass/fail threshold; correctness, not CI host speed, decides pass/fail.
