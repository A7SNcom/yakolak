extends Node

# Browser-side black box recorder. It watches the online transport, every
# YAKOLAK state attribute, browser/runtime errors, lifecycle changes, long
# stalls and player pointer actions. Telemetry is diagnostic only: failure of
# this recorder can never block gameplay. Secrets/tokens are redacted twice,
# once here and again on the server.

func _ready() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(_monitor_script(), true)


func _monitor_script() -> String:
	return """
(() => {
  if (window.__yakolakTelemetryInstalled) return;
  window.__yakolakTelemetryInstalled = true;

  const originalFetch = window.fetch.bind(window);
  const params = new URL(location.href).searchParams;
  const NETWORK_ENABLED = params.get('yakolakTestFast') !== '1' || params.get('yakolakTelemetryTest') === '1';
  const TRACE_KEY = 'yakolak-telemetry-trace-v1';
  const REDACT = /(token|authorization|cookie|secret|password|credential|auth|hash)/i;
  const nowIso = () => new Date().toISOString();
  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  let traceId = '';
  try { traceId = sessionStorage.getItem(TRACE_KEY) || ''; } catch (_) {}
  if (!traceId) {
    traceId = makeId();
    try { sessionStorage.setItem(TRACE_KEY, traceId); } catch (_) {}
  }
  window.__yakolakTraceId = traceId;
  document.body.dataset.yakolakTraceId = traceId;
  document.body.dataset.yakolakTelemetryMode = NETWORK_ENABLED ? 'live' : 'test-local-only';

  let sequence = 0;
  let queue = [];
  let flushing = false;
  let context = { room: '', seat: '' };
  let lastState = '';
  let dropped = 0;

  const roomFromUrl = () => {
    try { return (new URL(location.href).searchParams.get('room') || '').replace(/[^0-9]/g, '').slice(0, 2); }
    catch (_) { return ''; }
  };
  context.room = roomFromUrl();

  const cleanText = value => Array.from(String(value)).filter(character => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('').slice(0, 1200);

  const clean = (value, depth = 0) => {
    if (depth > 5) return '[depth-limit]';
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return cleanText(value);
    if (Array.isArray(value)) return value.slice(0, 64).map(item => clean(item, depth + 1));
    if (typeof value === 'object') {
      const out = {};
      for (const [key, item] of Object.entries(value).slice(0, 80)) {
        out[key] = REDACT.test(key) ? '[redacted]' : clean(item, depth + 1);
      }
      return out;
    }
    return cleanText(value);
  };

  const absorbRoom = payload => {
    try {
      if (payload && payload.room && /^[0-9]{2}$/.test(String(payload.room.code || ''))) context.room = String(payload.room.code);
      if (payload && /^p[1-4]$/.test(String(payload.seat || ''))) context.seat = String(payload.seat);
    } catch (_) {}
  };

  const record = (eventName, level = 'info', details = {}, extra = {}) => {
    try {
      absorbRoom(details && details.response);
      const event = {
        eventId: makeId(),
        occurredAt: nowIso(),
        traceId,
        requestId: extra.requestId || details.requestId || '',
        roomCode: extra.roomCode || context.room || roomFromUrl(),
        seat: extra.seat || context.seat || '',
        source: extra.source || 'browser',
        level,
        eventName,
        roomVersion: extra.roomVersion ?? details.roomVersion ?? null,
        roundNumber: extra.roundNumber ?? details.roundNumber ?? null,
        moveNumber: extra.moveNumber ?? details.moveNumber ?? null,
        details: clean(details),
      };
      queue.push(event);
      if (queue.length > 240) {
        const excess = queue.length - 240;
        queue.splice(0, excess);
        dropped += excess;
      }
      if (NETWORK_ENABLED && queue.length >= 12) void flush(false);
    } catch (_) {}
  };
  window.yakolakTelemetry = record;

  const flush = async (beacon = false) => {
    if (flushing || queue.length === 0) return;
    if (!NETWORK_ENABLED) {
      queue = queue.slice(-240);
      return;
    }
    flushing = true;
    const batch = queue.splice(0, 50);
    if (dropped > 0) {
      batch.push({
        eventId: makeId(), occurredAt: nowIso(), traceId, roomCode: context.room,
        seat: context.seat, source: 'browser', level: 'warn', eventName: 'telemetry.queue.dropped',
        details: { count: dropped },
      });
      dropped = 0;
    }
    const body = JSON.stringify({ events: batch });
    try {
      if (beacon && navigator.sendBeacon) {
        const ok = navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }));
        if (!ok) throw new Error('beacon_rejected');
      } else {
        const response = await originalFetch('/api/telemetry', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-yakolak-telemetry': '1', 'x-yakolak-trace': traceId },
          body,
        });
        if (!response.ok) throw new Error(`telemetry_http_${response.status}`);
      }
    } catch (_) {
      queue = batch.concat(queue).slice(-240);
    } finally {
      flushing = false;
    }
  };
  window.__yakolakTelemetryFlush = () => flush(false);
  setInterval(() => { if (NETWORK_ENABLED) void flush(false); }, 2000);

  const safeJson = text => {
    if (!text || typeof text !== 'string') return null;
    try { return clean(JSON.parse(text)); } catch (_) { return cleanText(text); }
  };
  const requestPath = value => {
    try { const url = new URL(value, location.href); return `${url.pathname}${url.search}`.slice(0, 900); }
    catch (_) { return String(value).slice(0, 900); }
  };

  window.fetch = async function(input, init = {}) {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input && input.url || '');
    if (!rawUrl.includes('/api/rooms')) return originalFetch(input, init);

    const requestId = `${traceId.slice(0, 8)}-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
    const method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('x-yakolak-trace', traceId);
    headers.set('x-yakolak-request', requestId);
    const body = typeof init.body === 'string' ? safeJson(init.body) : null;
    const started = performance.now();

    record('online.http.request', 'debug', {
      requestId, method, url: requestPath(rawUrl), body,
      online: navigator.onLine, visibility: document.visibilityState,
    }, { requestId, source: 'network' });

    try {
      const response = await originalFetch(input, { ...init, headers });
      let payload = null;
      if (response.status !== 204) {
        try { payload = clean(await response.clone().json()); } catch (_) {}
      }
      absorbRoom(payload);
      const durationMs = Math.round((performance.now() - started) * 10) / 10;
      const room = payload && payload.room ? payload.room : null;
      const level = response.ok ? 'info' : (response.status >= 500 ? 'error' : 'warn');
      record('online.http.response', level, {
        requestId, method, url: requestPath(rawUrl), status: response.status,
        durationMs, requestBody: body, response: payload,
        roomVersion: room && room.version, roundNumber: room && room.round,
        moveNumber: room && room.moveNumber, online: navigator.onLine,
      }, {
        requestId, source: 'network', roomVersion: room && room.version,
        roundNumber: room && room.round, moveNumber: room && room.moveNumber,
      });
      return response;
    } catch (error) {
      record('online.http.failure', 'error', {
        requestId, method, url: requestPath(rawUrl), body,
        durationMs: Math.round((performance.now() - started) * 10) / 10,
        name: error && error.name, message: error && error.message,
        online: navigator.onLine, visibility: document.visibilityState,
      }, { requestId, source: 'network' });
      throw error;
    }
  };

  const collectState = () => {
    const state = {};
    for (const [key, value] of Object.entries(document.body.dataset)) {
      if (key.startsWith('yakolak')) state[key] = String(value).slice(0, 600);
    }
    state.online = navigator.onLine;
    state.visibility = document.visibilityState;
    state.room = context.room || roomFromUrl();
    state.seat = context.seat;
    return state;
  };
  const publishState = reason => {
    try {
      const state = collectState();
      const encoded = JSON.stringify(state);
      if (encoded === lastState && reason !== 'heartbeat') return;
      lastState = encoded;
      record('game.state.snapshot', 'debug', { reason, state }, {
        source: 'gameplay',
        roomVersion: Number(state.yakolakOnlineVersion || state.yakolakRoomVersion || 0) || null,
        roundNumber: Number(state.yakolakRound || 0) || null,
        moveNumber: Number(state.yakolakMoves || 0) || 0,
      });
    } catch (_) {}
  };

  const observer = new MutationObserver(changes => {
    if (changes.some(change => String(change.attributeName || '').startsWith('data-yakolak-'))) publishState('dataset-change');
  });
  observer.observe(document.body, { attributes: true });
  setInterval(() => publishState('heartbeat'), 15000);

  addEventListener('error', event => {
    const target = event.target;
    if (target && target !== window) {
      record('browser.resource.error', 'error', {
        tag: target.tagName || '', src: target.src || target.href || '',
      }, { source: 'browser' });
      return;
    }
    record('browser.javascript.error', 'error', {
      message: event.message || '', filename: event.filename || '',
      line: event.lineno || 0, column: event.colno || 0,
      stack: event.error && event.error.stack || '',
    }, { source: 'browser' });
  }, true);
  addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    record('browser.unhandledrejection', 'error', {
      message: reason && reason.message || String(reason || ''),
      stack: reason && reason.stack || '',
    }, { source: 'browser' });
  });

  addEventListener('offline', () => record('browser.offline', 'warn', collectState(), { source: 'browser' }));
  addEventListener('online', () => record('browser.online', 'info', collectState(), { source: 'browser' }));
  addEventListener('pageshow', event => record('browser.pageshow', 'info', { persisted: !!event.persisted, state: collectState() }, { source: 'browser' }));
  addEventListener('pagehide', event => {
    record('browser.pagehide', 'info', { persisted: !!event.persisted, state: collectState() }, { source: 'browser' });
    if (NETWORK_ENABLED) void flush(true);
  });
  document.addEventListener('visibilitychange', () => record('browser.visibility', 'info', collectState(), { source: 'browser' }));

  document.addEventListener('pointerdown', event => {
    record('player.pointer', 'debug', {
      x: Math.round(event.clientX), y: Math.round(event.clientY),
      pointerType: event.pointerType || '', button: event.button,
      target: event.target && (event.target.id || event.target.tagName) || '',
    }, { source: 'gameplay' });
  }, true);

  const canvas = document.getElementById('canvas');
  if (canvas) {
    canvas.addEventListener('webglcontextlost', event => {
      record('browser.webgl.context_lost', 'fatal', { statusMessage: event.statusMessage || '' }, { source: 'browser' });
    });
    canvas.addEventListener('webglcontextrestored', () => record('browser.webgl.context_restored', 'info', {}, { source: 'browser' }));
  }

  try {
    const performanceObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 120) {
          record('browser.long_task', entry.duration >= 500 ? 'warn' : 'debug', {
            durationMs: Math.round(entry.duration * 10) / 10,
            startMs: Math.round(entry.startTime * 10) / 10,
          }, { source: 'browser' });
        }
      }
    });
    performanceObserver.observe({ type: 'longtask', buffered: true });
  } catch (_) {}

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  record('telemetry.started', 'info', {
    href: `${location.pathname}${location.search}`,
    userAgent: navigator.userAgent,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: navigator.deviceMemory || null,
    connection: connection ? {
      effectiveType: connection.effectiveType, rtt: connection.rtt,
      downlink: connection.downlink, saveData: connection.saveData,
    } : null,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
  }, { source: 'browser' });
  publishState('started');
})();
"""