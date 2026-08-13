const nativeFetch = globalThis.fetch;
let nextDiscoveryAt = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

globalThis.fetch = async (input, init = {}) => {
  if (String(input).includes('/api/rooms') && String(init.method || 'GET').toUpperCase() === 'POST') {
    try {
      const body = JSON.parse(String(init.body || '{}'));
      if (['create', 'join', 'preview'].includes(String(body.action || ''))) {
        const waitMs = Math.max(0, nextDiscoveryAt - Date.now());
        if (waitMs > 0) await sleep(waitMs);
        nextDiscoveryAt = Date.now() + 4000;
      }
    } catch {}
  }
  return nativeFetch(input, init);
};

await import('./production_online_probe.mjs');
