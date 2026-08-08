import assert from 'node:assert/strict';
import fs from 'node:fs';

const gameplay = fs.readFileSync(new URL('../scripts/gameplay_session_resilient.gd', import.meta.url), 'utf8');
const setup = fs.readFileSync(new URL('../scripts/session_setup_arabic.gd', import.meta.url), 'utf8');
const online = fs.readFileSync(new URL('../scripts/online_session.gd', import.meta.url), 'utf8');
const scene = fs.readFileSync(new URL('../scenes/intro.tscn', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../api/rooms.js', import.meta.url), 'utf8');

assert.ok(scene.includes('res://scripts/gameplay_session_resilient.gd'), 'the Arabic/stability gameplay layer must remain active');
assert.ok(scene.includes('res://scripts/session_setup_arabic.gd'), 'the Arabic setup layer must remain active');

assert.ok(gameplay.includes('func _arabize_digits'), 'gameplay must normalize visible numbers to Arabic digits');
assert.ok(gameplay.includes('turn_label.text = _arabize_digits'), 'turn HUD must pass through Arabic digit normalization');
assert.ok(gameplay.includes('score_label.text = _arabize_digits'), 'score HUD must pass through Arabic digit normalization');
assert.ok(gameplay.includes('result_button.text = _arabize_digits'), 'result text must pass through Arabic digit normalization');

assert.ok(setup.includes('func _arabize_numbers'), 'setup must normalize all user-facing numbers');
assert.ok(setup.includes('super._label(_arabize_numbers(text_value)'), 'every setup label must be Arabic-normalized by default');
assert.ok(setup.includes('super._button(_arabize_numbers(text_value)'), 'every setup button must be Arabic-normalized by default');
assert.ok(setup.includes('result.length() >= 2'), 'room input must be capped at two digits');

assert.ok(online.includes('func _arabic_digits'), 'online invitation text must display Arabic digits');
assert.ok(online.includes("'الغرفة '+c"), 'online invitation must present the room as an Arabic room number');
assert.ok(server.includes("const ROOM_PATTERN = /^\\d{2}$/"), 'the network room identifier must remain exactly two digits');
assert.ok(server.includes("replace(/[٠-٩]/g"), 'the server must accept Arabic-Indic room digits');

console.log('YAKOLAK_ARABIC_UI_CONTRACT_OK');
