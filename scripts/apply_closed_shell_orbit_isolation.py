#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8", newline="\n")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:140]!r}")
    write(path, text.replace(old, new, 1))


PREINTRO = "scripts/pre_intro_star_to_table.gd"
TEST = "tests/pre_intro_smoke.spec.js"

replace_once(
    PREINTRO,
    "var closed_box_root: Node3D\nvar closed_box_landed: bool = false\nvar board_node: GeometryInstance3D\n",
    "var closed_box_root: Node3D\nvar closed_box_landed: bool = false\nvar corrections_was_processing: bool = true\nvar closed_shell_local_transforms: Dictionary = {}\nvar board_node: GeometryInstance3D\n",
)

replace_once(
    PREINTRO,
    '''func _begin_closed_box_drop() -> void:\n\tbox_reveal_started = true\n\tclosed_box_landed = false\n\t_snap_table_final()\n\t_apply_final_camera()\n\t# Assemble the real closed box before its first visible drop frame:\n\t# board + four side bases/walls + lid. Only the 36 stones remain hidden.\n\tintro.call("_apply_timeline", 0.0)\n\tintro.set("playing", false)\n\t_set_closed_shell_visibility()\n\tclosed_box_root = Node3D.new()\n\tclosed_box_root.name = "ClosedBoxDropRoot"\n\tintro.add_child(closed_box_root)\n\tfor node: GeometryInstance3D in shell_nodes:\n\t\tnode.reparent(closed_box_root, true)\n\tprint("YAKOLAK_CLOSED_BOX_READY shell_parts=%d stones_hidden=%d assembly=prebuilt" % [shell_nodes.size(), interior_nodes.size()])\n\tclosed_box_root.position = Vector3(0.0, CLOSED_BOX_START_HEIGHT, 0.0)\n\tclosed_box_root.rotation = Vector3.ZERO\n\tclosed_box_root.scale = Vector3.ONE\n\t_publish_phase("box-closed-descending")\n\n\nfunc _apply_closed_box_drop(drop_elapsed: float) -> void:\n\tif closed_box_root == null or closed_box_landed:\n\t\treturn\n''',
    '''func _begin_closed_box_drop() -> void:\n\tbox_reveal_started = true\n\tclosed_box_landed = false\n\t_snap_table_final()\n\t_apply_final_camera()\n\t# The only source of truth for a closed box is the exact first frame of\n\t# the accepted unboxing timeline. ExistingIntroCorrections normally snaps\n\t# stopped scenes to the open gameplay layout, so suspend it before applying\n\t# timeline zero and keep it suspended for the whole rigid-body drop.\n\tintro.set("playing", false)\n\tcorrections_was_processing = corrections != null and corrections.is_processing()\n\tif corrections != null:\n\t\tcorrections.set_process(false)\n\tintro.call("_apply_timeline", 0.0)\n\t_set_closed_shell_visibility()\n\tclosed_box_root = Node3D.new()\n\tclosed_box_root.name = "ClosedBoxDropRoot"\n\tintro.add_child(closed_box_root)\n\tclosed_shell_local_transforms.clear()\n\tfor node: GeometryInstance3D in shell_nodes:\n\t\tnode.reparent(closed_box_root, true)\n\t\tclosed_shell_local_transforms[String(node.name)] = node.transform\n\tvar rigid: bool = _closed_shell_is_rigid()\n\tif not rigid:\n\t\tpush_error("Closed box lost its timeline-zero pose before the first drop frame")\n\t\t_publish_web_state("error")\n\tprint("YAKOLAK_CLOSED_BOX_POSE_LOCK source=intro-timeline-zero corrections=suspended shell_parts=%d stones_hidden=%d rigid=%s" % [shell_nodes.size(), interior_nodes.size(), str(rigid).to_lower()])\n\tclosed_box_root.position = Vector3(0.0, CLOSED_BOX_START_HEIGHT, 0.0)\n\tclosed_box_root.rotation = Vector3.ZERO\n\tclosed_box_root.scale = Vector3.ONE\n\t_publish_phase("box-closed-descending")\n\n\nfunc _closed_shell_is_rigid() -> bool:\n\tif closed_shell_local_transforms.size() != shell_nodes.size():\n\t\treturn false\n\tfor node: GeometryInstance3D in shell_nodes:\n\t\tvar key: String = String(node.name)\n\t\tif not closed_shell_local_transforms.has(key):\n\t\t\treturn false\n\t\tvar reference: Transform3D = closed_shell_local_transforms[key]\n\t\tif not node.transform.is_equal_approx(reference):\n\t\t\treturn false\n\treturn true\n\n\nfunc _apply_closed_box_drop(drop_elapsed: float) -> void:\n\tif closed_box_root == null or closed_box_landed:\n\t\treturn\n\tif not _closed_shell_is_rigid():\n\t\tpush_error("A closed-box part moved independently during the drop")\n\t\t_publish_web_state("error")\n\t\treturn\n''',
)

