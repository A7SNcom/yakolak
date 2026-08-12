import assert from 'node:assert/strict';
import fs from 'node:fs';

const scene = fs.readFileSync(new URL('../scenes/intro.tscn', import.meta.url), 'utf8');
const authoritative = fs.readFileSync(new URL('../scripts/gameplay_authoritative_turn_state.gd', import.meta.url), 'utf8');
const lighting = fs.readFileSync(new URL('../scripts/turn_light_crossfade.gd', import.meta.url), 'utf8');
const build = fs.readFileSync(new URL('../scripts/vercel-fast-build.sh', import.meta.url), 'utf8');

assert.ok(scene.includes('res://scripts/turn_light_crossfade.gd'), 'production scene must load the single turn-light owner');
assert.ok(scene.includes('[node name="TurnLightCrossfade" type="Node3D" parent="."]'), 'production scene must contain exactly one turn-light controller node');
assert.equal((scene.match(/node name="TurnLightCrossfade"/g) || []).length, 1, 'turn-light owner must not be duplicated');

assert.ok(authoritative.includes('"direction": str(player.get("direction", ""))'), 'authoritative snapshot must carry the physical seat direction');
assert.ok(authoritative.includes('str(snapshot.get("direction", ""))'), 'turn-state dedupe key must include physical direction');

assert.ok(lighting.includes('gameplay.connect("authoritative_turn_changed", callback)'), 'lighting must subscribe to authoritative turn events');
assert.ok(lighting.includes('authoritative_turn_snapshot'), 'lighting may hydrate once from the authoritative snapshot');
assert.ok(lighting.includes('set_process(false)'), 'turn lighting must explicitly disable frame processing');
assert.ok(!lighting.includes('func _process('), 'turn lighting must never poll turn state per frame');
assert.equal((lighting.match(/var transition_tween: Tween/g) || []).length, 1, 'one tween field must own all turn-light transitions');
assert.ok(lighting.includes('transition_tween.kill()'), 'newer authoritative state must cancel the in-flight owned tween');
assert.ok(lighting.includes('transition_serial'), 'stale completion callbacks must be generation/serial guarded');
assert.ok(lighting.includes('transition_tween.set_parallel(true)'), 'previous and next seat energies must crossfade through one parallel tween');
assert.ok(lighting.includes('SpotLight3D.new()'), 'turn emphasis must stay localized to seat spotlights');
assert.ok(lighting.includes("prefers-reduced-motion: reduce"), 'existing reduced-motion preference must apply to turn lighting');
assert.ok(lighting.includes("yakolakTurnLightOwner='single-authoritative-controller'"), 'web instrumentation must expose the single owner');
assert.ok(lighting.includes("yakolakTurnLightPolling='none'"), 'web instrumentation must expose the no-polling contract');

for (const forbidden of ['Camera3D', 'camera.', 'WorldEnvironment', 'ambient_light_energy', 'tonemap_', 'adjustment_brightness']) {
  assert.ok(!lighting.includes(forbidden), `turn-light owner must not mutate unrelated global/camera state: ${forbidden}`);
}

assert.ok(build.includes('res://tests/turn_light_crossfade_headless.gd turn_light_crossfade'), 'online Godot build gate must run the focused turn-light regression');

console.log('YAKOLAK_TURN_LIGHT_CONTRACT_OK');