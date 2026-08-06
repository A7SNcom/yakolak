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
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


PREINTRO = "scripts/pre_intro_star_to_table.gd"
INTRO = "scripts/intro.gd"
TEST = "tests/pre_intro_smoke.spec.js"

replace_once(
    PREINTRO,
    "var board_node: GeometryInstance3D\nvar lid_node: GeometryInstance3D\nvar interior_nodes: Array[GeometryInstance3D] = []\n",
    "var board_node: GeometryInstance3D\nvar lid_node: GeometryInstance3D\n# The physical closed box is exactly six visible parts: floor, four side walls, and lid.\nvar shell_nodes: Array[GeometryInstance3D] = []\n# Only the 36 stones are internal content; the four side bases are box walls.\nvar interior_nodes: Array[GeometryInstance3D] = []\n",
)

replace_once(
    PREINTRO,
    '''\tgame_nodes.clear()\n\tinterior_nodes.clear()\n\tgame_nodes.append(board_node)\n\tgame_nodes.append(lid_node)\n\tfor direction: String in ["right", "left", "front", "back"]:\n\t\tvar base := intro.get_node_or_null("Base_%s" % direction) as GeometryInstance3D\n\t\tif base == null:\n\t\t\treturn false\n\t\tgame_nodes.append(base)\n\t\tinterior_nodes.append(base)\n\tfor child: Node in intro.get_children():\n\t\tif child is GeometryInstance3D and String(child.name).begins_with("Stone_"):\n\t\t\tvar stone := child as GeometryInstance3D\n\t\t\tgame_nodes.append(stone)\n\t\t\tinterior_nodes.append(stone)\n\tif game_nodes.size() != 42:\n\t\treturn false\n''',
    '''\tgame_nodes.clear()\n\tshell_nodes.clear()\n\tinterior_nodes.clear()\n\tgame_nodes.append(board_node)\n\tgame_nodes.append(lid_node)\n\tshell_nodes.append(board_node)\n\tshell_nodes.append(lid_node)\n\tfor direction: String in ["right", "left", "front", "back"]:\n\t\tvar base := intro.get_node_or_null("Base_%s" % direction) as GeometryInstance3D\n\t\tif base == null:\n\t\t\treturn false\n\t\tgame_nodes.append(base)\n\t\tshell_nodes.append(base)\n\tfor child: Node in intro.get_children():\n\t\tif child is GeometryInstance3D and String(child.name).begins_with("Stone_"):\n\t\t\tvar stone := child as GeometryInstance3D\n\t\t\tgame_nodes.append(stone)\n\t\t\tinterior_nodes.append(stone)\n\tif game_nodes.size() != 42 or shell_nodes.size() != 6 or interior_nodes.size() != 36:\n\t\treturn false\n''',
)

replace_once(
    PREINTRO,
    '''func _set_closed_shell_visibility() -> void:\n\tfor node: GeometryInstance3D in game_nodes:\n\t\tvar shell_part: bool = node == board_node or node == lid_node\n\t\tnode.visible = shell_part\n\t\tnode.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shell_part else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)\n''',
    '''func _set_closed_shell_visibility() -> void:\n\tfor node: GeometryInstance3D in game_nodes:\n\t\tvar shell_part: bool = node in shell_nodes\n\t\tnode.visible = shell_part\n\t\tnode.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shell_part else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)\n''',
)

replace_once(
    PREINTRO,
    '''\t# Build a physically closed shell before the first visible drop frame.\n\t# Internal bases/stones stay hidden and shadowless until the lid actually\n\t# begins to rise in the original unboxing timeline.\n\tintro.call("_apply_timeline", 0.0)\n\tintro.set("playing", false)\n\t_set_closed_shell_visibility()\n\tclosed_box_root = Node3D.new()\n\tclosed_box_root.name = "ClosedBoxDropRoot"\n\tintro.add_child(closed_box_root)\n\tfor node: GeometryInstance3D in game_nodes:\n\t\tnode.reparent(closed_box_root, true)\n''',
    '''\t# Assemble the real closed box before its first visible drop frame:\n\t# board + four side bases/walls + lid. Only the 36 stones remain hidden.\n\tintro.call("_apply_timeline", 0.0)\n\tintro.set("playing", false)\n\t_set_closed_shell_visibility()\n\tclosed_box_root = Node3D.new()\n\tclosed_box_root.name = "ClosedBoxDropRoot"\n\tintro.add_child(closed_box_root)\n\tfor node: GeometryInstance3D in shell_nodes:\n\t\tnode.reparent(closed_box_root, true)\n\tprint("YAKOLAK_CLOSED_BOX_READY shell_parts=%d stones_hidden=%d assembly=prebuilt" % [shell_nodes.size(), interior_nodes.size()])\n''',
)

