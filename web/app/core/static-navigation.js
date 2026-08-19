import {
  APP_BASE_URL,
  buildAppStateUrl,
  readAppState,
} from './app-url.js';

export const STATIC_NAVIGATION_EVENTS = Object.freeze({
  HYDRATE: 'hydrate',
  RESELECT: 'reselect',
  TAP_EMPTY: 'tap-empty',
  CANCEL: 'cancel',
  ESCAPE: 'escape',
  SETUP_OPEN: 'setup-open',
  SETUP_BACK: 'setup-back',
  HISTORY_POP: 'history-pop',
  INVITATION_ENTRY: 'invitation-entry',
  PAGESHOW: 'pageshow',
});

export const STATIC_NAVIGATION_EFFECTS = Object.freeze({
  CLEAR_SELECTION: 'clear-selection',
  PUSH_URL: 'push-url',
  REPLACE_URL: 'replace-url',
  HISTORY_BACK_OR_BASE: 'history-back-or-base',
  HYDRATE_ROUTE: 'hydrate-route',
  ENTER_INVITATION: 'enter-invitation',
});

const PUBLIC_INVITATION_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;
const SETUP_VALUE_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function opaque(value, code, max = 256) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > max) fail(code);
  return normalized;
}

function requireLifecycleKey(value) {
  return opaque(value, 'navigation_lifecycle_key_required');
}

function requireSelectionTarget(value) {
  return opaque(value, 'navigation_selection_target_required');
}

function publicInvitation(value) {
  const normalized = String(value ?? '').trim();
  if (!PUBLIC_INVITATION_PATTERN.test(normalized)) fail('invalid_public_invitation_id');
  return normalized;
}

function setupValue(value) {
  const normalized = String(value ?? '').trim();
  if (!SETUP_VALUE_PATTERN.test(normalized)) fail('invalid_setup_route_value');
  return normalized;
}

function routeFromUrl(urlLike, baseUrl = APP_BASE_URL) {
  const route = readAppState(urlLike, baseUrl);
  return deepFreeze({
    invitation: route.invitation === null ? null : publicInvitation(route.invitation),
    setup: route.setup === null ? null : setupValue(route.setup),
  });
}

function normalizeRoute(route = {}) {
  return deepFreeze({
    invitation: route.invitation == null ? null : publicInvitation(route.invitation),
    setup: route.setup == null ? null : setupValue(route.setup),
  });
}

function sameRoute(left, right) {
  return left.invitation === right.invitation && left.setup === right.setup;
}

export function canonicalStaticRouteUrl(urlLike, baseUrl = APP_BASE_URL) {
  const route = routeFromUrl(urlLike, baseUrl);
  return buildAppStateUrl(route, baseUrl);
}

export function createStaticNavigationState({
  route = {},
  lifecycleKey,
  selectedTargetId = null,
} = {}) {
  return deepFreeze({
    route: normalizeRoute(route),
    lifecycleKey: requireLifecycleKey(lifecycleKey),
    selectedTargetId: selectedTargetId === null ? null : requireSelectionTarget(selectedTargetId),
    sequence: 0,
  });
}

function effect(type, payload = {}) {
  return deepFreeze({ type, ...payload });
}

function result(state, effects = []) {
  return deepFreeze({ state, effects });
}

function replaceState(previous, patch) {
  return deepFreeze({
    route: patch.route ?? previous.route,
    lifecycleKey: patch.lifecycleKey ?? previous.lifecycleKey,
    selectedTargetId: Object.hasOwn(patch, 'selectedTargetId') ? patch.selectedTargetId : previous.selectedTargetId,
    sequence: previous.sequence + 1,
  });
}

function clearSelectionEffectIfNeeded(state, reason) {
  return state.selectedTargetId === null
    ? []
    : [effect(STATIC_NAVIGATION_EFFECTS.CLEAR_SELECTION, { reason })];
}

function hydrateFromUrl(state, event, reason) {
  const route = routeFromUrl(event.url, event.baseUrl ?? APP_BASE_URL);
  const lifecycleKey = requireLifecycleKey(event.lifecycleKey);
  const effects = [
    ...clearSelectionEffectIfNeeded(state, reason),
    effect(STATIC_NAVIGATION_EFFECTS.HYDRATE_ROUTE, { route, lifecycleKey, reason }),
  ];
  return result(replaceState(state, { route, lifecycleKey, selectedTargetId: null }), effects);
}

