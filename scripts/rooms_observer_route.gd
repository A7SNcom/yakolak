extends Node

# Routes only the online room endpoint through the observed server wrapper.
# Installed before TelemetryMonitor so the browser recorder still sees the
# public /api/rooms URL while the actual network call is audited server-side.
# It also gives first-time invite links a harmless empty identity object so
# OnlineSession never asks Godot to parse an empty string as JSON.

func _ready() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"""
(() => {
  if (window.__yakolakRoomsObserverRouteInstalled) return;
  window.__yakolakRoomsObserverRouteInstalled = true;

  // A fresh guest has a ?room=XX URL but no saved identity yet. The online
  // session intentionally falls through to preview/join when the object has no
  // token/seat; storing {} only prevents JSON.parse_string('') from producing
  // a noisy Godot error before that normal flow begins.
  try {
    const rawRoom = String(new URL(location.href).searchParams.get('room') || '');
    const room = Array.from(rawRoom).filter(ch => ch >= '0' && ch <= '9').join('').slice(0, 2);
    if (room.length === 2) {
      const key = 'yakolak-online:' + room;
      if (!sessionStorage.getItem(key) && !localStorage.getItem(key)) {
        sessionStorage.setItem(key, '{}');
      }
    }
  } catch (_) {}

  const previousFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    try {
      const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input && input.url || '');
      const url = new URL(raw, location.href);
      if (url.origin === location.origin && url.pathname === '/api/rooms') {
        url.pathname = '/api/rooms-observed';
        if (input instanceof Request) {
          return previousFetch(new Request(url.toString(), input), init);
        }
        return previousFetch(url.toString(), init);
      }
    } catch (_) {}
    return previousFetch(input, init);
  };
})();
""",
		true
	)
