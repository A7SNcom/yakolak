extends Node

# Routes only the online room endpoint through the observed server wrapper.
# Installed before TelemetryMonitor so the browser recorder still sees the
# public /api/rooms URL while the actual network call is audited server-side.

func _ready() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"""
(() => {
  if (window.__yakolakRoomsObserverRouteInstalled) return;
  window.__yakolakRoomsObserverRouteInstalled = true;
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
