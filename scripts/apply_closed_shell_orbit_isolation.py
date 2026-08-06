#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8', newline='\n')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:100]!r}')
    write(path, text.replace(old, new, 1))


PRE = 'scripts/pre_intro_star_to_table.gd'
INTRO = 'scripts/intro.gd'
TEST = 'tests/pre_intro_smoke.spec.js'

replace_once(PRE,
    'const MOTION_VERSION: String = "pixel-matched-governed-closed-box-v5"',
    'const MOTION_VERSION: String = "pixel-matched-closed-shell-orbit-isolated-v6"')

replace_once(PRE,
    'var closed_box_root: Node3D\nvar closed_box_landed: bool = false',
    'var closed_box_root: Node3D\nvar closed_box_landed: bool = false\nvar board_node: GeometryInstance3D\nvar lid_node: GeometryInstance3D\nvar interior_nodes: Array[GeometryInstance3D] = []')

replace_once(PRE,
'''\tvar board := intro.get_node_or_null("Board") as GeometryInstance3D
\tvar lid := intro.get_node_or_null("Lid") as GeometryInstance3D
\tif camera == null or tabletop == null or pedestal == null or board == null or lid == null or gameplay == null:
\t\treturn false

\tgame_nodes.clear()
\tgame_nodes.append(board)
\tgame_nodes.append(lid)''',
'''\tboard_node = intro.get_node_or_null("Board") as GeometryInstance3D
\tlid_node = intro.get_node_or_null("Lid") as GeometryInstance3D
\tif camera == null or tabletop == null or pedestal == null or board_node == null or lid_node == null or gameplay == null:
\t\treturn false

\tgame_nodes.clear()
\tinterior_nodes.clear()
\tgame_nodes.append(board_node)
\tgame_nodes.append(lid_node)''')

replace_once(PRE,
'''\t\tgame_nodes.append(base)
\tfor child: Node in intro.get_children():
\t\tif child is GeometryInstance3D and String(child.name).begins_with("Stone_"):
\t\t\tgame_nodes.append(child as GeometryInstance3D)''',
'''\t\tgame_nodes.append(base)
\t\tinterior_nodes.append(base)
\tfor child: Node in intro.get_children():
\t\tif child is GeometryInstance3D and String(child.name).begins_with("Stone_"):
\t\t\tvar stone := child as GeometryInstance3D
\t\t\tgame_nodes.append(stone)
\t\t\tinterior_nodes.append(stone)''')

replace_once(PRE,
'''\tfor node: GeometryInstance3D in game_nodes:
\t\tnode.visible = false
\ttabletop.visible = false''',
'''\tfor node: GeometryInstance3D in game_nodes:
\t\tnode.visible = false
\t\tnode.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
\ttabletop.visible = false''')

replace_once(PRE,
'''func _apply_table_and_camera(elapsed: float) -> void:
\tif elapsed <= MATCH_HOLD_MS:''',
'''func _apply_table_and_camera(elapsed: float) -> void:
\t# Hard isolation: no box, stones, bases or their shadows may enter the
\t# camera frustum during the top-to-final orbit.
\t_hide_orbit_geometry()
\tif elapsed <= MATCH_HOLD_MS:''')

replace_once(PRE,
'''\t\tvar pedestal_t: float = _smootherstep(clampf((t - 0.36) / 0.64, 0.0, 1.0))
\t\tpedestal.visible = pedestal_t > 0.001
\t\t_set_pedestal_growth(pedestal_t)
\t\tvar start_offset: Vector3 = match_camera_position - orbit_center''',
'''\t\t# The black pedestal previously crossed the moving camera for a few
\t\t# frames and looked like a duplicate mesh. Keep it fully absent until
\t\t# the camera is stationary.
\t\tpedestal.visible = false
\t\t_set_pedestal_growth(0.0)
\t\tvar start_offset: Vector3 = match_camera_position - orbit_center''')