export function reduceStaticNavigation(state, event) {
  if (!state || typeof state !== 'object') fail('navigation_state_required');
  if (!event || typeof event !== 'object') fail('navigation_event_required');

  switch (event.type) {
    case STATIC_NAVIGATION_EVENTS.RESELECT: {
      const selectedTargetId = requireSelectionTarget(event.targetId);
      return result(replaceState(state, { selectedTargetId }));
    }

    case STATIC_NAVIGATION_EVENTS.TAP_EMPTY: {
      if (state.selectedTargetId === null) return result(replaceState(state, {}));
      return result(
        replaceState(state, { selectedTargetId: null }),
        [effect(STATIC_NAVIGATION_EFFECTS.CLEAR_SELECTION, { reason: 'tap-empty' })],
      );
    }

    case STATIC_NAVIGATION_EVENTS.CANCEL:
    case STATIC_NAVIGATION_EVENTS.ESCAPE: {
      const reason = event.type;
      if (state.selectedTargetId !== null) {
        return result(
          replaceState(state, { selectedTargetId: null }),
          [effect(STATIC_NAVIGATION_EFFECTS.CLEAR_SELECTION, { reason })],
        );
      }
      if (state.route.setup !== null || state.route.invitation !== null) {
        return result(
          replaceState(state, {}),
          [effect(STATIC_NAVIGATION_EFFECTS.HISTORY_BACK_OR_BASE, { reason })],
        );
      }
      return result(replaceState(state, {}));
    }

    case STATIC_NAVIGATION_EVENTS.SETUP_OPEN: {
      const route = normalizeRoute({
        invitation: state.route.invitation,
        setup: setupValue(event.setup),
      });
      return result(
        replaceState(state, { route, selectedTargetId: null }),
        [
          ...clearSelectionEffectIfNeeded(state, 'setup-open'),
          effect(event.replace ? STATIC_NAVIGATION_EFFECTS.REPLACE_URL : STATIC_NAVIGATION_EFFECTS.PUSH_URL, { route }),
        ],
      );
    }

    case STATIC_NAVIGATION_EVENTS.SETUP_BACK: {
      return result(
        replaceState(state, { selectedTargetId: null }),
        [
          ...clearSelectionEffectIfNeeded(state, 'setup-back'),
          effect(STATIC_NAVIGATION_EFFECTS.HISTORY_BACK_OR_BASE, { reason: 'setup-back' }),
        ],
      );
    }

    case STATIC_NAVIGATION_EVENTS.HYDRATE:
      return hydrateFromUrl(state, event, 'hydrate');

    case STATIC_NAVIGATION_EVENTS.HISTORY_POP:
      return hydrateFromUrl(state, event, 'history-pop');

    case STATIC_NAVIGATION_EVENTS.PAGESHOW:
      return hydrateFromUrl(state, event, 'pageshow');

    case STATIC_NAVIGATION_EVENTS.INVITATION_ENTRY: {
      const invitation = publicInvitation(event.invitation);
      const lifecycleKey = requireLifecycleKey(event.lifecycleKey);
      const route = normalizeRoute({ invitation, setup: event.setup ?? null });
      return result(
        replaceState(state, { route, lifecycleKey, selectedTargetId: null }),
        [
          ...clearSelectionEffectIfNeeded(state, 'invitation-entry'),
          effect(event.replace === false ? STATIC_NAVIGATION_EFFECTS.PUSH_URL : STATIC_NAVIGATION_EFFECTS.REPLACE_URL, { route }),
          effect(STATIC_NAVIGATION_EFFECTS.HYDRATE_ROUTE, { route, lifecycleKey, reason: 'invitation-entry' }),
          effect(STATIC_NAVIGATION_EFFECTS.ENTER_INVITATION, { invitation, lifecycleKey }),
        ],
      );
    }

    default:
      fail('unsupported_navigation_event');
  }
}

