export const SUPPORTED_PROTOCOL_VERSION = '1';

export class OnlineUnavailableError extends Error {
  constructor(reason = 'Public API configuration is unavailable') {
    super(`Online play is unavailable: ${reason}`);
    this.name = 'OnlineUnavailableError';
    this.code = 'ONLINE_UNAVAILABLE';
  }
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateApiOrigin(rawValue) {
  const value = cleanText(rawValue);
  if (!value) return { apiOrigin: null, issue: 'API_ORIGIN is not configured' };

  let url;
  try {
    url = new URL(value);
  } catch {
    return { apiOrigin: null, issue: 'API_ORIGIN is not a valid URL' };
  }

  if (url.protocol !== 'https:') return { apiOrigin: null, issue: 'API_ORIGIN must use HTTPS' };
  if (url.username || url.password) return { apiOrigin: null, issue: 'API_ORIGIN must not contain credentials' };
  if (url.pathname !== '/' || url.search || url.hash) return { apiOrigin: null, issue: 'API_ORIGIN must be an origin only' };
  if (/(^|\.)vercel\.app$/i.test(url.hostname)) return { apiOrigin: null, issue: 'Vercel is not an approved backend origin' };

  return { apiOrigin: url.origin, issue: null };
}

export function normalizePublicRuntimeConfig(raw = {}) {
  const protocolVersion = cleanText(raw.protocolVersion);
  const frontendSha = cleanText(raw.frontendSha) || 'local';
  const environment = cleanText(raw.environment) || 'development';
  const branch = cleanText(raw.branch) || 'threejs-rebuild';
  const origin = validateApiOrigin(raw.apiOrigin);

  let unavailableReason = origin.issue;
  if (protocolVersion !== SUPPORTED_PROTOCOL_VERSION) {
    unavailableReason = protocolVersion
      ? `Unsupported protocol version ${protocolVersion}`
      : 'Protocol version is not configured';
  }

  return Object.freeze({
    frontendSha,
    protocolVersion: protocolVersion || null,
    apiOrigin: origin.apiOrigin,
    environment,
    branch,
    onlineAvailable: !unavailableReason,
    unavailableReason: unavailableReason || null,
  });
}

export async function loadPublicRuntimeConfig({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') return normalizePublicRuntimeConfig();

  const configUrl = new URL('../../runtime-config.json', import.meta.url);
  try {
    const response = await fetchImpl(configUrl, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return normalizePublicRuntimeConfig();
    return normalizePublicRuntimeConfig(await response.json());
  } catch (error) {
    console.warn('[threejs-config] public runtime config unavailable; online disabled', error);
    return normalizePublicRuntimeConfig();
  }
}

export function requireOnlineRuntimeConfig(config) {
  const normalized = config?.onlineAvailable === undefined
    ? normalizePublicRuntimeConfig(config)
    : config;
  if (!normalized.onlineAvailable) throw new OnlineUnavailableError(normalized.unavailableReason);
  return normalized;
}
