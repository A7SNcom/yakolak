extends AudioStreamPlayer

# The song is embedded in the exported PCK and preloaded with the scene, so
# playback never depends on a second network request after the game starts.
const SONG: AudioStream = preload("res://assets/fonts/song.mp3")


func _ready() -> void:
	stream = SONG
	volume_db = -6.0
	finished.connect(_restart_song)
	_publish_music_state("loaded")
	play()
	_publish_music_state("playing")


func _unhandled_input(event: InputEvent) -> void:
	# Browsers may keep WebAudio suspended until the first user gesture. Godot
	# resumes its audio context on interaction; retry playback if needed.
	if (event is InputEventScreenTouch and event.pressed) or (event is InputEventMouseButton and event.pressed) or (event is InputEventKey and event.pressed):
		if not playing:
			play()
			_publish_music_state("playing")


func _restart_song() -> void:
	play()
	_publish_music_state("playing")


func _publish_music_state(state: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakMusic='" + state + "';", true)
