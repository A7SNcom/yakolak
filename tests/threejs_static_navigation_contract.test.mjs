import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  STATIC_NAVIGATION_EFFECTS,
  STATIC_NAVIGATION_EVENTS,
  canonicalStaticRouteUrl,
  createStaticNavigationController,
  createStaticNavigationState,
  reduceStaticNavigation,
} from '../web/app/core/static-navigation.js';
import { buildAppStateUrl } from '../web/app/core/app-url.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createHistoryHarness(initialHref) {
  const location = { href: initialHref };
  const entries = [{ href: initialHref, state: null }];
  let index = 0;
  const writes = [];
  let backCalls = 0;

  const history = {
    get length() { return entries.length; },
    get state() { return entries[index]?.state ?? null; },
    pushState(state, _title, href) {
      assert.equal(state, null, 'history.state must always remain null');
      entries.splice(index + 1);
      entries.push({ href: String(href), state });
      index = entries.length - 1;
      location.href = String(href);
      writes.push({ method: 'pushState', state, href: String(href) });
    },
    replaceState(state, _title, href) {
      assert.equal(state, null, 'history.state must always remain null');
      entries[index] = { href: String(href), state };
      location.href = String(href);
      writes.push({ method: 'replaceState', state, href: String(href) });
    },
    back() {
      backCalls += 1;
      if (index > 0) index -= 1;
      location.href = entries[index].href;
    },
  };

  return {
    location,
    history,
    writes,
    entries,
    getBackCalls: () => backCalls,
  };
}

function createEventTargetHarness() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type, event = {}) {
      for (const listener of [...(listeners.get(type) || [])]) listener(event);
    },
    count(type) { return listeners.get(type)?.size || 0; },
  };
}

function createControllerHarness({ baseUrl, initialHref }) {
  const nav = createHistoryHarness(initialHref);
  const events = createEventTargetHarness();
  const clears = [];
  const hydrations = [];
  const invitations = [];
  const states = [];
  let lifecycle = 'gen-10:rev-20';
  const controller = createStaticNavigationController({
    baseUrl,
    historyImpl: nav.history,
    locationImpl: nav.location,
    eventTarget: events,
    getLifecycleKey: () => lifecycle,
    onClearSelection: reason => clears.push(reason),
    onHydrateRoute: (route, lifecycleKey, reason) => hydrations.push({ route, lifecycleKey, reason }),
    onInvitationEntry: (invitation, lifecycleKey) => invitations.push({ invitation, lifecycleKey }),
    onState: state => states.push(state),
  });
  return {
    ...nav,
    events,
    clears,
    hydrations,
    invitations,
    states,
    controller,
    setLifecycle(value) { lifecycle = value; },
  };
}

// Pure reducer: reselect/tap-empty never touch history; Cancel/Escape clear selection
// before requesting navigation back. Setup Back is the same centralized history effect.
const reducerState = createStaticNavigationState({
  route: { invitation: null, setup: 'players' },
  lifecycleKey: 'gen-1:rev-1',
});
let reduced = reduceStaticNavigation(reducerState, {
  type: STATIC_NAVIGATION_EVENTS.RESELECT,
  targetId: 'home-piece:right:0:large',
});
assert.equal(reduced.state.selectedTargetId, 'home-piece:right:0:large');
assert.deepEqual(reduced.effects, []);

reduced = reduceStaticNavigation(reduced.state, { type: STATIC_NAVIGATION_EVENTS.TAP_EMPTY });
assert.equal(reduced.state.selectedTargetId, null);
assert.deepEqual(reduced.effects.map(item => item.type), [STATIC_NAVIGATION_EFFECTS.CLEAR_SELECTION]);
assert.equal(reduced.effects[0].reason, 'tap-empty');

reduced = reduceStaticNavigation(reduced.state, {
  type: STATIC_NAVIGATION_EVENTS.RESELECT,
  targetId: 'home-piece:right:0:medium',
});
const cancelSelected = reduceStaticNavigation(reduced.state, { type: STATIC_NAVIGATION_EVENTS.CANCEL });
assert.equal(cancelSelected.state.selectedTargetId, null);
assert.deepEqual(cancelSelected.effects.map(item => item.type), [STATIC_NAVIGATION_EFFECTS.CLEAR_SELECTION]);

