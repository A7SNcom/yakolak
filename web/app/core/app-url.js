// PAGES-003 — one relocatable application base for every static deployment prefix.
// This module lives at web/app/core/, so ../../ is always the deployed web root.

export const INVITATION_QUERY_PARAM = 'invite';
export const SETUP_HASH_PARAM = 'setup';

export function deriveAppBaseUrl(moduleUrl = import.meta.url) {
  const base = new URL('../../', moduleUrl);
  base.search = '';
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return base;
}

export const APP_BASE_URL = deriveAppBaseUrl();

function normalizedBaseUrl(baseUrl) {
  const base = new URL(baseUrl);
  base.search = '';
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return base;
}

function normalizeAppPath(path) {
  const value = String(path ?? '').trim();
  if (!value) return '';
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) {
    throw new TypeError('Application paths must be relative to APP_BASE_URL');
  }
  return value.replace(/^\/+/, '');
}

export function resolveAppUrl(path = '', baseUrl = APP_BASE_URL) {
  const base = normalizedBaseUrl(baseUrl);
  const resolved = new URL(normalizeAppPath(path) || './', base);

  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    throw new TypeError('Application path escaped APP_BASE_URL');
  }
  return resolved;
}

export function appHref(path = '', baseUrl = APP_BASE_URL) {
  return resolveAppUrl(path, baseUrl).href;
}

export function assetHref(path, baseUrl = APP_BASE_URL) {
  return appHref(`assets/${normalizeAppPath(path)}`, baseUrl);
}

export function workerHref(path, baseUrl = APP_BASE_URL) {
  return appHref(normalizeAppPath(path), baseUrl);
}

function stateValue(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

// Entry state deliberately lives in query/hash, never in pathname segments. A static
// refresh therefore requests only APP_BASE_URL and does not require a server rewrite.
export function buildAppStateUrl({ invitation = null, setup = null } = {}, baseUrl = APP_BASE_URL) {
  const url = new URL(normalizedBaseUrl(baseUrl));
  const invitationValue = stateValue(invitation);
  const setupValue = stateValue(setup);

  if (invitationValue) url.searchParams.set(INVITATION_QUERY_PARAM, invitationValue);
  if (setupValue) {
    const hashParams = new URLSearchParams();
    hashParams.set(SETUP_HASH_PARAM, setupValue);
    url.hash = hashParams.toString();
  }
  return url;
}

export function buildInvitationUrl(invitation, baseUrl = APP_BASE_URL) {
  return buildAppStateUrl({ invitation }, baseUrl);
}

export function buildSetupUrl(setup, baseUrl = APP_BASE_URL) {
  return buildAppStateUrl({ setup }, baseUrl);
}

export function readAppState(urlLike = globalThis.location?.href ?? APP_BASE_URL.href, baseUrl = APP_BASE_URL) {
  const url = new URL(urlLike, normalizedBaseUrl(baseUrl));
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  return Object.freeze({
    invitation: stateValue(url.searchParams.get(INVITATION_QUERY_PARAM)),
    setup: stateValue(hashParams.get(SETUP_HASH_PARAM)),
  });
}

export function navigateAppState(state = {}, {
  baseUrl = APP_BASE_URL,
  replace = false,
  historyImpl = globalThis.history,
} = {}) {
  if (!historyImpl || typeof historyImpl.pushState !== 'function' || typeof historyImpl.replaceState !== 'function') {
    throw new TypeError('History API is required for static application navigation');
  }
  const url = buildAppStateUrl(state, baseUrl);
  historyImpl[replace ? 'replaceState' : 'pushState'](null, '', url.href);
  return url;
}