replace_once(
    PREINTRO,
    '''\tprint("YAKOLAK_PREINTRO_COMPLETE duration=%d motion=%s match=pixel-exact logo=wall camera=side box=closed-six-part-shell lid=exit-only orbit=isolated" % [int(TOTAL_MS), MOTION_VERSION])\n\tintro.call("_restart_intro")\n\tset_process(false)\n''',
    '''\tprint("YAKOLAK_PREINTRO_COMPLETE duration=%d motion=%s match=pixel-exact logo=wall camera=side box=timeline-zero-locked lid=exit-only orbit=isolated" % [int(TOTAL_MS), MOTION_VERSION])\n\t# Start the real unboxing at its own frame zero before allowing the correction\n\t# pass to write transforms again. This removes the broken open->close jump.\n\tintro.call("_restart_intro")\n\tif corrections != null:\n\t\tcorrections.set_process(corrections_was_processing)\n\tif OS.has_feature("web"):\n\t\tJavaScriptBridge.eval("document.body.dataset.yakolakClosedBoxCorrections='restored-for-unboxing';", true)\n\tprint("YAKOLAK_CLOSED_BOX_POSE_LOCK_RELEASED corrections=restored-after-intro-zero")\n\tset_process(false)\n''',
)

replace_once(
    PREINTRO,
    '''\t\t"document.body.dataset.yakolakClosedBoxAssembly='prebuilt-before-first-drop-frame';" +\n\t\t"document.body.dataset.yakolakInternalContentPolicy='stones-hidden-until-lid-lift';" +\n''',
    '''\t\t"document.body.dataset.yakolakClosedBoxAssembly='prebuilt-before-first-drop-frame';" +\n\t\t"document.body.dataset.yakolakClosedBoxPoseSource='intro-timeline-zero';" +\n\t\t"document.body.dataset.yakolakClosedBoxCorrections='suspended-during-drop';" +\n\t\t"document.body.dataset.yakolakClosedBoxRigidity='locked-local-transforms';" +\n\t\t"document.body.dataset.yakolakInternalContentPolicy='stones-hidden-until-lid-lift';" +\n''',
)

replace_once(
    TEST,
    '''  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxAssembly)).toBe('prebuilt-before-first-drop-frame');\n  expect(await page.evaluate(() => document.body.dataset.yakolakInternalContentPolicy)).toBe('stones-hidden-until-lid-lift');\n  expect(events.join('\\n')).toContain('YAKOLAK_CLOSED_BOX_READY shell_parts=6 stones_hidden=36 assembly=prebuilt');\n''',
    '''  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxAssembly)).toBe('prebuilt-before-first-drop-frame');\n  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxPoseSource)).toBe('intro-timeline-zero');\n  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxCorrections)).toBe('suspended-during-drop');\n  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxRigidity)).toBe('locked-local-transforms');\n  expect(await page.evaluate(() => document.body.dataset.yakolakInternalContentPolicy)).toBe('stones-hidden-until-lid-lift');\n  expect(events.join('\\n')).toContain('YAKOLAK_CLOSED_BOX_POSE_LOCK source=intro-timeline-zero corrections=suspended shell_parts=6 stones_hidden=36 rigid=true');\n''',
)

replace_once(
    TEST,
    "  expect(events.join('\\n')).toContain('box=closed-six-part-shell lid=exit-only orbit=isolated');\n",
    "  expect(events.join('\\n')).toContain('box=timeline-zero-locked lid=exit-only orbit=isolated');\n  expect(events.join('\\n')).toContain('YAKOLAK_CLOSED_BOX_POSE_LOCK_RELEASED corrections=restored-after-intro-zero');\n  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxCorrections)).toBe('restored-for-unboxing');\n",
)

print("YAKOLAK_TIMELINE_ZERO_CLOSED_BOX_LOCK_APPLIED")
