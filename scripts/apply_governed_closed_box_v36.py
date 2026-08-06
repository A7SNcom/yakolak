#!/usr/bin/env python3
"""Apply YAKOLAK 3.6 governed scene timing and the rigid closed-box entrance."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, text: str) -> None:
    (ROOT / relative).write_text(text, encoding="utf-8", newline="\n")


def replace_once(relative: str, old: str, new: str) -> None:
    text = read(relative)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one literal match, found {count}: {old[:120]!r}")
    write(relative, text.replace(old, new, 1))


def regex_once(relative: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(relative)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one regex match, found {count}: {pattern[:120]!r}")
    write(relative, updated)


def patch_loader() -> None:
    path = "scripts/apply_web_loader.py"
    replace_once(
        path,
        "transform-origin:50% 100%;animation:bounce var(--cycle) infinite;\n  will-change:transform",
        "transform-origin:50% 100%;animation:bounce var(--cycle) infinite;\n  animation-play-state:paused;will-change:transform",
    )
    replace_once(
        path,
        "animation:turn var(--cycle) linear infinite;will-change:transform",
        "animation:turn var(--cycle) linear infinite;animation-play-state:paused;will-change:transform",
    )
    replace_once(
        path,
        "transform-origin:center;animation:shadow var(--cycle) infinite;\n  will-change:transform,opacity",
        "transform-origin:center;animation:shadow var(--cycle) infinite;\n  animation-play-state:paused;will-change:transform,opacity",
    )
    replace_once(
        path,
        """  const cycle=820;
  const epoch=performance.now();
  const minimumVisibleHold=780;
  const materialBridgeDuration=1200;
  const materialBridgeHoldRatio=220/materialBridgeDuration;
  let scheduled=false;
  let released=false;
  let matchReady=false;
  let brandReady=false;
  let brandVisibleAt=0;""",
        """  const cycle=820;
  const epoch=performance.now();
  const initialRestMs=220;
  const motionWarmupMs=260;
  const motionSettleMs=220;
  const minimumLoaderMs=2600;
  const minimumVisibleHold=900;
  const materialBridgeDuration=1200;
  const materialBridgeHoldRatio=260/materialBridgeDuration;
  let scheduled=false;
  let released=false;
  let matchReady=false;
  let brandReady=false;
  let motionReady=false;
  let motionStartedAt=0;
  let brandVisibleAt=0;""",
    )
    replace_once(
        path,
        """  document.body.dataset.yakolakMtkyfPalette='original-black-white';
  document.body.dataset.yakolakVisualBridge='white-to-material-crossfade';
  window.__yakolakHandoffHistory=['waiting'];
  window.__yakolakBrandHistory=['hidden'];
  window.__yakolakLoading={set(){}};""",
        """  document.body.dataset.yakolakMtkyfPalette='original-black-white';
  document.body.dataset.yakolakVisualBridge='white-to-material-crossfade';
  document.body.dataset.yakolakTimingPolicy='minimum-gated-v1';
  document.body.dataset.yakolakLoaderMinimumMs=String(minimumLoaderMs);
  document.body.dataset.yakolakBounceWarmupMs=String(motionWarmupMs);
  document.body.dataset.yakolakBounceSettleMs=String(motionSettleMs);
  document.body.dataset.yakolakStarMotion='resting';
  window.__yakolakHandoffHistory=['waiting'];
  window.__yakolakBrandHistory=['hidden'];
  window.__yakolakStarMotionHistory=['resting'];
  window.__yakolakLoading={set(){}};""",
    )
    replace_once(
        path,
        "  const match=(clone,handoffShadow,first,shadowFirst)=>{",
        """  const M=state=>{
    document.body.dataset.yakolakStarMotion=state;
    window.__yakolakStarMotionHistory.push(state);
  };

  const startMotion=()=>{
    if(released||motionReady||!bounce||!S||!shadow)return;
    M('warming');
    const warmups=[
      bounce.animate([
        {transform:'translateY(0) scale(1,1)',offset:0},
        {transform:'translateY(1.6px) scale(1.014,.986)',offset:.58},
        {transform:'translateY(0) scale(1,1)',offset:1}
      ],{duration:motionWarmupMs,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'}),
      S.animate([
        {transform:'rotate(0deg)',offset:0},
        {transform:'rotate(1.2deg)',offset:.58},
        {transform:'rotate(0deg)',offset:1}
      ],{duration:motionWarmupMs,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'}),
      shadow.animate([
        {transform:'scale(.66,.72)',opacity:.26,offset:0},
        {transform:'scale(.72,.74)',opacity:.30,offset:.58},
        {transform:'scale(.66,.72)',opacity:.26,offset:1}
      ],{duration:motionWarmupMs,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'})
    ];
    Promise.all(warmups.map(animation=>animation.finished)).then(()=>{
      if(released)return;
      warmups.forEach(animation=>animation.cancel());
      bounce.style.animationPlayState='running';
      S.style.animationPlayState='running';
      shadow.style.animationPlayState='running';
      motionReady=true;
      motionStartedAt=performance.now();
      M('running');
      schedule();
    });
  };

  const settleMotion=()=>{
    if(!bounce||!S||!shadow)return Promise.resolve();
    M('settling');
    const bounceFrom=getComputedStyle(bounce).transform;
    const starFrom=getComputedStyle(S).transform;
    const shadowFrom=getComputedStyle(shadow).transform;
    const shadowOpacity=Number(getComputedStyle(shadow).opacity)||.26;
    bounce.style.animationPlayState='paused';
    S.style.animationPlayState='paused';
    shadow.style.animationPlayState='paused';
    const settles=[
      bounce.animate([
        {transform:bounceFrom},
        {transform:'translateY(0) scale(1,1)'}
      ],{duration:motionSettleMs,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'}),
      S.animate([
        {transform:starFrom},
        {transform:'rotate(0deg)'}
      ],{duration:motionSettleMs,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'}),
      shadow.animate([
        {transform:shadowFrom,opacity:shadowOpacity},
        {transform:'scale(.66,.72)',opacity:.26}
      ],{duration:motionSettleMs,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'})
    ];
    return Promise.all(settles.map(animation=>animation.finished)).then(()=>{
      bounce.style.transform='translateY(0) scale(1,1)';
      S.style.transform='rotate(0deg)';
      shadow.style.transform='scale(.66,.72)';
      shadow.style.opacity='.26';
      M('rested');
    });
  };

  const match=(clone,handoffShadow,first,shadowFirst)=>{""",
    )
    replace_once(
        path,
        """  const lock=()=>{
    if(released||!window.__yakolakMatch?.star||!S||!L)return;
    released=true;
    H('locking');
    createCanonicalHandoff();
  };

  const schedule=()=>{
    if(scheduled||released||!matchReady||!brandReady)return;
    scheduled=true;
    const now=performance.now();
    const elapsed=now-epoch;
    const holdLeft=Math.max(0,minimumVisibleHold-(now-brandVisibleAt));
    const futureElapsed=elapsed+holdLeft;
    const nextCanonicalRest=Math.max(90,cycle-(futureElapsed%cycle)+18);
    setTimeout(lock,holdLeft+nextCanonicalRest);
  };

  setTimeout(()=>{
    if(released)return;
    P('entering');""",
        """  const lock=()=>{
    if(released||!window.__yakolakMatch?.star||!S||!L)return;
    released=true;
    H('locking');
    settleMotion().then(createCanonicalHandoff);
  };

  const schedule=()=>{
    if(scheduled||released||!matchReady||!brandReady||!motionReady)return;
    scheduled=true;
    const now=performance.now();
    const loopElapsed=Math.max(0,now-motionStartedAt);
    const brandHoldLeft=Math.max(0,minimumVisibleHold-(now-brandVisibleAt));
    const sceneHoldLeft=Math.max(0,minimumLoaderMs-(now-epoch));
    const holdLeft=Math.max(brandHoldLeft,sceneHoldLeft);
    const futureLoopElapsed=loopElapsed+holdLeft;
    const nextCanonicalRest=Math.max(90,cycle-(futureLoopElapsed%cycle)+18);
    setTimeout(lock,holdLeft+nextCanonicalRest);
  };

  setTimeout(startMotion,initialRestMs);

  setTimeout(()=>{
    if(released)return;
    P('entering');""",
    )


def patch_preintro() -> None:
    path = "scripts/pre_intro_star_to_table.gd"
    regex_once(
        path,
        r"const MATCH_HOLD_MS: float = 220\.0.*?const MOTION_VERSION: String = \"pixel-matched-soft-material-box-v4\"",
        """const MIN_MATCH_HOLD_MS: float = 260.0
const MIN_MORPH_MS: float = 980.0
const MIN_SETTLE_MS: float = 300.0
const MIN_CAMERA_ORBIT_MS: float = 1250.0
const MIN_CAMERA_HOLD_MS: float = 220.0
const MIN_CLOSED_BOX_DROP_MS: float = 1200.0
const MIN_CLOSED_BOX_LANDED_HOLD_MS: float = 420.0
const MAX_TIMELINE_STEP_MS: float = 50.0

const MATCH_HOLD_MS: float = MIN_MATCH_HOLD_MS
const MORPH_MS: float = MIN_MORPH_MS
const SETTLE_MS: float = MIN_SETTLE_MS
const CAMERA_ORBIT_MS: float = MIN_CAMERA_ORBIT_MS
const CAMERA_HOLD_MS: float = MIN_CAMERA_HOLD_MS
const TABLE_TOTAL_MS: float = MATCH_HOLD_MS + MORPH_MS + SETTLE_MS + CAMERA_ORBIT_MS + CAMERA_HOLD_MS
const CLOSED_BOX_DROP_MS: float = MIN_CLOSED_BOX_DROP_MS
const CLOSED_BOX_LANDED_HOLD_MS: float = MIN_CLOSED_BOX_LANDED_HOLD_MS
const TOTAL_MS: float = TABLE_TOTAL_MS + CLOSED_BOX_DROP_MS + CLOSED_BOX_LANDED_HOLD_MS

const MATCH_CAMERA_DISTANCE: float = 54.0
const MATCH_CAMERA_FOV: float = 42.0
const CLOSED_BOX_START_HEIGHT: float = 8.4
const CLOSED_BOX_IMPACT_DEPTH: float = 0.10
const CLOSED_BOX_REBOUND_HEIGHT: float = 0.06
const PEDESTAL_HALF_HEIGHT: float = 12.25
const WHITE_STAR: Color = Color(\"#ffffff\")
const MOTION_VERSION: String = \"pixel-matched-governed-closed-box-v5\"""",
        re.S,
    )
    replace_once(
        path,
        "var match_wait_frames: int = 0\nvar started_msec: int = 0\nvar published_phase: int = -1",
        "var match_wait_frames: int = 0\nvar started_msec: int = 0\nvar governed_elapsed_ms: float = 0.0\nvar published_phase: int = -1",
    )
    replace_once(
        path,
        "var match_camera_rotation: Quaternion\nvar match_camera_fov: float\nvar box_final_poses: Dictionary = {}",
        "var match_camera_rotation: Quaternion\nvar match_camera_fov: float\nvar closed_box_root: Node3D\nvar closed_box_landed: bool = false",
    )
    replace_once(
        path,
        """	var elapsed: float = float(Time.get_ticks_msec() - started_msec)
	if elapsed < TABLE_TOTAL_MS:
		_apply_table_and_camera(elapsed)
		_publish_timeline_phase(elapsed)
		return

	if not box_reveal_started:
		_publish_timeline_phase(TABLE_TOTAL_MS)
		_begin_box_reveal()
	var box_elapsed: float = elapsed - TABLE_TOTAL_MS
	_apply_box_reveal(minf(box_elapsed, BOX_REVEAL_MS))
	if box_elapsed >= BOX_REVEAL_MS:
		_snap_box_and_camera_final()
		if published_phase < 6:
			published_phase = 6
			_publish_phase("box-settled")
	if elapsed >= TOTAL_MS:
		_finish_and_start_intro()""",
        """	governed_elapsed_ms += minf(maxf(_delta, 0.0) * 1000.0, MAX_TIMELINE_STEP_MS)
	var elapsed: float = governed_elapsed_ms
	if elapsed < TABLE_TOTAL_MS:
		_apply_table_and_camera(elapsed)
		_publish_timeline_phase(elapsed)
		return

	if not box_reveal_started:
		_publish_timeline_phase(TABLE_TOTAL_MS)
		_begin_closed_box_drop()
	var box_elapsed: float = elapsed - TABLE_TOTAL_MS
	_apply_closed_box_drop(minf(box_elapsed, CLOSED_BOX_DROP_MS))
	if box_elapsed >= CLOSED_BOX_DROP_MS:
		_snap_closed_box_landed()
		if published_phase < 6:
			published_phase = 6
			_publish_phase("box-closed-landed")
	if elapsed >= TOTAL_MS:
		_finish_and_start_intro()""",
    )
    replace_once(
        path,
        """func _start_matched_handoff() -> void:
	handoff_started = true
	started_msec = Time.get_ticks_msec()
	published_phase = 0
	_publish_phase("matched")""",
        """func _start_matched_handoff() -> void:
	handoff_started = true
	started_msec = Time.get_ticks_msec()
	governed_elapsed_ms = 0.0
	published_phase = 0
	_publish_phase("matched")""",
    )
    regex_once(
        path,
        r"func _begin_box_reveal\(\) -> void:.*?\n\n\nfunc _snap_table_final\(\) -> void:",
        """func _begin_closed_box_drop() -> void:
	box_reveal_started = true
	closed_box_landed = false
	_snap_table_final()
	_apply_final_camera()
	# Timeline zero is the accepted fully closed product: board, lid, walls and
	# contained stones are assembled before the entrance begins.
	intro.call("_apply_timeline", 0.0)
	intro.set("playing", false)
	closed_box_root = Node3D.new()
	closed_box_root.name = "ClosedBoxDropRoot"
	intro.add_child(closed_box_root)
	for node: GeometryInstance3D in game_nodes:
		node.visible = true
		node.reparent(closed_box_root, true)
	closed_box_root.position = Vector3(0.0, CLOSED_BOX_START_HEIGHT, 0.0)
	closed_box_root.rotation = Vector3.ZERO
	closed_box_root.scale = Vector3.ONE
	_publish_phase("box-closed-descending")


func _apply_closed_box_drop(drop_elapsed: float) -> void:
	if closed_box_root == null or closed_box_landed:
		return
	var raw_t: float = clampf(drop_elapsed / CLOSED_BOX_DROP_MS, 0.0, 1.0)
	var y: float
	if raw_t < 0.78:
		var fall_t: float = _ease_in_cubic(raw_t / 0.78)
		y = lerpf(CLOSED_BOX_START_HEIGHT, -CLOSED_BOX_IMPACT_DEPTH, fall_t)
	elif raw_t < 0.90:
		var rebound_t: float = _ease_out_cubic((raw_t - 0.78) / 0.12)
		y = lerpf(-CLOSED_BOX_IMPACT_DEPTH, CLOSED_BOX_REBOUND_HEIGHT, rebound_t)
	else:
		var settle_t: float = _smootherstep((raw_t - 0.90) / 0.10)
		y = lerpf(CLOSED_BOX_REBOUND_HEIGHT, 0.0, settle_t)
	closed_box_root.position = Vector3(0.0, y, 0.0)


func _snap_closed_box_landed() -> void:
	if closed_box_landed:
		return
	closed_box_landed = true
	if closed_box_root != null:
		closed_box_root.position = Vector3.ZERO
		for node: GeometryInstance3D in game_nodes:
			node.reparent(intro, true)
		closed_box_root.queue_free()
		closed_box_root = null


func _snap_table_final() -> void:""",
        re.S,
    )
    regex_once(
        path,
        r"func _snap_box_and_camera_final\(\) -> void:.*?\n\n\nfunc _finish_and_start_intro\(\) -> void:",
        """func _snap_box_and_camera_final() -> void:
	_apply_final_camera()
	_snap_closed_box_landed()
	for node: GeometryInstance3D in game_nodes:
		node.visible = true


func _finish_and_start_intro() -> void:""",
        re.S,
    )
    replace_once(
        path,
        'print("YAKOLAK_PREINTRO_COMPLETE duration=%d motion=%s match=pixel-exact logo=wall camera=side box=soft-staggered" % [int(TOTAL_MS), MOTION_VERSION])',
        'print("YAKOLAK_PREINTRO_COMPLETE duration=%d motion=%s match=pixel-exact logo=wall camera=side box=closed-rigid-drop lid=exit-only" % [int(TOTAL_MS), MOTION_VERSION])',
    )
    replace_once(
        path,
        """		"document.body.dataset.yakolakPreIntroShape='exact-svg-pixel-match';" +
		"document.body.dataset.yakolakMaterialBridge='white-emission-to-material';" +
		"document.body.dataset.yakolakBoxReveal='soft-staggered-fade';" +
		"document.body.dataset.yakolakBoxRevealDuration='" + str(int(BOX_REVEAL_MS)) + "';" +
		"document.body.dataset.yakolakMotion='" + MOTION_VERSION + "';" +""",
        """		"document.body.dataset.yakolakPreIntroShape='exact-svg-pixel-match';" +
		"document.body.dataset.yakolakMaterialBridge='white-emission-to-material';" +
		"document.body.dataset.yakolakTimingPolicy='minimum-gated-v1';" +
		"document.body.dataset.yakolakSceneMinimums='match:260,morph:980,settle:300,camera:1250,cameraHold:220,closedBoxDrop:1200,closedBoxHold:420';" +
		"document.body.dataset.yakolakSceneFlow='star>material>camera>closed-box-drop>lid-open';" +
		"document.body.dataset.yakolakBoxReveal='closed-rigid-body-drop';" +
		"document.body.dataset.yakolakBoxRevealDuration='" + str(int(CLOSED_BOX_DROP_MS)) + "';" +
		"document.body.dataset.yakolakBoxLandedHold='" + str(int(CLOSED_BOX_LANDED_HOLD_MS)) + "';" +
		"document.body.dataset.yakolakBoxLidPolicy='present-during-drop-exit-only';" +
		"window.__yakolakPreIntroPhases=window.__yakolakPreIntroPhases||[];" +
		"window.__yakolakPreIntroPhases.push({state:'" + state + "',at:performance.now()});" +
		"document.body.dataset.yakolakMotion='" + MOTION_VERSION + "';" +""",
    )
    replace_once(
        path,
        """func _smootherstep(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)""",
        """func _ease_in_cubic(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return t * t * t


func _ease_out_cubic(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return 1.0 - pow(1.0 - t, 3.0)


func _smootherstep(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)""",
    )


def patch_refinement() -> None:
    path = "scripts/pre_intro_refinement.gd"
    replace_once(path, "const MATCH_HOLD_MS: float = 220.0", "const MATCH_HOLD_MS: float = 260.0")
    replace_once(
        path,
        'const MOTION_VERSION: String = "pixel-matched-direct-slow-safe-framing-v6"',
        'const MOTION_VERSION: String = "pixel-matched-direct-slow-safe-framing-v7"',
    )
    replace_once(
        path,
        """	var started_msec: int = int(preintro.get("started_msec"))
	if started_msec <= 0:
		return
	var elapsed: float = float(Time.get_ticks_msec() - started_msec)""",
        """	var elapsed: float = float(preintro.get("governed_elapsed_ms"))
	if elapsed < 0.0:
		return""",
    )


def patch_tests() -> None:
    path = "tests/pre_intro_smoke.spec.js"
    replace_once(
        path,
        """      visualBridge: document.body.dataset.yakolakVisualBridge,
      contour: document.body.dataset.yakolakContourSource,""",
        """      visualBridge: document.body.dataset.yakolakVisualBridge,
      timingPolicy: document.body.dataset.yakolakTimingPolicy,
      loaderMinimumMs: document.body.dataset.yakolakLoaderMinimumMs,
      motionHistory: window.__yakolakStarMotionHistory,
      contour: document.body.dataset.yakolakContourSource,""",
    )
    replace_once(
        path,
        """  expect(first.visualBridge).toBe('white-to-material-crossfade');
  expect(first.contour).toBe('table-svg-exact-path');""",
        """  expect(first.visualBridge).toBe('white-to-material-crossfade');
  expect(first.timingPolicy).toBe('minimum-gated-v1');
  expect(first.loaderMinimumMs).toBe('2600');
  expect(first.motionHistory[0]).toBe('resting');
  expect(first.contour).toBe('table-svg-exact-path');""",
    )
    replace_once(
        path,
        """      star: window.__yakolakMatch.star,
      canvas: { x:c.left, y:c.top, w:c.width, h:c.height }
    };""",
        """      star: window.__yakolakMatch.star,
      canvas: { x:c.left, y:c.top, w:c.width, h:c.height },
      motionHistory: window.__yakolakStarMotionHistory
    };""",
    )
    replace_once(
        path,
        "  expect(match.brands).toEqual(['hidden','entering','visible','leaving','hidden-after-fade']);",
        """  expect(match.brands).toEqual(['hidden','entering','visible','leaving','hidden-after-fade']);
  expect(match.motionHistory).toEqual(['resting','warming','running','settling','rested']);""",
    )
    replace_once(
        path,
        """  await expect.poll(
    () => events.some(x => x.includes('YAKOLAK_PREINTRO_PHASE box-arriving')),
    { timeout: 15000 }
  ).toBe(true);
  expect(await page.evaluate(() => document.body.dataset.yakolakBoxReveal)).toBe('soft-staggered-fade');
  expect(await page.evaluate(() => document.body.dataset.yakolakBoxRevealDuration)).toBe('1100');""",
        """  await expect.poll(
    () => events.some(x => x.includes('YAKOLAK_PREINTRO_PHASE box-closed-descending')),
    { timeout: 15000 }
  ).toBe(true);
  expect(await page.evaluate(() => document.body.dataset.yakolakBoxReveal)).toBe('closed-rigid-body-drop');
  expect(await page.evaluate(() => document.body.dataset.yakolakBoxRevealDuration)).toBe('1200');
  expect(await page.evaluate(() => document.body.dataset.yakolakBoxLandedHold)).toBe('420');
  expect(await page.evaluate(() => document.body.dataset.yakolakBoxLidPolicy)).toBe('present-during-drop-exit-only');
  expect(await page.evaluate(() => document.body.dataset.yakolakSceneFlow)).toBe('star>material>camera>closed-box-drop>lid-open');""",
    )
    replace_once(
        path,
        """  await page.screenshot({ path: 'web/preintro-05-unboxing-complete.png' });

  expect(await page.evaluate(() => document.body.dataset.yakolakTable)).toBe('approved-star-svg');""",
        """  await page.screenshot({ path: 'web/preintro-05-unboxing-complete.png' });

  const governedPhases = await page.evaluate(() => window.__yakolakPreIntroPhases || []);
  const phaseAt = state => governedPhases.find(entry => entry.state === state)?.at;
  const orderedStates = [
    'matched','star-to-3d','table-settling','camera-orbit',
    'camera-settled','box-closed-descending','box-closed-landed','complete'
  ];
  for (let index = 1; index < orderedStates.length; index += 1) {
    expect(phaseAt(orderedStates[index])).toBeGreaterThan(phaseAt(orderedStates[index - 1]));
  }
  expect(phaseAt('star-to-3d') - phaseAt('matched')).toBeGreaterThanOrEqual(210);
  expect(phaseAt('table-settling') - phaseAt('star-to-3d')).toBeGreaterThanOrEqual(920);
  expect(phaseAt('camera-orbit') - phaseAt('table-settling')).toBeGreaterThanOrEqual(250);
  expect(phaseAt('camera-settled') - phaseAt('camera-orbit')).toBeGreaterThanOrEqual(1180);
  expect(phaseAt('box-closed-descending') - phaseAt('camera-settled')).toBeGreaterThanOrEqual(170);
  expect(phaseAt('box-closed-landed') - phaseAt('box-closed-descending')).toBeGreaterThanOrEqual(1130);
  expect(phaseAt('complete') - phaseAt('box-closed-landed')).toBeGreaterThanOrEqual(360);

  expect(await page.evaluate(() => document.body.dataset.yakolakTable)).toBe('approved-star-svg');""",
    )
    replace_once(
        path,
        "  expect(events.join('\\n')).toContain('box=soft-staggered');",
        "  expect(events.join('\\n')).toContain('box=closed-rigid-drop lid=exit-only');",
    )


def rewrite_baseline() -> None:
    write(
        "scripts/check_approved_baseline.py",
        '''#!/usr/bin/env python3
"""Fail when the approved governed YAKOLAK intro contract regresses."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED: dict[str, tuple[str, ...]] = {
    "scripts/apply_web_loader.py": (
        "data-loader-source=\\\"v130-loading-star-motion\\\"",
        "--loading-background:#000000",
        "--loading-star:#ffffff",
        "--loading-shadow:#d7d9de",
        "--cycle:820ms",
        "animation:bounce var(--cycle) infinite",
        "animation:turn var(--cycle) linear infinite",
        "animation:shadow var(--cycle) infinite",
        "animation-play-state:paused",
        "translateY(36px) scale(1.17,.72)",
        "100%{transform:rotate(24deg)}",
        "transform:scale(1.30,1)",
        "path:not(.cls-1){fill:#000!important}",
        ".cls-1{fill:#fff!important}",
        "minimumLoaderMs=2600",
        "motionWarmupMs=260",
        "motionSettleMs=220",
        "minimum-gated-v1",
        "settleMotion",
        "white-to-material-crossfade",
        "canonical-zero-degree-shared-contour",
    ),
    "scripts/pre_intro_star_to_table.gd": (
        "MIN_MATCH_HOLD_MS: float = 260.0",
        "MIN_CLOSED_BOX_DROP_MS: float = 1200.0",
        "MIN_CLOSED_BOX_LANDED_HOLD_MS: float = 420.0",
        "MAX_TIMELINE_STEP_MS: float = 50.0",
        "governed_elapsed_ms",
        "ClosedBoxDropRoot",
        "node.reparent(closed_box_root, true)",
        "box-closed-descending",
        "box-closed-landed",
        "closed-rigid-body-drop",
        "present-during-drop-exit-only",
        "pixel-matched-governed-closed-box-v5",
    ),
    "scripts/pre_intro_refinement.gd": (
        "canonical-shared-svg",
        "direct-slow-safe-framed",
        "CAMERA_MOVE_MS: float = 1250.0",
        "pixel-matched-direct-slow-safe-framing-v7",
        "governed_elapsed_ms",
        "_apply_safe_optical_framing()",
    ),
    "tests/intro_smoke.spec.js": (
        "source: 'v130-loading-star-motion'",
        "bounceDuration: '0.82s'",
        "turnDuration: '0.82s'",
        "shadowDuration: '0.82s'",
        "hasInventedHorizontalMotion: false",
        "document.body.dataset.yakolakDuration)).toBe('5730')",
    ),
    "tests/pre_intro_smoke.spec.js": (
        "yakolakMatchErrorPx",
        "minimum-gated-v1",
        "box-closed-descending",
        "closed-rigid-body-drop",
        "present-during-drop-exit-only",
        "window.__yakolakPreIntroPhases",
        "settling','rested",
    ),
    "scripts/vercel-build.sh": (
        "npx playwright test tests/intro_smoke.spec.js",
        "YAKOLAK 3.6 passed governed loader and closed rigid box",
    ),
}

FORBIDDEN: dict[str, tuple[str, ...]] = {
    "scripts/apply_web_loader.py": (
        "translateX(",
        "rotate(-420deg)",
        "yakolakLoaderProgress",
        "loaderLogoMtkyf path{fill:#fff!important}",
    ),
    "scripts/pre_intro_star_to_table.gd": (
        "soft-staggered-fade",
        "node.transparency = 1.0",
        "BOX_START_SCALE",
        "box_final_poses",
    ),
    "scripts/pre_intro_refinement.gd": (
        "direction.normalized().slerp",
        "camera.position = start_position.lerp(end_position, t)",
        "pixel-matched-direct-slow-safe-framing-v6",
    ),
}


def main() -> int:
    failures: list[str] = []
    for relative_path, tokens in REQUIRED.items():
        path = ROOT / relative_path
        if not path.is_file():
            failures.append(f"missing required file: {relative_path}")
            continue
        text = path.read_text(encoding="utf-8")
        for token in tokens:
            if token not in text:
                failures.append(f"{relative_path}: missing approved token {token!r}")
    for relative_path, tokens in FORBIDDEN.items():
        path = ROOT / relative_path
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for token in tokens:
            if token in text:
                failures.append(f"{relative_path}: forbidden regressive token {token!r}")
    if failures:
        print("YAKOLAK APPROVED CONTRACT REGRESSION DETECTED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("YAKOLAK approved minimum-gated scene flow, professional star settle, closed rigid box drop, lid exit-only, and gameplay contract preserved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
''',
    )


def patch_build() -> None:
    path = "scripts/vercel-build.sh"
    text = read(path)
    text = text.replace(
        "Building YAKOLAK 3.5 — original MTKYF palette, gradual material bridge, slow camera, and soft box reveal",
        "Building YAKOLAK 3.6 — minimum-gated scenes, professional star settle, and closed rigid box drop",
    )
    text = text.replace("pixel-matched-soft-material-box-v4", "pixel-matched-governed-closed-box-v5")
    text = text.replace("soft-staggered-fade", "closed-rigid-body-drop")
    text = text.replace("pixel-matched-direct-slow-safe-framing-v6", "pixel-matched-direct-slow-safe-framing-v7")
    text = text.replace(
        'grep -q "materialBridgeDuration=1200" web/index.html',
        'grep -q "materialBridgeDuration=1200" web/index.html\n'
        'grep -q "minimumLoaderMs=2600" web/index.html\n'
        'grep -q "motionWarmupMs=260" web/index.html\n'
        'grep -q "motionSettleMs=220" web/index.html\n'
        'grep -q "minimum-gated-v1" web/index.html',
    )
    marker = 'grep -q "closed-rigid-body-drop" scripts/pre_intro_star_to_table.gd'
    if marker not in text:
        raise RuntimeError("scripts/vercel-build.sh: updated box grep marker missing")
    text = text.replace(
        marker,
        marker + '\n'
        'grep -q "ClosedBoxDropRoot" scripts/pre_intro_star_to_table.gd\n'
        'grep -q "node.reparent(closed_box_root, true)" scripts/pre_intro_star_to_table.gd\n'
        'grep -q "present-during-drop-exit-only" scripts/pre_intro_star_to_table.gd\n'
        'grep -q "governed_elapsed_ms" scripts/pre_intro_refinement.gd',
        1,
    )
    text = text.replace(
        "YAKOLAK 3.5 passed preserved loader geometry and original MTKYF black/white palette",
        "YAKOLAK 3.6 passed governed loader and closed rigid box with the original MTKYF palette",
    )
    text = text.replace(
        "YAKOLAK 3.5 passed gradual white-to-material bridge, slow safe camera framing, and soft staggered box reveal",
        "YAKOLAK 3.6 passed governed material/camera flow and one-piece closed-box sky drop before lid opening",
    )
    write(path, text)


def main() -> None:
    patch_loader()
    patch_preintro()
    patch_refinement()
    patch_tests()
    rewrite_baseline()
    patch_build()
    this_file = Path(__file__)
    this_file.unlink()
    print("YAKOLAK_GOVERNED_CLOSED_BOX_V36_APPLIED")


if __name__ == "__main__":
    main()
