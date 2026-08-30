import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const scene = read('scenes/intro.tscn');
const reduced = read('scripts/gameplay_reduced_motion_parity.gd');
const selected = read('scripts/gameplay_selected_state.gd');
const feedback = read('scripts/gameplay_interaction_feedback.gd');
const turnHud = read('scripts/turn_clarity_hud.gd');
const turnLight = read('scripts/turn_light_crossfade.gd');
const session = read('scripts/gameplay_session.gd');

assert.ok(scene.includes('gameplay_reduced_motion_parity.gd'), 'production scene must use reduced-motion parity leaf');
assert.ok(reduced.startsWith('extends "res://scripts/gameplay_selection_latency.gd"'), 'parity must layer above current gameplay');
assert.ok(reduced.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'browser Reduced Motion preference must drive gameplay');

// Selection: stable, non-color owner + legal-target signifiers remain present.
assert.ok(selected.includes("yakolakSelectionStyle='contrast-outline-soft-emission'"), 'selection needs static contrast outline');
assert.ok(feedback.includes("yakolakLegalMarkerStyle='surface-ring+contrast-outline'"), 'legal targets need static contrast rings');
assert.ok(reduced.includes('func _open_piece_tray') && reduced.includes('tray_tween.kill()'), 'reduced selection tray motion must snap');

// Turn: semantic owner copy remains static while motion-only camera/light transitions snap.
assert.ok(turnHud.includes("yakolakTurnIndicatorMotion='none'"), 'turn owner must not depend on animation');
assert.ok(turnLight.includes('if reduced_motion:') && turnLight.includes('_set_exact_final(next_direction)'), 'turn light must have exact reduced-motion final state');
assert.ok(reduced.includes('func _transition_to_current_player') && reduced.includes('_apply_turn_camera_progress(1.0)'), 'local turn camera must snap');
assert.ok(reduced.includes('func _start_authoritative_turn_camera') && reduced.includes('_apply_authoritative_turn_camera_progress(1.0, serial)'), 'online authoritative camera must snap');

// Move acknowledgement: commit still runs through inherited rules, then final
// board state plus static check/text confirms acceptance without waiting on arc motion.
assert.ok(reduced.includes('super._begin_move(cell)'), 'move authority/validation path must remain inherited');
assert.ok(reduced.includes('move_started_msec = Time.get_ticks_msec() - int(ceil(MOVE_DURATION))'), 'reduced move must resolve existing transition immediately');
assert.ok(reduced.includes('RM_ACK_TEXT := "✓ تمت الحركة"'), 'reduced move must have a static text/symbol acknowledgement');
assert.ok(reduced.includes("yakolakReducedMotionMoveAck='visible'"), 'move acknowledgement must be observable');

// Match end: existing visible result control is static and parity layer records it;
// no win/scoring constants or rule evaluation are replaced here.
assert.ok(session.includes('func _show_round_result()') && session.includes('result_button.visible = true'), 'match end needs a persistent result control');
assert.ok(reduced.includes('super._finish_round(winner, winning)'), 'match-end authority must remain inherited');
assert.ok(reduced.includes("yakolakReducedMotionMatchEnd='static-result-control'"), 'match-end parity must be explicit');
assert.ok(reduced.includes("yakolakReducedMotionAnimationDependency='none-for-state'"), 'state information must not depend on animation');

console.log('GGH-029 reduced-motion state parity contract: PASS');