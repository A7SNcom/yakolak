import { loadPublicRuntimeConfig } from '../core/public-runtime-config.js';

export async function hydrateBuildMarker(element) {
  const info = await loadPublicRuntimeConfig();
  if (!element) return info;

  const sha = String(info.frontendSha || 'local').slice(0, 8);
  const branch = String(info.branch || 'threejs-rebuild');
  const label = info.environment === 'production' ? 'PROD' : 'DEV';
  element.textContent = `${label} / ${branch} / ${sha}`;
  element.title = `${label === 'PROD' ? 'Production' : 'Development'} frontend — ${branch} — ${info.frontendSha || 'local'}`;
  element.dataset.sha = String(info.frontendSha || 'local');
  element.dataset.onlineAvailable = String(info.onlineAvailable);
  return info;
}
