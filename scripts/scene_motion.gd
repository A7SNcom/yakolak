extends RefCounted

# Shared presentation mechanics, never game authority. Retarget from the actual
# visible pose; duplicate state updates must not restart an in-flight motion.
const SKY_HEIGHT := 45.0
var owner: Node
var flights: Dictionary = {}
var colors: Dictionary = {}

func _init(node: Node) -> void:
	owner = node

func cancel() -> void:
	cancel_flights()
	for state: Dictionary in colors.values():
		if state.tween.is_valid(): state.tween.kill()
	colors.clear()

func cancel_flight(node: Node3D) -> void:
	var key := node.get_instance_id()
	if flights.has(key) and flights[key].tween.is_valid(): flights[key].tween.kill()
	flights.erase(key)

func cancel_flights() -> void:
	for state: Dictionary in flights.values():
		if state.tween.is_valid(): state.tween.kill()
	flights.clear()

func present(node: Node3D, enabled: bool, home: Transform3D, seconds: float) -> void:
	var key := node.get_instance_id()
	if flights.has(key):
		if bool(flights[key].enabled) == enabled: return
	elif node.visible == enabled:
		return
	if enabled:
		travel(node, home, seconds)
	else:
		var sky := node.transform
		sky.origin.y = maxf(sky.origin.y, home.origin.y + SKY_HEIGHT)
		_fly(node, sky, seconds, 0.0, 0.0, false)

func travel(node: Node3D, target: Transform3D, seconds: float, delay: float = 0.0, lift: float = 0.0) -> void:
	var key := node.get_instance_id()
	if flights.has(key) and bool(flights[key].enabled) and (flights[key].target as Transform3D).is_equal_approx(target): return
	if not node.visible:
		node.transform = target
		node.position.y += SKY_HEIGHT
		node.show() # Above the shot, never on the table on the first visible frame.
	if node.transform.is_equal_approx(target) and not flights.has(key): return
	_fly(node, target, seconds, delay, lift, true)

func _fly(node: Node3D, target: Transform3D, seconds: float, delay: float, lift: float, enabled: bool) -> void:
	var key := node.get_instance_id()
	if flights.has(key) and flights[key].tween.is_valid(): flights[key].tween.kill()
	if seconds <= 0.0:
		node.transform = target
		node.visible = enabled
		flights.erase(key)
		return
	var from := node.transform
	var tween := owner.create_tween()
	flights[key] = {"tween":tween,"target":target,"enabled":enabled}
	if delay > 0.0 and seconds > 0.0: tween.tween_interval(delay)
	tween.tween_method(func(t: float) -> void:
		if not is_instance_valid(node): return
		node.transform = from.interpolate_with(target,t)
		node.position.y += sin(t*PI)*lift
	,0.0,1.0,seconds).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_callback(func() -> void:
		if is_instance_valid(node):
			node.transform = target
			node.visible = enabled
		flights.erase(key)
	)

func tint(node: GeometryInstance3D, source: Material, target: Color, seconds: float, final_material: Material = null) -> void:
	if not source is BaseMaterial3D: return
	var key := node.get_instance_id()
	if colors.has(key) and colors[key].target.is_equal_approx(target) and node.material_override == colors[key].material: return
	if colors.has(key) and colors[key].tween.is_valid(): colors[key].tween.kill()
	var current := (node.material_override as BaseMaterial3D).albedo_color if node.material_override is BaseMaterial3D else (source as BaseMaterial3D).albedo_color
	if seconds <= 0.0:
		node.material_override = final_material if final_material != null else source.duplicate()
		(node.material_override as BaseMaterial3D).albedo_color = target
		colors.erase(key)
		return
	if current.is_equal_approx(target):
		if final_material != null: node.material_override = final_material
		colors.erase(key)
		return
	var material := source.duplicate() as BaseMaterial3D
	material.albedo_color = current
	if current.a < 0.999 or target.a < 0.999: material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	node.material_override = material
	var tween := owner.create_tween()
	colors[key] = {"tween":tween,"target":target,"material":material}
	tween.tween_property(material,"albedo_color",target,seconds).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_callback(func() -> void:
		# A later selection/victory may have taken over this mesh meanwhile.
		if is_instance_valid(node) and node.material_override == material and final_material != null: node.material_override = final_material
		colors.erase(key)
	)
