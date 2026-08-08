extends Node

# Godot/WebAssembly can report failures only through console.error/warn instead
# of window.onerror. Capture those channels after the black-box recorder exists.

func _ready() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"""
(() => {
  if (window.__yakolakConsoleCaptureInstalled) return;
  window.__yakolakConsoleCaptureInstalled = true;

  const describe = value => {
    try {
      if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack || '' };
      if (typeof value === 'object') return JSON.parse(JSON.stringify(value));
      return String(value).slice(0, 1600);
    } catch (_) {
      return String(value).slice(0, 1600);
    }
  };
  const emit = (eventName, level, args) => {
    try {
      if (typeof window.yakolakTelemetry === 'function') {
        window.yakolakTelemetry(eventName, level, { args: args.slice(0, 12).map(describe) }, { source: 'browser' });
      }
    } catch (_) {}
  };

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalLog = console.log.bind(console);

  console.error = (...args) => {
    emit('browser.console.error', 'error', args);
    return originalError(...args);
  };
  console.warn = (...args) => {
    emit('browser.console.warn', 'warn', args);
    return originalWarn(...args);
  };
  console.log = (...args) => {
    try {
      const text = args.map(value => typeof value === 'string' ? value : '').join(' ');
      if (/YAKOLAK|Godot|WebGL|WASM/i.test(text)) emit('browser.console.runtime', 'debug', args);
    } catch (_) {}
    return originalLog(...args);
  };
})();
""",
		true
	)