replace_once(PRE,
'''\t\treturn

\t_snap_table_final()
\t_apply_final_camera()


func _apply_bridge_material''',
'''\t\treturn

\t# Reveal the support only after the camera has reached its final transform.
\t# This uses the governed camera hold and cannot contaminate the orbit.
\tvar support_end: float = orbit_end + CAMERA_HOLD_MS
\tif elapsed <= support_end:
\t\t_apply_final_camera()
\t\ttabletop.position = final_table_position
\t\ttabletop.quaternion = final_rotation
\t\ttabletop.scale = final_table_scale
\t\ttabletop.visible = true
\t\tvar support_t: float = _smootherstep((elapsed - orbit_end) / CAMERA_HOLD_MS)
\t\tpedestal.visible = support_t > 0.18
\t\t_set_pedestal_growth(support_t)
\t\treturn

\t_snap_table_final()
\t_apply_final_camera()


func _hide_orbit_geometry() -> void:
\tfor node: GeometryInstance3D in game_nodes:
\t\tnode.visible = false
\t\tnode.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _set_closed_shell_visibility() -> void:
\tfor node: GeometryInstance3D in game_nodes:
\t\tvar shell_part: bool = node == board_node or node == lid_node
\t\tnode.visible = shell_part
\t\tnode.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shell_part else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)


func _apply_bridge_material''')

replace_once(PRE,
'''\t# Timeline zero is the accepted fully closed product: board, lid, walls and
\t# contained stones are assembled before the entrance begins.
\tintro.call("_apply_timeline", 0.0)
\tintro.set("playing", false)
\tclosed_box_root = Node3D.new()
\tclosed_box_root.name = "ClosedBoxDropRoot"
\tintro.add_child(closed_box_root)
\tfor node: GeometryInstance3D in game_nodes:
\t\tnode.visible = true
\t\tnode.reparent(closed_box_root, true)''',
'''\t# Build a physically closed shell before the first visible drop frame.
\t# Internal bases/stones stay hidden and shadowless until the lid actually
\t# begins to rise in the original unboxing timeline.
\tintro.call("_apply_timeline", 0.0)
\tintro.set("playing", false)
\t_set_closed_shell_visibility()
\tclosed_box_root = Node3D.new()
\tclosed_box_root.name = "ClosedBoxDropRoot"
\tintro.add_child(closed_box_root)
\tfor node: GeometryInstance3D in game_nodes:
\t\tnode.reparent(closed_box_root, true)''')

replace_once(PRE,
'''\t\tfor node: GeometryInstance3D in game_nodes:
\t\t\tnode.reparent(intro, true)
\t\tclosed_box_root.queue_free()''',
'''\t\tfor node: GeometryInstance3D in game_nodes:
\t\t\tnode.reparent(intro, true)
\t\t_set_closed_shell_visibility()
\t\tclosed_box_root.queue_free()''')

replace_once(PRE,
'''func _snap_box_and_camera_final() -> void:
\t_apply_final_camera()
\t_snap_closed_box_landed()
\tfor node: GeometryInstance3D in game_nodes:
\t\tnode.visible = true''',
'''func _snap_box_and_camera_final() -> void:
\t_apply_final_camera()
\t_snap_closed_box_landed()
\t_set_closed_shell_visibility()''')

replace_once(PRE,
'''\tprint("YAKOLAK_PREINTRO_COMPLETE duration=%d motion=%s match=pixel-exact logo=wall camera=side box=closed-rigid-drop lid=exit-only" % [int(TOTAL_MS), MOTION_VERSION])''',
'''\tprint("YAKOLAK_PREINTRO_COMPLETE duration=%d motion=%s match=pixel-exact logo=wall camera=side box=closed-shell-only lid=exit-only orbit=isolated" % [int(TOTAL_MS), MOTION_VERSION])''')

