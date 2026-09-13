import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scripts/session_setup_flow.gd', import.meta.url), 'utf8');
const start = source.indexOf('func _build_rounds_question');
const end = source.indexOf('\nfunc _choose_all_computer', start);
assert.ok(start >= 0 && end > start, 'rounds renderer must exist');

const rounds = source.slice(start, end);
assert.ok(rounds.includes('for count: int in [3, 5]'), 'round choices stay 3 and 5');
assert.ok(!rounds.includes('✓'), 'round labels must not depend on unsupported check glyphs');
assert.ok(rounds.includes('choice.toggle_mode = true'), 'round choices use native toggle state');
assert.ok(rounds.includes('choice.button_pressed = selected'), 'exactly the retained round value drives selected state');
assert.ok(rounds.includes('"pressed", _button_style(Color("#235b50"))'), 'selected state has a distinct native pressed style');
assert.ok(rounds.includes('choice.pressed.connect(_choose_rounds.bind(count))'), 'mouse and keyboard activation keep the canonical selection action');

console.log('GGH176_ROUNDS_SELECTED_STATE_CONTRACT_OK');