replace_once(
    PREINTRO,
    '''\tif closed_box_root != null:\n\t\tclosed_box_root.position = Vector3.ZERO\n\t\tfor node: GeometryInstance3D in game_nodes:\n\t\t\tnode.reparent(intro, true)\n\t\t_set_closed_shell_visibility()\n''',
    '''\tif closed_box_root != null:\n\t\tclosed_box_root.position = Vector3.ZERO\n\t\tfor node: GeometryInstance3D in shell_nodes:\n\t\t\tnode.reparent(intro, true)\n\t\t_set_closed_shell_visibility()\n''',
)

replace_once(
    PREINTRO,
    'print("YAKOLAK_PREINTRO_COMPLETE duration=%d motion=%s match=pixel-exact logo=wall camera=side box=closed-shell-only lid=exit-only orbit=isolated" % [int(TOTAL_MS), MOTION_VERSION])',
    'print("YAKOLAK_PREINTRO_COMPLETE duration=%d motion=%s match=pixel-exact logo=wall camera=side box=closed-six-part-shell lid=exit-only orbit=isolated" % [int(TOTAL_MS), MOTION_VERSION])',
)

replace_once(
    PREINTRO,
    '''\t\t"document.body.dataset.yakolakClosedBoxVisibleParts='board,lid';" +\n\t\t"document.body.dataset.yakolakInternalContentPolicy='hidden-until-lid-lift';" +\n''',
    '''\t\t"document.body.dataset.yakolakClosedBoxVisibleParts='board,base-right,base-left,base-front,base-back,lid';" +\n\t\t"document.body.dataset.yakolakClosedBoxShellCount='6';" +\n\t\t"document.body.dataset.yakolakClosedBoxAssembly='prebuilt-before-first-drop-frame';" +\n\t\t"document.body.dataset.yakolakInternalContentPolicy='stones-hidden-until-lid-lift';" +\n''',
)

replace_once(
    INTRO,
    '''func _set_internal_visibility(visible: bool) -> void:\n\tfor direction: String in ORDER:\n\t\tvar base := bases[direction] as GeometryInstance3D\n\t\tbase.visible = visible\n\t\tbase.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if visible else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)\n\tfor piece: Dictionary in pieces:\n\t\tvar stone := piece["mesh"] as GeometryInstance3D\n\t\tstone.visible = visible\n\t\tstone.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if visible else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)\n\tif OS.has_feature("web"):\n\t\tJavaScriptBridge.eval("document.body.dataset.yakolakIntroContents='" + ("visible-after-lid-lift" if visible else "hidden-inside-closed-shell") + "';", true)\n''',
    '''func _set_internal_visibility(visible: bool) -> void:\n\t# The four bases are structural side walls of the closed box and must never\n\t# be hidden or spawned later. Only stones are delayed until the lid rises.\n\tfor direction: String in ORDER:\n\t\tvar base := bases[direction] as GeometryInstance3D\n\t\tbase.visible = true\n\t\tbase.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON\n\tfor piece: Dictionary in pieces:\n\t\tvar stone := piece["mesh"] as GeometryInstance3D\n\t\tstone.visible = visible\n\t\tstone.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if visible else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)\n\tif OS.has_feature("web"):\n\t\tJavaScriptBridge.eval("document.body.dataset.yakolakIntroContents='" + ("stones-visible-after-lid-lift" if visible else "stones-hidden-inside-six-part-shell") + "';", true)\n''',
)

replace_once(
    TEST,
    "  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxVisibleParts)).toBe('board,lid');\n  expect(await page.evaluate(() => document.body.dataset.yakolakInternalContentPolicy)).toBe('hidden-until-lid-lift');\n",
    "  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxVisibleParts)).toBe('board,base-right,base-left,base-front,base-back,lid');\n  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxShellCount)).toBe('6');\n  expect(await page.evaluate(() => document.body.dataset.yakolakClosedBoxAssembly)).toBe('prebuilt-before-first-drop-frame');\n  expect(await page.evaluate(() => document.body.dataset.yakolakInternalContentPolicy)).toBe('stones-hidden-until-lid-lift');\n  expect(events.join('\\n')).toContain('YAKOLAK_CLOSED_BOX_READY shell_parts=6 stones_hidden=36 assembly=prebuilt');\n  await page.screenshot({ path: 'web/preintro-05-closed-six-part-box-drop.png' });\n",
)

replace_once(
    TEST,
    "  expect(events.join('\\n')).toContain('box=closed-shell-only lid=exit-only orbit=isolated');\n",
    "  expect(events.join('\\n')).toContain('box=closed-six-part-shell lid=exit-only orbit=isolated');\n",
)

print("YAKOLAK_SIX_PART_CLOSED_BOX_FIX_APPLIED")
