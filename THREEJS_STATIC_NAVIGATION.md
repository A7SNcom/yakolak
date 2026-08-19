# THREEJS-038 — Cancel, Back, browser history and static deep-link semantics

Status: **LOCKED by THREEJS-038 (2026-08-20)**

THREEJS-038 centralizes local selection cancellation, setup Back, browser Back/Forward, `pageshow` hydration and public invitation entry behind one reducer/controller. Static routing stays relocatable under both the migration prefix and the future root prefix.

## One reducer

`reduceStaticNavigation(state, event)` is the single decision boundary for:

- `reselect`
- `tap-empty`
- `cancel`
- `escape`
- `setup-open`
- `setup-back`
- `hydrate`
- `history-pop`
- `pageshow`
- `invitation-entry`

The reducer returns a frozen next state plus explicit effects. Browser APIs and invitation callbacks live only in the controller effect executor.

## Selection cancellation precedence

Cancel/Escape never performs two meanings at once.

If a local presentation selection exists:

1. clear selection;
2. do not navigate history.

Only when no selection exists may Cancel/Escape delegate to Back for a setup/invitation route.

`tap-empty` clears selection only. `reselect` replaces the selected presentation target without touching history.

## Static URL contract

All URLs are built through `buildAppStateUrl(...)` from the current application base.

Therefore the same state remains refresh-safe under:

- `/yakolak/threejs/`
- `/yakolak/`

State stays in query/hash on the application root:

- public invitation → `?invite=...`
- setup step → `#setup=...`

No pathname segment is created for setup/invitation state, so GitHub Pages never needs a rewrite rule for history navigation or refresh.

## URL sanitization and credential boundary

The navigation controller reconstructs the canonical URL only from the known public `invite` and `setup` fields. Unknown query/hash state is removed with `replaceState`.

For example, an incoming URL containing accidental `seatCredential`, bearer/token or other unknown params is canonicalized back to only the recognized public route state.

History writes always use:

`history.pushState(null, '', canonicalUrl)`

or:

`history.replaceState(null, '', canonicalUrl)`

`history.state` is deliberately `null`; it cannot hold seat credentials, bearer tokens, claim payloads or hidden routing information.

Seat/bearer credentials remain governed by PAGES-006 memory-only policy and are not inputs to this router.

## Browser Back / Forward

`popstate` never trusts `history.state` and never recreates gameplay state from it. It reads and canonicalizes the current query/hash route, clears stale local presentation as part of hydration, and uses the current lifecycle key.

If Back/Forward lands on a public invitation that this controller instance has **never entered**, that history transition is treated as the invitation entry exactly once. The controller invokes the invitation bridge without pushing or replacing another history record. Later visits to the same invitation route hydrate only.

This closes the case where Forward reveals an invitation that was not previously visited during the current controller lifetime while still preventing duplicate claim/create on ordinary Back/Forward revisits.

The canonical hydrated lifecycle—not history state—decides what presentation is valid after navigation.

## `pageshow` / BFCache

`pageshow` is stricter than `popstate`: it is hydration-only, even when the current URL contains an invitation that is unseen by this controller.

It may clear stale presentation and rehydrate the current route/lifecycle, but it **must never** recreate a room, claim a seat or consume the invitation-entry token merely because `?invite=` remains present.

This prevents BFCache restore from duplicating create/claim side effects. A later genuine navigation/entry may still process that invitation once.

## Invitation entry

`enterInvitation(publicInviteId)` accepts only the public invitation identifier. It does not accept seat credentials.

Within one controller lifetime, each public invitation ID may invoke `onInvitationEntry(...)` only once. Re-entering the same invitation route later performs hydration only.

Initial deep-link startup and a first unseen invitation reached through browser history both enter once without manufacturing a duplicate history entry.

## Setup Back

Each setup step is pushed as a static `#setup=` history entry. Setup Back delegates to browser history so Back/Forward remain one coherent navigation model rather than a parallel setup stack.

If no browser entry is available, the controller replaces the current URL with the clean application base rather than inventing a pathname route.

## Hydrated lifecycle witness

Every hydrate/popstate/pageshow/invitation effect carries an opaque current lifecycle key supplied by the application bridge.

The router never reconstructs gameplay state from URL/history. This prevents presentation from remaining on a stale selection/setup surface after canonical lifecycle hydration changes.

## Verification

Run:

- `node --test tests/threejs_static_navigation_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract covers pure reducer precedence, polluted credential-like URL stripping, `history.state=null`, both deployment prefixes, initial invitation entry, unseen invitation entry through Back/Forward without extra history writes, hydration-only `pageshow`, setup push/Back, Escape precedence, popstate hydration, programmatic invitation deduplication and listener attach/detach semantics.
