const FALLBACK = Object.freeze({ environment: 'development', branch: 'threejs-rebuild', sha: 'local' });

export async function hydrateBuildMarker(element) {
  if (!element) return FALLBACK;

  let info = FALLBACK;
  try {
    const response = await fetch('/api/build-info', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (response.ok) info = { ...FALLBACK, ...(await response.json()) };
  } catch (error) {
    console.warn('[threejs-shell] build marker unavailable', error);
  }

  const sha = String(info.sha || 'local').slice(0, 8);
  const branch = String(info.branch || 'threejs-rebuild');
  element.textContent = `DEV / ${branch} / ${sha}`;
  element.title = `Development preview — ${branch} — ${info.sha || 'local'}`;
  element.dataset.sha = String(info.sha || 'local');
  return info;
}
