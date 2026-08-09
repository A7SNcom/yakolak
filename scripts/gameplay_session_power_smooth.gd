extends "res://scripts/gameplay_session_efficient.gd"

# Smooth-power governor for production gameplay.
# Keep the renderer capped at the approved 60 fps so frame cadence never jumps
# between 30 and 60. When the board is genuinely static, let Godot's native
# low-processor mode sleep and redraw only when needed. Any input, tween,
# camera transition or piece motion wakes the engine immediately through the
# inherited full-rate checks.
const POWER_SMOOTH_FPS: int = 60
const POWER_IDLE_SLEEP_USEC: int = 6900


func _eff_apply_frame_budget(full_rate: bool) -> void:
	if Engine.max_fps != POWER_SMOOTH_FPS:
		Engine.max_fps = POWER_SMOOTH_FPS

	var low_power: bool = not full_rate
	if OS.low_processor_usage_mode != low_power:
		OS.low_processor_usage_mode = low_power
	if OS.low_processor_usage_mode_sleep_usec != POWER_IDLE_SLEEP_USEC:
		OS.low_processor_usage_mode_sleep_usec = POWER_IDLE_SLEEP_USEC

	var profile: int = 1 if full_rate else 0
	if profile == _eff_frame_profile:
		return
	_eff_frame_profile = profile
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakGameplayFrameBudget='" + ("motion-60" if full_rate else "idle-on-demand") + "';" +
			"document.body.dataset.yakolakGameplayPowerMode='" + ("awake" if full_rate else "low-processor") + "';" +
			"document.body.dataset.yakolakGameplayVisualQuality='unchanged';",
			true
		)