const cancelRoute = reduceStaticNavigation(cancelSelected.state, { type: STATIC_NAVIGATION_EVENTS.ESCAPE });
assert.deepEqual(cancelRoute.effects.map(item => item.type), [STATIC_NAVIGATION_EFFECTS.HISTORY_BACK_OR_BASE]);
const setupBack = reduceStaticNavigation(cancelSelected.state, { type: STATIC_NAVIGATION_EVENTS.SETUP_BACK });
assert.deepEqual(setupBack.effects.map(item => item.type), [STATIC_NAVIGATION_EFFECTS.HISTORY_BACK_OR_BASE]);

for (const basePath of ['/yakolak/threejs/', '/yakolak/']) {
  const baseUrl = `https://a7sncom.github.io${basePath}`;
  const polluted = `${baseUrl}?invite=ROOM42&seatCredential=SHOULD_NOT_SURVIVE&token=ALSO_SECRET#setup=join`;
  const harness = createControllerHarness({ baseUrl, initialHref: polluted });

  const canonical = canonicalStaticRouteUrl(polluted, baseUrl);
  assert.equal(canonical.pathname, basePath);
  assert.equal(canonical.searchParams.get('invite'), 'ROOM42');
  assert.equal(canonical.searchParams.has('seatCredential'), false);
  assert.equal(canonical.searchParams.has('token'), false);
  assert.equal(canonical.hash, '#setup=join');

  const started = harness.controller.start();
  assert.equal(started.route.invitation, 'ROOM42');
  assert.equal(started.route.setup, 'join');
  assert.equal(harness.invitations.length, 1, 'initial public invitation enters exactly once');
  assert.deepEqual(harness.invitations[0], { invitation: 'ROOM42', lifecycleKey: 'gen-10:rev-20' });
  assert.equal(harness.hydrations.at(-1).reason, 'invitation-entry');
  assert.equal(harness.writes[0].method, 'replaceState', 'polluted external URL is canonicalized in place');
  assert.equal(harness.writes[0].state, null);
  assert.equal(harness.location.href.includes('seatCredential'), false);
  assert.equal(harness.location.href.includes('ALSO_SECRET'), false);
  assert.equal(harness.location.href, buildAppStateUrl({ invitation: 'ROOM42', setup: 'join' }, baseUrl).href);

  // Re-running start or BFCache/pageshow only hydrates. It never duplicates invitation
  // create/claim while the public invite remains in the URL.
  harness.controller.start();
  harness.controller.pageshow();
  harness.controller.pageshow();
  assert.equal(harness.invitations.length, 1, 'start/pageshow must not duplicate invitation entry');
  assert.equal(harness.hydrations.at(-1).reason, 'pageshow');

  // Presentation selection is local-only. pageshow/popstate clear it before hydrating the
  // current canonical lifecycle so presentation cannot remain stranded on stale state.
  harness.controller.reselect('home-piece:right:0:large');
  harness.setLifecycle('gen-11:rev-21');
  harness.controller.pageshow();
  assert.equal(harness.controller.snapshot().selectedTargetId, null);
  assert.equal(harness.clears.at(-1), 'pageshow');
  assert.equal(harness.hydrations.at(-1).lifecycleKey, 'gen-11:rev-21');

  harness.controller.openSetup('players');
  assert.equal(new URL(harness.location.href).pathname, basePath);
  assert.equal(new URL(harness.location.href).hash, '#setup=players');
  assert.equal(harness.writes.at(-1).method, 'pushState');
  assert.equal(harness.writes.at(-1).state, null);

  harness.controller.reselect('home-piece:right:0:medium');
  const backBeforeCancel = harness.getBackCalls();
  harness.controller.escape();
  assert.equal(harness.getBackCalls(), backBeforeCancel, 'Escape first clears selection, not history');
  assert.equal(harness.clears.at(-1), 'escape');
  harness.controller.escape();
  assert.equal(harness.getBackCalls(), backBeforeCancel + 1, 'Escape with no selection delegates to history Back');
  harness.controller.popstate();
  assert.equal(harness.controller.snapshot().route.setup, 'join');
  assert.equal(harness.hydrations.at(-1).reason, 'history-pop');

  harness.controller.openSetup('confirm');
  const backBeforeSetupBack = harness.getBackCalls();
  harness.controller.setupBack();
  assert.equal(harness.getBackCalls(), backBeforeSetupBack + 1);
  harness.controller.popstate();
  assert.notEqual(harness.controller.snapshot().route.setup, 'confirm');

  harness.setLifecycle('gen-12:rev-22');
  harness.controller.enterInvitation('ROOM43', { replace: false });
  assert.equal(harness.invitations.length, 2);
  assert.deepEqual(harness.invitations.at(-1), { invitation: 'ROOM43', lifecycleKey: 'gen-12:rev-22' });
  const room43Url = new URL(harness.location.href);
  assert.equal(room43Url.pathname, basePath);
  assert.equal(room43Url.searchParams.get('invite'), 'ROOM43');
  assert.equal([...room43Url.searchParams.keys()].join(','), 'invite');
  assert.equal(harness.writes.at(-1).state, null);

  harness.controller.enterInvitation('ROOM43', { replace: true });
  assert.equal(harness.invitations.length, 2, 'same public invite cannot be claimed twice in controller lifetime');
  assert.equal(harness.hydrations.at(-1).reason, 'hydrate');

  assert.equal(harness.controller.attach(), true);
  assert.equal(harness.controller.attach(), false);
  assert.equal(harness.events.count('popstate'), 1);
  assert.equal(harness.events.count('pageshow'), 1);
  harness.events.emit('pageshow');
  assert.equal(harness.invitations.length, 2);
  assert.equal(harness.hydrations.at(-1).reason, 'pageshow');
  assert.equal(harness.controller.detach(), true);
  assert.equal(harness.controller.detach(), false);
  assert.equal(harness.events.count('popstate'), 0);
  assert.equal(harness.events.count('pageshow'), 0);

  assert(harness.writes.every(write => write.state === null), 'no history state may contain credentials or routing payload');
  assert(harness.entries.every(entry => entry.state === null));

  // A fresh controller can encounter an unseen invitation through Forward/Back. Popstate
  // must enter that invite exactly once without manufacturing another history write.
  const forward = createControllerHarness({ baseUrl, initialHref: baseUrl });
  forward.controller.start();
  const writesBeforeForward = forward.writes.length;
  forward.setLifecycle('gen-forward:rev-1');
  forward.location.href = buildAppStateUrl({ invitation: 'ROOM99' }, baseUrl).href;
  forward.controller.popstate();
  assert.equal(forward.invitations.length, 1);
  assert.deepEqual(forward.invitations[0], { invitation: 'ROOM99', lifecycleKey: 'gen-forward:rev-1' });
  assert.equal(forward.hydrations.at(-1).reason, 'invitation-entry');
  assert.equal(forward.writes.length, writesBeforeForward, 'popstate invitation entry must not push/replace history');
  forward.controller.popstate();
  assert.equal(forward.invitations.length, 1, 'revisiting the same history invite hydrates only');
  assert.equal(forward.hydrations.at(-1).reason, 'history-pop');

  // pageshow is stricter: even an unseen invite is hydration-only. A later real popstate
  // may still enter it once because pageshow did not consume the invitation-entry token.
  const bfcache = createControllerHarness({ baseUrl, initialHref: baseUrl });
  bfcache.controller.start();
  bfcache.location.href = buildAppStateUrl({ invitation: 'ROOMBF' }, baseUrl).href;
  bfcache.controller.pageshow();
  assert.equal(bfcache.invitations.length, 0);
  assert.equal(bfcache.hydrations.at(-1).reason, 'pageshow');
  bfcache.controller.popstate();
  assert.equal(bfcache.invitations.length, 1);
  assert.equal(bfcache.invitations[0].invitation, 'ROOMBF');
}

assert.throws(() => canonicalStaticRouteUrl('https://a7sncom.github.io/yakolak/?invite=bad%20space', 'https://a7sncom.github.io/yakolak/'), /invalid_public_invitation_id/);
assert.throws(() => createStaticNavigationState({ route: {}, lifecycleKey: '' }), /navigation_lifecycle_key_required/);

const source = readFileSync(path.join(root, 'web/app/core/static-navigation.js'), 'utf8');
assert.match(source, /buildAppStateUrl/);
assert.match(source, /readAppState/);
assert.match(source, /historyImpl\[method\]\(null, '', url\.href\)/);
assert.match(source, /pageshow/);
assert.match(source, /popstate/);
assert.match(source, /seenInvitations/);
assert.doesNotMatch(source, /location\.pathname\s*=|location\.href\s*=|window\.location\s*=/);
assert.doesNotMatch(source, /seatCredential\s*:|bearer\s*:|authorization\s*:/i);

console.log('THREEJS-038 static navigation/history/deep-link contract: PASS');