replace_once(PRE,
'''\t\t"document.body.dataset.yakolakBoxLidPolicy='present-during-drop-exit-only';" +
\t\t"window.__yakolakPreIntroPhases''',
'''\t\t"document.body.dataset.yakolakBoxLidPolicy='present-during-drop-exit-only';" +
\t\t"document.body.dataset.yakolakClosedBoxVisibleParts='board,lid';" +
\t\t"document.body.dataset.yakolakInternalContentPolicy='hidden-until-lid-lift';" +
\t\t"document.body.dataset.yakolakOrbitIsolation='game-hidden-shadows-off-pedestal-delayed';" +
\t\t"window.__yakolakPreIntroPhases''')

# Original intro: keep contents hidden while the complete shell drops and while
# the lid shakes; reveal them only once the lid starts its upward motion.
replace_once(INTRO,
    'var published_stage: int = -1\nvar failed: bool = false',
    'var published_stage: int = -1\nvar failed: bool = false\nvar contents_revealed: bool = false')

replace_once(INTRO,
'''\tvar elapsed: float = float(Time.get_ticks_msec() - started_msec)
\t_apply_timeline(minf(elapsed, TOTAL_TIME))''',
'''\tvar elapsed: float = float(Time.get_ticks_msec() - started_msec)
\tif not contents_revealed and elapsed >= LID_SHAKE + 40.0:
\t\tcontents_revealed = true
\t\t_set_internal_visibility(true)
\t_apply_timeline(minf(elapsed, TOTAL_TIME))''')

replace_once(INTRO,
'''\tpublished_stage = -1
\tlid.visible = true
\t_apply_timeline(0.0)''',
'''\tpublished_stage = -1
\tcontents_revealed = false
\tboard.visible = true
\tlid.visible = true
\tboard.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
\tlid.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
\t_set_internal_visibility(false)
\t_apply_timeline(0.0)''')

replace_once(INTRO,
'''func _apply_timeline(elapsed: float) -> void:
\t_apply_pose(board, _base_final("board"))''',
'''func _set_internal_visibility(visible: bool) -> void:
\tfor direction: String in ORDER:
\t\tvar base := bases[direction] as GeometryInstance3D
\t\tbase.visible = visible
\t\tbase.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if visible else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)
\tfor piece: Dictionary in pieces:
\t\tvar stone := piece["mesh"] as GeometryInstance3D
\t\tstone.visible = visible
\t\tstone.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if visible else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)
\tif OS.has_feature("web"):
\t\tJavaScriptBridge.eval("document.body.dataset.yakolakIntroContents='" + ("visible-after-lid-lift" if visible else "hidden-inside-closed-shell") + "';", true)


func _apply_timeline(elapsed: float) -> void:
\t_apply_pose(board, _base_final("board"))''')

replace_once(INTRO,
'''func _snap_final() -> void:
\t_apply_pose(board, _base_final("board"))''',
'''func _snap_final() -> void:
\t_set_internal_visibility(true)
\t_apply_pose(board, _base_final("board"))''')

# Verification contract for both reported regressions.
replace_once(TEST,
'''  expect(await page.evaluate(() => document.body.dataset.yakolakBoxLidPolicy)).toBe('present-during-drop-exit-only');
  expect(await page.evaluate(() => document.body.dataset.yakolakSceneFlow)).toBe('star>material>camera>closed-box-drop>lid-open');''',
'''  expect(await page.evaluate(() => document.body.dataset.yakolakBoxLidPolicy)).toBe('present-during-drop-exit-only');
  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxVisibleParts)).toBe('board,lid');
  expect(await page.evaluate(() => document.body.dataset.yakolakInternalContentPolicy)).toBe('hidden-until-lid-lift');
  expect(await page.evaluate(() => document.body.dataset.yakolakOrbitIsolation)).toBe('game-hidden-shadows-off-pedestal-delayed');
  expect(await page.evaluate(() => document.body.dataset.yakolakSceneFlow)).toBe('star>material>camera>closed-box-drop>lid-open');''')

replace_once(TEST,
    "  expect(events.join('\\n')).toContain('box=closed-rigid-drop lid=exit-only');",
    "  expect(events.join('\\n')).toContain('box=closed-shell-only lid=exit-only orbit=isolated');")

print('YAKOLAK_CLOSED_SHELL_ORBIT_ISOLATION_APPLIED')
