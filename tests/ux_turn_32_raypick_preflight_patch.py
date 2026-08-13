from pathlib import Path
import re

BRIDGE = Path("scripts/browser_verification_bridge.gd")
text = BRIDGE.read_text(encoding="utf-8")

old_pattern = re.compile(
    r'''\tvar records: Array = records_value as Array\n\tvar direction: String = str\(match_controller.call\("_current_direction"\)\)\n\tvar viewport_size: Vector2 = get_viewport\(\).get_visible_rect\(\).size\n\tvar center: Vector2 = viewport_size \* 0\.5\n\tvar best_index: int = -1\n\tvar best_point: Vector2 = Vector2\.ZERO\n\tvar best_size: String = ""\n\tvar best_distance: float = INF\n\n\tfor index: int in range\(records.size\(\)\):\n.*?\t\t\tbest_size = size_name\n''',
    re.S,
)

replacement = '''\tvar records: Array = records_value as Array
\tvar direction: String = str(match_controller.call("_current_direction"))
\tvar viewport_size: Vector2 = get_viewport().get_visible_rect().size
\tvar center: Vector2 = viewport_size * 0.5
\tvar best_index: int = -1
\tvar best_point: Vector2 = Vector2.ZERO
\tvar best_size: String = ""
\tvar best_distance: float = INF

\t# Do not guess a clickable coordinate. Probe candidate screen points through
\t# the exact production ray picker first, and dispatch only a point already
\t# proven to hit an unplayed legal piece owned by the authoritative player.
\tfor index: int in range(records.size()):
\t\tvar record: Dictionary = records[index] as Dictionary
\t\tif bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
\t\t\tcontinue
\t\tvar mesh_instance := record.get("mesh") as MeshInstance3D
\t\tif mesh_instance == null:
\t\t\tcontinue
\t\tvar radius: float = 8.0
\t\tmatch str(record.get("type", "")):
\t\t\t"large": radius = 17.0
\t\t\t"medium": radius = 12.5
\t\t\t_: radius = 8.0
\t\tvar offsets: Array[Vector3] = [
\t\t\tVector3.ZERO,
\t\t\tVector3(radius, 0.0, 0.0), Vector3(-radius, 0.0, 0.0),
\t\t\tVector3(0.0, 0.0, radius), Vector3(0.0, 0.0, -radius),
\t\t\tVector3(radius * 0.72, 0.0, radius * 0.55),
\t\t\tVector3(-radius * 0.72, 0.0, radius * 0.55),
\t\t\tVector3(radius * 0.72, 0.0, -radius * 0.55),
\t\t\tVector3(-radius * 0.72, 0.0, -radius * 0.55),
\t\t]
\t\tfor offset: Vector3 in offsets:
\t\t\tvar point: Vector2 = camera.unproject_position(mesh_instance.to_global(offset))
\t\t\tif point.x < 0.0 or point.x > viewport_size.x or point.y < 0.0 or point.y > viewport_size.y:
\t\t\t\tcontinue
\t\t\tvar hit_value: Variant = match_controller.call("_ray_pick", point, 1)
\t\t\tif not hit_value is Dictionary:
\t\t\t\tcontinue
\t\t\tvar hit: Dictionary = hit_value as Dictionary
\t\t\tvar collider: Object = hit.get("collider") as Object
\t\t\tif collider == null or not collider.has_meta("piece_index"):
\t\t\t\tcontinue
\t\t\tvar hit_index: int = int(collider.get_meta("piece_index"))
\t\t\tif hit_index < 0 or hit_index >= records.size():
\t\t\t\tcontinue
\t\t\tvar hit_record: Dictionary = records[hit_index] as Dictionary
\t\t\tif bool(hit_record.get("played", false)) or str(hit_record.get("dir", "")) != direction:
\t\t\t\tcontinue
\t\t\tvar hit_size: String = str(hit_record.get("type", ""))
\t\t\tif not bool(match_controller.call("_has_legal_cell_for_size", hit_size)):
\t\t\t\tcontinue
\t\t\tvar distance: float = point.distance_squared_to(center)
\t\t\tif distance < best_distance:
\t\t\t\tbest_distance = distance
\t\t\t\tbest_index = hit_index
\t\t\t\tbest_point = point
\t\t\t\tbest_size = hit_size
'''

text, count = old_pattern.subn(lambda _m: replacement, text, count=1)
if count != 1:
    raise SystemExit("UX-TURN-32 ray-pick preflight anchor missing")

text = text.replace(
    '\tresult["selectedBefore"] = selected_before\n',
    '\tresult["selectedBefore"] = selected_before\n\tresult["preflightRayHit"] = true\n',
    1,
)
BRIDGE.write_text(text, encoding="utf-8")
print("YAKOLAK_UX_TURN_32_RAYPICK_PREFLIGHT_PATCH_OK")
