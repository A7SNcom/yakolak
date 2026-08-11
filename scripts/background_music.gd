extends AudioStreamPlayer

const SONG_PATH: String = "res://assets/fonts/song.mp3"
var song_resource: AudioStream


func _ready() -> void:
	# Headless sessions have no audible output. Creating an MP3 playback object in
	# that backend makes it process-owned until AudioServer shutdown, which turns
	# an otherwise clean gameplay lifecycle test into an exit-time false leak.
	if DisplayServer.get_name() == "headless":
		print("YAKOLAK_BACKGROUND_MUSIC_HEADLESS_SKIPPED")
		return

	# The resource is packaged inside the Godot export/PCK; load it only for a
	# display-backed runtime so headless gameplay tests never create audio refs.
	song_resource = load(SONG_PATH) as AudioStream
	if song_resource == null:
		push_error("YAKOLAK_BACKGROUND_MUSIC_LOAD_FAILED")
		return
	stream = song_resource
	volume_db = -6.0
	finished.connect(_restart_song)
	_publish_music_state("loaded")
	play()
	_publish_music_state("playing")


func _exit_tree() -> void:
	if finished.is_connected(_restart_song):
		finished.disconnect(_restart_song)
	stop()
	stream = null
	song_resource = null


func _unhandled_input(event: InputEvent) -> void:
	# Browsers may keep WebAudio suspended until the first user gesture. Godot
	# resumes its audio context on interaction; retry playback if needed.
	if (event is InputEventScreenTouch and event.pressed) or (event is InputEventMouseButton and event.pressed) or (event is InputEventKey and event.pressed):
		if stream != null and not playing:
			play()
			_publish_music_state("playing")


func _restart_song() -> void:
	if stream == null:
		return
	play()
	_publish_music_state("playing")


func _publish_music_state(state: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakMusic='" + state + "';", true)