function requireHistory(historyImpl) {
  if (
    !historyImpl
    || typeof historyImpl.pushState !== 'function'
    || typeof historyImpl.replaceState !== 'function'
    || typeof historyImpl.back !== 'function'
  ) fail('navigation_history_required');
  return historyImpl;
}

function requireLocation(locationImpl) {
  if (!locationImpl || typeof locationImpl.href !== 'string') fail('navigation_location_required');
  return locationImpl;
}

function requireCallback(callback, code) {
  if (typeof callback !== 'function') fail(code);
  return callback;
}

function historyWrite(historyImpl, method, route, baseUrl) {
  const url = buildAppStateUrl(route, baseUrl);
  // History state is deliberately null. No credential, seat identity, claim payload or
  // server-routing requirement is allowed to hide in history.state.
  historyImpl[method](null, '', url.href);
  return url;
}

function canonicalHrefMatches(locationHref, route, baseUrl) {
  const expected = buildAppStateUrl(route, baseUrl).href;
  try {
    return new URL(locationHref, baseUrl).href === expected;
  } catch {
    return false;
  }
}

export function createStaticNavigationController({
  baseUrl = APP_BASE_URL,
  historyImpl = globalThis.history,
  locationImpl = globalThis.location,
  eventTarget = globalThis,
  getLifecycleKey,
  onClearSelection = () => {},
  onHydrateRoute = () => {},
  onInvitationEntry = () => {},
  onState = () => {},
} = {}) {
  const history = requireHistory(historyImpl);
  const location = requireLocation(locationImpl);
  const lifecycleKey = requireCallback(getLifecycleKey, 'navigation_lifecycle_reader_required');
  const clearSelection = requireCallback(onClearSelection, 'navigation_clear_selection_callback_required');
  const hydrateRoute = requireCallback(onHydrateRoute, 'navigation_hydrate_callback_required');
  const invitationEntry = requireCallback(onInvitationEntry, 'navigation_invitation_callback_required');
  const stateChanged = requireCallback(onState, 'navigation_state_callback_required');
  const base = new URL(baseUrl);
  base.search = '';
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';

  const initialRoute = routeFromUrl(location.href, base);
  let state = createStaticNavigationState({
    route: initialRoute,
    lifecycleKey: requireLifecycleKey(lifecycleKey()),
  });
  const seenInvitations = new Set();
  let attached = false;
  let popListener = null;
  let pageShowListener = null;

  function publish(next) {
    state = next;
    stateChanged(state);
    return state;
  }

  function execute(navResult) {
    for (const navEffect of navResult.effects) {
      if (navEffect.type === STATIC_NAVIGATION_EFFECTS.CLEAR_SELECTION) {
        clearSelection(navEffect.reason);
        continue;
      }
      if (navEffect.type === STATIC_NAVIGATION_EFFECTS.PUSH_URL) {
        historyWrite(history, 'pushState', navEffect.route, base);
        continue;
      }
      if (navEffect.type === STATIC_NAVIGATION_EFFECTS.REPLACE_URL) {
        historyWrite(history, 'replaceState', navEffect.route, base);
        continue;
      }
      if (navEffect.type === STATIC_NAVIGATION_EFFECTS.HISTORY_BACK_OR_BASE) {
        if (Number(history.length) > 1) history.back();
        else historyWrite(history, 'replaceState', { invitation: null, setup: null }, base);
        continue;
      }
      if (navEffect.type === STATIC_NAVIGATION_EFFECTS.HYDRATE_ROUTE) {
        hydrateRoute(navEffect.route, navEffect.lifecycleKey, navEffect.reason);
        continue;
      }
      if (navEffect.type === STATIC_NAVIGATION_EFFECTS.ENTER_INVITATION) {
        invitationEntry(navEffect.invitation, navEffect.lifecycleKey);
        continue;
      }
      fail('unsupported_navigation_effect');
    }
    return publish(navResult.state);
  }

  function dispatch(event) {
    return execute(reduceStaticNavigation(state, { ...event, baseUrl: base }));
  }

  function sanitizeLocation(route = routeFromUrl(location.href, base)) {
    if (!canonicalHrefMatches(location.href, route, base)) {
      historyWrite(history, 'replaceState', route, base);
      return true;
    }
    return false;
  }

  function hydrateCurrent(type) {
    const route = routeFromUrl(location.href, base);
    sanitizeLocation(route);
    return dispatch({
      type,
      url: buildAppStateUrl(route, base).href,
      lifecycleKey: requireLifecycleKey(lifecycleKey()),
    });
  }

  function enterInvitation(invitation, { setup = null, replace = true } = {}) {
    const publicId = publicInvitation(invitation);
    const currentLifecycleKey = requireLifecycleKey(lifecycleKey());
    if (seenInvitations.has(publicId)) {
      const route = normalizeRoute({ invitation: publicId, setup });
      historyWrite(history, replace ? 'replaceState' : 'pushState', route, base);
      return dispatch({
        type: STATIC_NAVIGATION_EVENTS.HYDRATE,
        url: buildAppStateUrl(route, base).href,
        lifecycleKey: currentLifecycleKey,
      });
    }
    seenInvitations.add(publicId);
    return dispatch({
      type: STATIC_NAVIGATION_EVENTS.INVITATION_ENTRY,
      invitation: publicId,
      setup,
      replace,
      lifecycleKey: currentLifecycleKey,
    });
  }

  function start() {
    const route = routeFromUrl(location.href, base);
    sanitizeLocation(route);
    if (route.invitation !== null && !seenInvitations.has(route.invitation)) {
      seenInvitations.add(route.invitation);
      // Initial deep-link invitation entry does not push a duplicate history record.
      const navResult = reduceStaticNavigation(state, {
        type: STATIC_NAVIGATION_EVENTS.INVITATION_ENTRY,
        invitation: route.invitation,
        setup: route.setup,
        replace: true,
        lifecycleKey: requireLifecycleKey(lifecycleKey()),
        baseUrl: base,
      });
      // URL was already canonicalized above; remove the reducer's redundant replace effect.
      return execute(result(navResult.state, navResult.effects.filter(item => item.type !== STATIC_NAVIGATION_EFFECTS.REPLACE_URL)));
    }
    return hydrateCurrent(STATIC_NAVIGATION_EVENTS.HYDRATE);
  }

  function onPopState() {
    return hydrateCurrent(STATIC_NAVIGATION_EVENTS.HISTORY_POP);
  }

  function onPageShow() {
    // BFCache/pageshow is hydration-only. It must never recreate a room, claim a seat or
    // replay invitation entry even if the URL still contains the public invite id.
    return hydrateCurrent(STATIC_NAVIGATION_EVENTS.PAGESHOW);
  }

  function attach() {
    if (attached) return false;
    if (!eventTarget || typeof eventTarget.addEventListener !== 'function' || typeof eventTarget.removeEventListener !== 'function') {
      fail('navigation_event_target_required');
    }
    popListener = () => onPopState();
    pageShowListener = () => onPageShow();
    eventTarget.addEventListener('popstate', popListener);
    eventTarget.addEventListener('pageshow', pageShowListener);
    attached = true;
    return true;
  }

  function detach() {
    if (!attached) return false;
    eventTarget.removeEventListener('popstate', popListener);
    eventTarget.removeEventListener('pageshow', pageShowListener);
    popListener = null;
    pageShowListener = null;
    attached = false;
    return true;
  }

  return Object.freeze({
    start,
    attach,
    detach,
    enterInvitation,
    openSetup(setup, { replace = false } = {}) {
      return dispatch({ type: STATIC_NAVIGATION_EVENTS.SETUP_OPEN, setup, replace });
    },
    setupBack() {
      return dispatch({ type: STATIC_NAVIGATION_EVENTS.SETUP_BACK });
    },
    reselect(targetId) {
      return dispatch({ type: STATIC_NAVIGATION_EVENTS.RESELECT, targetId });
    },
    tapEmpty() {
      return dispatch({ type: STATIC_NAVIGATION_EVENTS.TAP_EMPTY });
    },
    cancel() {
      return dispatch({ type: STATIC_NAVIGATION_EVENTS.CANCEL });
    },
    escape() {
      return dispatch({ type: STATIC_NAVIGATION_EVENTS.ESCAPE });
    },
    popstate: onPopState,
    pageshow: onPageShow,
    snapshot() { return state; },
  });
}
