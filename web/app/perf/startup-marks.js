// THREEJS-017 — presentation/startup diagnostics only. Never owns gameplay or lifecycle authority.

export const STARTUP_MARKS = Object.freeze({
  bootStart: 'yakolak:boot-start',
  bootCriticalReady: 'yakolak:boot-critical-ready',
  criticalAssetsReady: 'yakolak:critical-assets-ready',
  firstVisibleFrame: 'yakolak:first-visible-frame',
  firstInteractive: 'yakolak:first-interactive',
});

export function markOnce(name) {
  if (!globalThis.performance?.mark || !globalThis.performance?.getEntriesByName) return false;
  if (globalThis.performance.getEntriesByName(name, 'mark').length > 0) return false;
  globalThis.performance.mark(name);
  return true;
}

export function startupMarkSnapshot() {
  const result = {};
  for (const [key, name] of Object.entries(STARTUP_MARKS)) {
    result[key] = globalThis.performance?.getEntriesByName?.(name, 'mark')?.[0]?.startTime ?? null;
  }
  return Object.freeze(result);
}
