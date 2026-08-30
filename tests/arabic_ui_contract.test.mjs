import assert from 'node:assert/strict';
import fs from 'node:fs';

const gameplay = fs.readFileSync(new URL('../scripts/gameplay_session_resilient.gd', import.meta.url), 'utf8');
const gameplayHardened = fs.readFileSync(new URL('../scripts/gameplay_session_hardened.gd', import.meta.url), 'utf8');
const gameplayPolish = fs.readFileSync(new URL('../scripts/gameplay_session_polish.gd', import.meta.url), 'utf8');
const gameplayNestedPick = fs.readFileSync(new URL('../scripts/gameplay_session_nested_pick.gd', import.meta.url), 'utf8');
const gameplayDesign = fs.readFileSync(new URL('../scripts/gameplay_design_system.gd', import.meta.url), 'utf8');
const authoritativeTurn = fs.readFileSync(new URL('../scripts/gameplay_authoritative_turn_state.gd', import.meta.url), 'utf8');
const turnTransition = fs.readFileSync(new URL('../scripts/gameplay_turn_transition_stale_safe.gd', import.meta.url), 'utf8');
const selectedState = fs.readFileSync(new URL('../scripts/gameplay_selected_state.gd', import.meta.url), 'utf8');
const selectionLatency = fs.readFileSync(new URL('../scripts/gameplay_selection_latency.gd', import.meta.url), 'utf8');
const reducedMotion = fs.readFileSync(new URL('../scripts/gameplay_reduced_motion_parity.gd', import.meta.url), 'utf8');
const gameplaySession = fs.readFileSync(new URL('../scripts/gameplay_session.gd', import.meta.url), 'utf8');
const rematchLifecycle = fs.readFileSync(new URL('../scripts/gameplay_rematch_lifecycle.gd', import.meta.url), 'utf8');
const tutorialShowcase = fs.readFileSync(new URL('../scripts/gameplay_tutorial_showcase.gd', import.meta.url), 'utf8');
const turnHud = fs.readFileSync(new URL('../scripts/turn_clarity_hud.gd', import.meta.url), 'utf8');
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
const onlineReconnect = fs.readFileSync(new URL('../scripts/online_session_reconnect_hydration.gd', import.meta.url), 'utf8');
const scene = fs.readFileSync(new URL('../scenes/intro.tscn', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../api/rooms.js', import.meta.url), 'utf8');

assert.ok(scene.includes('res://scripts/gameplay_session_nested_pick.gd'), 'the nested piece picker must remain active');
assert.ok(gameplayNestedPick.includes('extends "res://scripts/gameplay_session_polish.gd"'), 'nested picking must preserve the gameplay polish layer');
assert.ok(gameplayPolish.includes('extends "res://scripts/gameplay_session_hardened.gd"'), 'gameplay polish must preserve the hardened gameplay layer');
assert.ok(gameplayHardened.includes('extends "res://scripts/gameplay_session_resilient.gd"'), 'hardened gameplay must preserve the Arabic/stability layer');
assert.ok(scene.includes('res://scripts/online_session_reconnect_hydration.gd'), 'the reconnect hydration online layer must remain active');
assert.ok(onlineReconnect.includes('extends "res://scripts/online_session_hardened.gd"'), 'reconnect hydration must preserve the hardened online layer');
assert.ok(onlineHardened.includes('extends "res://scripts/online_session.gd"'), 'hardened online must preserve the base Arabic invitation transport');
assert.ok(scene.includes('res://scripts/session_setup_design_system.gd'), 'the setup design-system adapter must remain active');
assert.ok(setupDesign.includes('extends "res://scripts/session_setup_dialog_system.gd"'), 'the design adapter must preserve the unified dialog layer');
assert.ok(setupDialog.includes('extends "res://scripts/session_setup_flow.gd"'), 'the dialog layer must preserve the user-journey setup layer');
assert.ok(setupFlow.includes('extends "res://scripts/session_setup_arabic.gd"'), 'the user-journey layer must preserve the Arabic setup layer');
assert.ok(scene.includes('res://scripts/gameplay_design_system.gd'), 'gameplay chrome must use the shared design adapter');
assert.ok(gameplayDesign.includes('extends "res://scripts/gameplay_rematch_lifecycle.gd"'), 'gameplay design must preserve the rematch/gameplay chain');
assert.ok(scene.includes('res://scripts/gameplay_reduced_motion_parity.gd'), 'production gameplay must use the reduced-motion presentation leaf');
assert.ok(reducedMotion.includes('extends \"res://scripts/gameplay_selection_latency.gd\"'), 'reduced-motion gameplay must preserve the selection-latency layer');
assert.ok(selectionLatency.includes('extends \"res://scripts/gameplay_selected_state.gd\"'), 'selection latency must preserve the selected-state presentation layer');
assert.ok(selectedState.includes('extends "res://scripts/gameplay_turn_transition_stale_safe.gd"'), 'selected-state presentation must preserve the stale-safe turn presentation layer');
assert.ok(turnTransition.includes('extends "res://scripts/gameplay_authoritative_turn_state.gd"'), 'stale-safe presentation must preserve the authoritative turn observer layer');
assert.ok(authoritativeTurn.includes('signal authoritative_turn_changed'), 'turn presentation must subscribe to one authoritative gameplay event');
assert.ok(authoritativeTurn.includes('authoritative_online_snapshot_hydrated'), 'reconnect must stay hidden until a fresh accepted room snapshot hydrates turn state');
assert.ok(scene.includes('res://scripts/turn_clarity_hud_design_system.gd'), 'the turn clarity adapter must remain active');
assert.ok(turnHudDesign.includes('extends "res://scripts/turn_clarity_hud.gd"'), 'the turn clarity adapter must preserve the authoritative indicator state logic');
assert.ok(turnHudDesign.includes("yakolakDesignTurnCue='top-center-30px-capsule'"), 'turn clarity must use the compact fixed top-center capsule contract');
assert.ok(turnHud.includes("yakolakTurnIndicatorSource='authoritative-turn-signal'"), 'turn indicator must consume the authoritative gameplay signal only');
assert.ok(turnHud.includes("yakolakTurnIndicatorPolling='none'"), 'turn indicator must explicitly publish its no-polling contract');
assert.ok(!turnHud.includes('func _process('), 'turn indicator must never poll turn state per frame');
assert.ok(turnHud.includes('return "دورك"'), 'local online turn copy must remain compact');
assert.ok(turnHud.includes('return "دور لاعب " + str(number)'), 'remote turn copy must use the authoritative player number');
assert.ok(turnHud.includes('Display.display_text(_indicator_copy(snapshot))'), 'turn copy must cross the shared Western-digit display boundary');

assert.ok(design.includes('class_name YakolakDesign'), 'the 2D design system must expose one shared token source');
assert.ok(design.includes('static func display_text(value: Variant) -> String'), 'all numeral shaping must share one user-facing display boundary');
assert.ok(design.includes('const ARABIC_INDIC_DIGITS'), 'display boundary must normalize Arabic-Indic input');
assert.ok(design.includes('const EXTENDED_ARABIC_INDIC_DIGITS'), 'display boundary must normalize Extended Arabic-Indic input');
assert.ok(design.includes('const TOUCH_MIN := 48.0'), 'interactive controls must share a 48px minimum target');
assert.ok(design.includes('const RADIUS_CHIP := 10.0'), 'chip radius must be tokenized');
assert.ok(design.includes('const RADIUS_CONTROL := 14.0'), 'control radius must be tokenized');
assert.ok(design.includes('const RADIUS_SURFACE := 18.0'), 'chip radius must be tokenized');
assert.ok(design.includes('static func surface_style'), 'surface styling must use a shared primitive');
assert.ok(design.includes('static func button_style'), 'button states must use a shared primitive');
assert.ok(design.includes('static func apply_button_contract'), 'button typography/touch/focus must use one contract');
assert.ok(setupDesign.includes('Design.apply_button_contract'), 'setup buttons must consume the shared button primitive');
assert.ok(gameplayDesign.includes('Design.apply_button_contract'), 'gameplay buttons must consume the shared button primitive');
assert.ok(!turnHudDesign.includes('Design.surface_style'), 'turn indicator must not grow into a redundant gameplay surface');

assert.ok(!gameplay.includes('func _arabize_digits'), 'gameplay must not own an ad-hoc Arabic digit converter');
assert.ok(gameplay.includes('turn_label.text = Display.display_text(turn_label.text)'), 'legacy turn text must cross the shared display boundary');
assert.ok(gameplay.includes('score_label.text = Display.display_text(score_label.text)'), 'score text must cross the shared display boundary');
assert.ok(gameplay.includes('result_button.text = Display.display_text(result_button.text)'), 'result text must cross the shared display boundary');

assert.ok(!gameplayHardened.includes('func _arabize_waiting'), 'waiting UI must not own an Arabic digit shaper');
assert.ok(gameplayHardened.includes('WaitingDisplay.display_text(value)'), 'waiting UI must use the shared Western-digit display boundary');
assert.ok(gameplayHardened.includes('waiting_exit_button.text_direction = Control.TEXT_DIRECTION_RTL'), 'waiting action must set RTL text direction explicitly');
assert.ok(gameplaySession.includes('result_button.text_direction = Control.TEXT_DIRECTION_RTL'), 'match result must set RTL text direction explicitly');
assert.ok(rematchLifecycle.includes('post_match_secondary_button.text_direction = Control.TEXT_DIRECTION_RTL'), 'post-match secondary action must set RTL text direction explicitly');
assert.ok(reducedMotion.includes('_rm_ack_label.text_direction = Control.TEXT_DIRECTION_RTL'), 'reduced-motion acknowledgement must set RTL text direction explicitly');
assert.ok(!/[٠-٩۰-۹]/u.test(tutorialShowcase), 'tutorial progress must render Western digits');

assert.ok(!setup.includes('func _arabize_numbers'), 'setup must not own an ad-hoc Arabic digit converter');
assert.ok(setup.includes('super._label(Display.display_text(text_value)'), 'every setup label must cross the shared display boundary');
assert.ok(setup.includes('super._button(Display.display_text(text_value)'), 'every setup button must cross the shared display boundary');
assert.ok(setup.includes('placeholder_text = "مثال: 54"'), 'room-code placeholder must demonstrate Western digits');
assert.ok(setup.includes('field.text = display_value'), 'Arabic/Persian room-code input must be immediately re-rendered as Western digits');
assert.ok(setup.includes('result.length() >= 2'), 'room input must be capped at two digits');

assert.ok(online.includes('func _arabic_digits'), 'base transport keeps its legacy virtual hook for compatibility');
assert.ok(online.includes('JSON.stringify(_arabic_digits(code))'), 'invite DOM must continue to pass room-code display through the virtual hook');
assert.ok(onlineHardened.includes('func _arabic_digits(value: String) -> String:'), 'active online transport must override the legacy digit hook');
assert.ok(onlineHardened.includes('return Display.display_text(value)'), 'active online invite text must resolve through the shared Western-digit boundary');
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
console.log('YAKOLAK_WESTERN_DIGITS_DISPLAY_CONTRACT_OK');
console.log('YAKOLAK_DESIGN_SYSTEM_CONTRACT_OK');
console.log('YAKOLAK_ICONOGRAPHY_CONTRACT_OK');
