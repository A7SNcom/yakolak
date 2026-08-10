import assert from 'node:assert/strict';
import fs from 'node:fs';

const gameplay = fs.readFileSync(new URL('../scripts/gameplay_session_resilient.gd', import.meta.url), 'utf8');
const gameplayHardened = fs.readFileSync(new URL('../scripts/gameplay_session_hardened.gd', import.meta.url), 'utf8');
const gameplayPolish = fs.readFileSync(new URL('../scripts/gameplay_session_polish.gd', import.meta.url), 'utf8');
const gameplayNestedPick = fs.readFileSync(new URL('../scripts/gameplay_session_nested_pick.gd', import.meta.url), 'utf8');
const gameplayDesign = fs.readFileSync(new URL('../scripts/gameplay_design_system.gd', import.meta.url), 'utf8');
const turnHudDesign = fs.readFileSync(new URL('../scripts/turn_clarity_hud_design_system.gd', import.meta.url), 'utf8');
const setup = fs.readFileSync(new URL('../scripts/session_setup_arabic.gd', import.meta.url), 'utf8');
const setupFlow = fs.readFileSync(new URL('../scripts/session_setup_flow.gd', import.meta.url), 'utf8');
const setupDialog = fs.readFileSync(new URL('../scripts/session_setup_dialog_system.gd', import.meta.url), 'utf8');
const setupDesign = fs.readFileSync(new URL('../scripts/session_setup_design_system.gd', import.meta.url), 'utf8');
const design = fs.readFileSync(new URL('../scripts/ui_design.gd', import.meta.url), 'utf8');
const iconography = fs.readFileSync(new URL('../scripts/iconography.gd', import.meta.url), 'utf8');
const closeIcon = fs.readFileSync(new URL('../assets/icons/lucide/x.svg', import.meta.url), 'utf8');
const menuIcon = fs.readFileSync(new URL('../assets/icons/lucide/ellipsis.svg', import.meta.url), 'utf8');
const online = fs.readFileSync(new URL('../scripts/online_session.gd', import.meta.url), 'utf8');
const onlineHardened = fs.readFileSync(new URL('../scripts/online_session_hardened.gd', import.meta.url), 'utf8');
const scene = fs.readFileSync(new URL('../scenes/intro.tscn', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../api/rooms.js', import.meta.url), 'utf8');

assert.ok(scene.includes('res://scripts/gameplay_session_nested_pick.gd'), 'the nested piece picker must remain active');
assert.ok(gameplayNestedPick.includes('extends "res://scripts/gameplay_session_polish.gd"'), 'nested picking must preserve the gameplay polish layer');
assert.ok(gameplayPolish.includes('extends "res://scripts/gameplay_session_hardened.gd"'), 'gameplay polish must preserve the hardened gameplay layer');
assert.ok(gameplayHardened.includes('extends "res://scripts/gameplay_session_resilient.gd"'), 'hardened gameplay must preserve the Arabic/stability layer');
assert.ok(scene.includes('res://scripts/online_session_hardened.gd'), 'the hardened online layer must remain active');
assert.ok(onlineHardened.includes('extends "res://scripts/online_session.gd"'), 'hardened online must preserve the base Arabic invitation transport');
assert.ok(scene.includes('res://scripts/session_setup_design_system.gd'), 'the setup design-system adapter must remain active');
assert.ok(setupDesign.includes('extends "res://scripts/session_setup_dialog_system.gd"'), 'the design adapter must preserve the unified dialog layer');
assert.ok(setupDialog.includes('extends "res://scripts/session_setup_flow.gd"'), 'the dialog layer must preserve the user-journey setup layer');
assert.ok(setupFlow.includes('extends "res://scripts/session_setup_arabic.gd"'), 'the user-journey layer must preserve the Arabic setup layer');
assert.ok(scene.includes('res://scripts/gameplay_design_system.gd'), 'gameplay chrome must use the shared design adapter');
assert.ok(gameplayDesign.includes('extends "res://scripts/gameplay_rematch_lifecycle.gd"'), 'gameplay design must preserve the rematch/gameplay chain');
assert.ok(scene.includes('res://scripts/turn_clarity_hud_design_system.gd'), 'the turn clarity adapter must remain active');
assert.ok(turnHudDesign.includes('extends "res://scripts/turn_clarity_hud.gd"'), 'the turn clarity adapter must preserve turn-focus state logic');
assert.ok(turnHudDesign.includes("yakolakDesignTurnCue='localized-3d-light'"), 'turn clarity must be communicated by the 3D focus-light contract');

assert.ok(design.includes('class_name YakolakDesign'), 'the 2D design system must expose one shared token source');
assert.ok(design.includes('const TOUCH_MIN := 48.0'), 'interactive controls must share a 48px minimum target');
assert.ok(design.includes('const RADIUS_CHIP := 10.0'), 'chip radius must be tokenized');
assert.ok(design.includes('const RADIUS_CONTROL := 14.0'), 'control radius must be tokenized');
assert.ok(design.includes('const RADIUS_SURFACE := 18.0'), 'surface radius must be tokenized');
assert.ok(design.includes('static func surface_style'), 'surface styling must use a shared primitive');
assert.ok(design.includes('static func button_style'), 'button states must use a shared primitive');
assert.ok(design.includes('static func apply_button_contract'), 'button typography/touch/focus must use one contract');
assert.ok(setupDesign.includes('Design.apply_button_contract'), 'setup buttons must consume the shared button primitive');
assert.ok(gameplayDesign.includes('Design.apply_button_contract'), 'gameplay buttons must consume the shared button primitive');
assert.ok(!turnHudDesign.includes('Design.surface_style'), 'retired turn clarity must not recreate a redundant 2D surface');

assert.ok(gameplay.includes('func _arabize_digits'), 'gameplay must normalize visible numbers to Arabic digits');
assert.ok(gameplay.includes('turn_label.text = _arabize_digits'), 'legacy turn text must remain Arabic-normalized even though the visible cue is 3D');
assert.ok(gameplay.includes('score_label.text = _arabize_digits'), 'score HUD must pass through Arabic digit normalization');
assert.ok(gameplay.includes('result_button.text = _arabize_digits'), 'result text must pass through Arabic digit normalization');

assert.ok(setup.includes('func _arabize_numbers'), 'setup must normalize all user-facing numbers');
assert.ok(setup.includes('super._label(_arabize_numbers(text_value)'), 'every setup label must be Arabic-normalized by default');
assert.ok(setup.includes('super._button(_arabize_numbers(text_value)'), 'every setup button must be Arabic-normalized by default');
assert.ok(setup.includes('result.length() >= 2'), 'room input must be capped at two digits');

assert.ok(online.includes('func _arabic_digits'), 'online invitation text must display Arabic digits');
assert.ok(online.includes("'الغرفة '+c"), 'online invitation must present the room as an Arabic room number');
assert.ok(onlineHardened.includes('sessionStorage.setItem'), 'online identity must be scoped to the current tab');
assert.ok(onlineHardened.includes('localStorage.removeItem'), 'legacy cross-tab identity must be removed');
assert.ok(server.includes("const ROOM_PATTERN = /^\\d{2}$/"), 'the network room identifier must remain exactly two digits');
assert.ok(server.includes("replace(/[٠-٩]/g"), 'the server must accept Arabic-Indic room digits');

// Generic UI icons must be vector resources, not font glyphs. The branded
// loading star, stones and score markers are intentionally outside this system.
assert.ok(scene.includes('res://scripts/iconography.gd'), 'the unified iconography layer must remain active');
assert.ok(scene.includes('res://assets/icons/lucide/x.svg'), 'close SVG must be an explicit scene dependency for Web export');
assert.ok(scene.includes('res://assets/icons/lucide/ellipsis.svg'), 'menu SVG must be an explicit scene dependency for Web export');
assert.ok(scene.includes('close_icon = ExtResource'), 'scene must inject the close SVG into the icon system');
assert.ok(scene.includes('menu_icon = ExtResource'), 'scene must inject the menu SVG into the icon system');
assert.ok(iconography.includes('ICON_SYSTEM := "lucide-svg-1.27.0"'), 'the icon family/version must be explicit and pinned');
assert.ok(iconography.includes('@export var close_icon: Texture2D'), 'close icon must be scene-owned instead of source-path preload');
assert.ok(iconography.includes('@export var menu_icon: Texture2D'), 'menu icon must be scene-owned instead of source-path preload');
assert.ok(!iconography.includes('preload("res://assets/icons/lucide/'), 'icon SVGs must not rely on source-path preload in Web exports');
assert.ok(iconography.includes('button.text = ""'), 'generic icon buttons must not render Unicode glyph text');
assert.ok(iconography.includes('button.icon = texture'), 'generic icon buttons must render SVG textures');
assert.ok(iconography.includes('icon_max_width'), 'generic icon sizing must be constrained consistently');
assert.ok(iconography.includes('icon_alignment = HORIZONTAL_ALIGNMENT_CENTER'), 'generic icons must stay optically centered');
assert.ok(iconography.includes("yakolakIconRtl='no-directional-controls'"), 'the current icon set must declare its RTL directionality contract');
assert.ok(iconography.includes("yakolakIconAudit='"), 'runtime must publish the in-context icon audit result');

for (const [name, svg] of [['close', closeIcon], ['menu', menuIcon]]) {
  assert.ok(svg.includes('viewBox="0 0 24 24"'), `${name} icon must use the shared 24px grid`);
  assert.ok(svg.includes('stroke-width="2"'), `${name} icon must use the shared 2px stroke`);
  assert.ok(svg.includes('stroke-linecap="round"'), `${name} icon must use rounded stroke caps`);
  assert.ok(svg.includes('stroke-linejoin="round"'), `${name} icon must use rounded joins`);
}
assert.ok(closeIcon.includes('Lucide Icons v1.27.0'), 'close icon provenance/version must be recorded');
assert.ok(menuIcon.includes('Lucide Icons v1.27.0'), 'menu icon provenance/version must be recorded');

console.log('YAKOLAK_ARABIC_UI_CONTRACT_OK');
console.log('YAKOLAK_DESIGN_SYSTEM_CONTRACT_OK');
console.log('YAKOLAK_ICONOGRAPHY_CONTRACT_OK');