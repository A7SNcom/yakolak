# Three.js Migration Architecture

Status: **LOCKED by THREEJS-008 (2026-08-16)**

Scope: `threejs-rebuild` only. This document defines the browser/runtime architecture for the Three.js rewrite. It does **not** cut over `main`, change Godot Production, or resolve an `OPEN` backend contract merely because the frontend needs an answer.

Companion contracts:

- `THREEJS_SOURCE_OF_TRUTH.md`
- `THREEJS_BACKEND_GAP_REGISTER.md`
- `THREEJS_ENTRY_INVITATION_CONTRACT.md`
- `YAKOLAK_PORTABLE_KIT/`
- current `rules/` + `api/`

## 1. Non-negotiable runtime shape

The rebuilt client is a **static browser-native ES-module application**:

- `web/index.html` is the document shell.
- CSS is served as normal static `.css` files.
- JavaScript is served as normal static `.js` ES modules and loaded with `<script type="module">`.
- Internal imports use explicit file paths/extensions; no application bundler, transpiler, minifier, code generator, framework compiler, or Godot exporter is required for a normal frontend code edit.
- Three.js and any required official example loaders are pinned, committed, browser-ready ES modules under `web/vendor/three/<version>/`. The browser must not depend on npm resolution or a public CDN at runtime.
- An import map may map the bare specifier `three` and official Three.js addon paths to those vendored files. Application modules should otherwise use direct relative imports so there is no hidden resolver/build dependency.
- The accepted Three.js runtime graph contains **no Godot loader, `.pck`, `.wasm`, Godot-generated JavaScript, or Godot audio/worklet dependency**. Old Godot artifacts may remain in branch history or temporarily on disk during migration, but the new `index.html`, module graph, manifest, and runtime fetch graph must never require them.
- Server APIs remain Vercel functions under `api/`. Vercel may package those functions as part of deployment; that platform packaging is not a frontend build step and must not make ordinary browser JS/CSS edits depend on a bundle build.

The goal is deliberately simple:

`edit HTML/CSS/JS -> commit static files -> deploy static files`

No frontend build output should be a second source of truth.

## 2. Deployment boundary

The migration workspace remains `threejs-rebuild` only.

- `main` remains the Godot source branch until explicit cutover.
- `https://yakolak.vercel.app/` remains Godot Production until explicit cutover.
- Current Vercel configuration uses `framework: null`, serves `web/`, and disables Git deployment for branches other than `main`; this task does not change that protection.
- The current `vercel.json` may retain a trivial validation `buildCommand` such as checking that `web/index.html` exists. Such a check is allowed because it does not compile, bundle, transform, or generate the browser application.
- No preview/production deployment is required to define this architecture.

## 3. Important unresolved-task guard

`THREEJS_BACKEND_GAP_REGISTER.md` currently contains a task-number collision: it names **THREEJS-008** as the resolution owner for `GAP-001` seat topology/turn order, while the actual THREEJS-008 instruction that created this document is **DEFINE THE STATIC NO-BUILD THREE.JS ARCHITECTURE**.

This architecture task therefore makes **no seat-order, starter, skip-evidence, deadline, bot, invitation, ready/start, TTL, restart, mutation-envelope, recovery, telemetry-trust, persistence, or cutover resolution**. Every such gap remains `OPEN` unless a separate explicit resolution actually updates the governing register/source-of-truth contract. Future implementation must not interpret this document's task number as evidence that `GAP-001` was resolved.

Where this architecture needs those values, it treats them as opaque authoritative state supplied by the selected authority adapter.

## 4. One-way architecture

There is one mutation path and one presentation path.

```text
input sources
(pointer/touch/keyboard/gamepad/UI controls)
        |
        v
Intent -> Application Controller -> Authority Port
                               |        |
                               |        +--> Local Authority -> shared rules/transitions
                               |        |
                               |        +--> Remote Authority -> API Transport -> api/
                               |
                               v
                     Canonical State Store
                               |
                               v
                   read-only selectors/events
                 /       |       |       |       \
                v        v       v       v        v
              Scene     UI     Camera   Motion    Audio
                         |
                         +--> may emit a new Intent only
```

Telemetry observes the flow but is not in the commit path. Asset loading, storage/session, and cache/update are adapters initialized by Boot and passed into the application; they do not own gameplay rules.

### Absolute rule

**Rendering, DOM UI, camera, motion, audio, hit-testing, loaders, storage, telemetry, and cache code never own or mutate authoritative game rules/state.**

They may:

- render a committed snapshot;
- hold ephemeral presentation state;
- derive read-only selectors;
- emit an intent;
- report telemetry.

They may not:

- advance a turn;
- award a point;
- consume inventory;
- declare a win/draw;
- choose an authoritative bot move;
- expire a deadline;
- claim a seat;
- mark readiness;
- create authority from cached/local presentation data.

## 5. Target static module layout

The exact filenames may be refined during implementation, but ownership and dependency direction are locked.

```text
web/
  index.html
  styles/
    app.css
  vendor/
    three/<pinned-version>/
      three.module.js
      addons/...
  app/
    boot/
      boot.js
      fatal-error.js
    core/
      contracts.js
      ids.js
      errors.js
    shared/
      rules.js
      transitions.js
      state-schema.js
      normalize.js
    state/
      store.js
      selectors.js
      presentation-store.js
    authority/
      authority-port.js
      local-authority.js
      remote-authority.js
    transport/
      api-client.js
      rooms-transport.js
    storage/
      session-store.js
      preferences.js
    assets/
      manifest.js
      loader.js
      registry.js
    scene/
      renderer.js
      scene-root.js
      board-view.js
      piece-view.js
      room-view.js
    camera/
      camera-controller.js
    input/
      intent.js
      pointer-input.js
      keyboard-input.js
      gamepad-input.js
      hit-test.js
    telemetry/
      telemetry-client.js
    ui/
      ui-root.js
      screens/...
    motion/
      motion-controller.js
    audio/
      audio-controller.js
    cache/
      update-policy.js
  assets/...
```

Rules for the tree:

1. `boot/` is the composition root and is the only layer allowed to know about almost every adapter.
2. `shared/` is pure JavaScript. It imports no DOM, Three.js, fetch, storage, audio, timers, telemetry, or renderer module.
3. `state/` contains serializable game/application state and read-only selectors. No Three.js objects or DOM nodes are allowed in canonical state.
4. `authority/` is the only application boundary allowed to commit a new authoritative snapshot.
5. `transport/` knows HTTP; it does not know meshes, screens, camera states, animations, or audio.
6. `scene/`, `ui/`, `camera/`, `motion/`, and `audio/` consume selectors/events and never import an authority implementation directly.
7. `input/` creates intents. It never writes the board/state and never calls a room endpoint directly.
8. `telemetry/` observes and queues events; gameplay success must not depend on telemetry persistence.
9. `storage/` stores identity/configuration permitted by the session contract, not a competing authoritative game state.
10. `cache/` controls freshness/reload behavior only; it never decides lifecycle or gameplay outcomes.

## 6. Boot boundary

`boot.js` is a composition root, not a gameplay controller.

Required order:

1. Install fatal-error/unhandled-rejection reporting.
2. Initialize cache/update policy and determine whether the document is safe to continue.
3. Load local preferences and the permitted session-identity locator/credential record.
4. Load/validate the asset manifest and required static rule/schema modules.
5. Initialize renderer and create the loading scene immediately; never show a blank canvas while large assets load.
6. Load required startup assets through the asset loader/registry.
7. Create the canonical state store and separate presentation store.
8. Select exactly one authority adapter from explicit session/setup mode.
9. Restore/fetch the initial authoritative snapshot when required.
10. Create scene, UI, camera, motion, audio, telemetry, and input adapters using dependency injection from Boot.
11. Render the complete snapshot.
12. Unlock gameplay intent emission only after authority/session restoration and the required visible state are complete.

Boot must not contain duplicated move legality, winner logic, turn advance, scoring, invitation, readiness, or timeout rules.

A boot/load failure must stay recoverable: show the approved loading-error UI and Retry, preserving the invariant that input is never enabled against a partial or guessed state.

## 7. Asset manifest and loading boundary

### Manifest

`assets/manifest.js` is a normal source-controlled ES module, not generated bundle metadata. It exports a frozen registry of logical asset IDs to static URLs plus metadata needed by loaders.

Example shape:

```js
export const ASSETS = Object.freeze({
  room: { type: 'gltf', url: '/assets/room/room.glb', startup: true },
  board: { type: 'gltf', url: '/assets/board/board.glb', startup: true },
  marbleMaterial: { type: 'texture', url: '/assets/materials/marble.webp', startup: true },
});
```

The implementation must use Kit-approved asset/layout/material mappings. Canonical gameplay IDs such as `marble` stay canonical; presentation resolves them to the approved visual/material mapping.

### Loader

The loader owns network/decode lifecycle only:

- fetch/decode static models, textures, images and audio;
- report normalized loading progress;
- support Retry after a typed failure;
- use pinned Three.js addon loaders from `web/vendor/three/...`;
- place decoded resources into an asset registry keyed by logical ID;
- dispose partially created GPU resources on failed/retried loads.

The loader does not create rules/state and does not decide whether a piece exists in gameplay. The scene asks the registry for visual resources only after canonical state says what should be visible.

No scene module should hardcode unrelated asset URLs. Asset URL changes belong in the manifest/asset layer.

## 8. Scene and renderer boundary

The scene layer owns:

- `THREE.WebGLRenderer` and render-loop lifecycle;
- the Three.js scene graph;
- lights, environment and materials;
- mesh/object registries keyed by stable gameplay/presentation IDs;
- conversion from canonical world/layout data to Three transforms;
- resize/pixel-ratio handling;
- deterministic reconciliation from state to visible objects;
- GPU/resource disposal.

The scene receives **read-only snapshots/selectors** and presentation commands. It must be possible to call a scene reconciliation function repeatedly with the same state and reach the same final visible result.

The scene must never infer an authoritative move from a mesh transform. A dragged mesh can be visually elsewhere while canonical state remains unchanged; only an accepted intent changes canonical board state.

Accepted state commits before move animation begins. Animation is a view of an already accepted transition, not the commit itself.

## 9. Camera boundary

The camera controller owns only camera presentation:

- named Kit camera poses;
- responsive pose selection;
- interpolation of position/target/orientation/FOV;
- safe-area and resize refit;
- temporary suppression of camera manipulation during scripted presentation.

It consumes lifecycle/presentation selectors and emits presentation-complete events only. It cannot advance lifecycle/gameplay state by itself.

If a camera transition is skipped, interrupted, resized, or reduced-motion is enabled, it snaps/interpolates to the same final Kit-defined pose without altering the canonical snapshot.

## 10. Input and intent boundary

All interaction sources converge on the same serializable intent model:

- pointer/tap/click;
- touch/drag;
- keyboard;
- gamepad;
- setup DOM controls;
- local bot requests where local authority is valid;
- timeout/bot/server outcomes received through authority are represented as authoritative events, not synthetic browser clicks.

An intent contains **what the user/actor requests**, never the result it wants to force. Example:

```js
{
  type: 'place-piece',
  seat: 'p2',
  size: 'medium',
  cell: 4,
  expectedRevision: 17,
  clientRequestId: '...'
}
```

Input modules may perform hit testing and local UX filtering, but they do not commit the result. A local validation failure may prevent an obviously invalid intent from being sent, but remote authority still validates every remote mutation.

Drag selection/hover/focus/candidate-target state belongs to the presentation store. It is discarded on accepted state, rejection, resync, authority change, or stale revision.

## 11. Shared rules and transitions boundary

The shared domain layer is deterministic and side-effect free.

It owns functions such as:

- rule-data validation;
- board-slot legality;
- remaining inventory derivation;
- winning-pattern detection;
- legal-move existence;
- deterministic local transition evaluation for contracts that are already resolved;
- canonical snapshot normalization/schema checks.

It receives all nondeterministic values (`now`, IDs, configured authority data) as explicit inputs. It does not call `Date.now()`, `Math.random()`, fetch, storage, DOM, Three.js or telemetry internally.

Where practical, later backend migration should import the same pure modules from `web/app/shared/` (or an explicitly relocated shared static path) so local and server validation cannot drift. Until such a backend task explicitly changes imports/contracts, current `rules/` + `api/` remain the authoritative live backend implementation.

An `OPEN` backend gap must not be filled with a convenient client reducer branch. Shared transitions may only encode behavior that is already authoritative/resolved.

## 12. Canonical state boundary

There is exactly one canonical application snapshot at a time.

Canonical state is:

- plain serializable data only;
- version/revision aware;
- free of DOM nodes, Three.js objects, promises, timers, audio nodes and animation handles;
- replaced/committed only through the application controller after an authority result;
- the sole gameplay input for scene/UI selectors.

For an offline/local session, the canonical snapshot is the state committed by Local Authority.

For an online/mixed session, the canonical browser snapshot is the **latest accepted server-authoritative snapshot**. It is a replica, not a second authority.

Pending UI state is separate. Recommended split:

```text
CanonicalState      authoritative/replicated gameplay data
PresentationState   hover, drag ghost, selected item, panel, camera/motion progress
PendingIntent       request metadata waiting for authority
```

Presentation state can never overwrite canonical board, turn, score, inventory, winner, readiness, deadline, seat ownership, or room lifecycle fields.

On stale/reconnect/resync, discard incompatible pending presentation and rebuild visible state from the new canonical snapshot before input is re-enabled.

## 13. Authority boundary

The application talks to an `AuthorityPort`; it does not know whether the implementation is local or remote.

Minimum conceptual interface:

```js
await authority.bootstrap(context)       // -> authoritative snapshot
await authority.submit(intent)           // -> accepted/rejected + snapshot
await authority.refresh(reason)           // -> current authoritative snapshot
await authority.close(reason)
```

### Local Authority

Use only when the configured session has **no online seats** and the governing contracts permit local authority.

Local Authority:

- validates intents through shared rules/transitions;
- commits the resulting canonical snapshot synchronously/deterministically;
- owns local computer decisions only for fully local sessions;
- produces the same normalized result envelope shape used by Remote Authority.

### Remote Authority

Use whenever one or more online seats make the shared service authoritative.

Remote Authority:

- sends intents through API Transport;
- treats server acceptance/rejection and returned snapshot/version as authoritative;
- never falls back to Local Authority because the network is slow or unavailable;
- locks conflicting input while a mutation is pending according to the current live contract;
- refreshes/resyncs on stale version, reconnect, resume and other contract-defined recovery points;
- treats browser-side rule checks as UX only.

For online/mixed play, no browser may become the authoritative bot, timer, seat allocator, readiness owner, invitation authority or turn driver to work around an `OPEN` backend gap.

## 14. Storage and session-identity boundary

Storage is an adapter, not authority.

It may store only data permitted by the session/recovery contract, for example:

- local UI/accessibility preferences;
- a room/invitation locator;
- the credential/session token issued for that browser/seat once the backend contract defines its persistence rules;
- non-authoritative release/update hints.

It must not restore seat ownership from remembered name/color alone and must not restore a board/turn/score as authoritative after refresh.

If a cached snapshot is ever retained for faster first paint, it must be clearly marked **untrusted/stale**, input must remain locked, and a full authoritative refresh must replace it before gameplay resumes.

The exact credential storage scope, rotation, revocation, recovery and reconnect semantics remain owned by the session-recovery backend gap; this architecture deliberately does not choose `localStorage` versus another persistence model for authority credentials before that contract is resolved.

## 15. API transport boundary

All gameplay HTTP passes through one transport layer.

Transport owns:

- endpoint URLs and methods;
- JSON serialization/parsing;
- abort/timeouts;
- same-origin credentials/headers required by the live API;
- `x-yakolak-trace` / `x-yakolak-request` correlation headers where applicable;
- mapping transport failures to typed errors;
- safe polling/retry policy;
- response normalization before authority sees it.

Transport does not own rule decisions or UI copy.

Mutation retry rules must follow each action's **current** idempotency/version contract. Do not automatically retry a mutation merely because fetch failed: current create/join/move/rematch/edit/leave semantics are not yet one uniform mutation envelope. `GAP-009` remains authoritative for later unification.

Read/poll requests may use bounded retry/backoff. Mutations may retry automatically only when the governing action is proven idempotent for the same request/mutation ID.

The UI never calls `/api/...` directly.

## 16. Telemetry boundary

Telemetry is best-effort observation and is never in the gameplay success path.

Client telemetry may capture:

- intent emitted;
- request start/end;
- accepted/rejected response;
- state revision applied;
- resync/reconnect;
- loader/render failures;
- presentation timing.

Rules:

- never include bearer/session credentials or reusable invitation authority secrets;
- use correlation IDs to connect client intent/request with server exchange when available;
- queue/batch independently from gameplay mutations;
- telemetry failure must not reject an accepted move or delay canonical commit;
- client timestamps/details are observational only and never proof of authoritative gameplay outcome.

The existing server wrapper already keeps telemetry outside the gameplay response latency path; the browser architecture preserves that separation.

Exact rebuild event taxonomy, authentication/rate-limit trust and retention remain owned by the telemetry backend gap.

## 17. UI boundary

UI is DOM/accessibility/presentation only.

It owns:

- setup/entry controls;
- lobby/invitation status presentation;
- player labels, scores, timers and status text derived from selectors;
- modal/panel focus management;
- accessibility labels/live regions;
- network/loading/error/retry presentation;
- reduced-motion preference controls.

UI reads canonical selectors plus presentation state. UI event handlers may emit intents, but they cannot write gameplay fields or call authority/transport implementations directly.

If authoritative state does not contain a resolved ready flag, deadline, reserved invitation, seat identity, or other backend-owned fact, the UI cannot manufacture one just to complete a screen.

## 18. Motion boundary

Motion is a revision-aware presentation scheduler.

It consumes committed state deltas/events and Kit timings, then animates from the currently rendered pose to the exact committed final pose.

Rules:

- commit first, animate second;
- each animation carries the state revision/event identity that caused it;
- stale completion callbacks are ignored;
- cancel/skip/reduced-motion snaps once to the same final state;
- an animation cannot award points, consume a piece, change turn, end a round or unlock authority;
- input suppression caused by presentation is a local presentation gate only; authority still validates every submitted intent.

This keeps long camera/piece/win animations from becoming hidden state machines.

## 19. Audio boundary

Audio consumes presentation/domain events after browser audio has been unlocked by a user gesture.

It owns:

- buffer loading/decoding through the asset registry;
- gain/mute/preferences;
- spatial placement derived from scene/layout IDs where required;
- playback/cancellation keyed by event/revision.

Audio failure or autoplay denial cannot change gameplay state. Audio callbacks cannot advance lifecycle or unlock a move.

No Godot audio worklet/runtime is required by the Three.js target. If a browser AudioWorklet is later justified, it must be an independent normal static web module, not a dependency on exported Godot files.

## 20. Cache and update behavior

The no-build architecture favors **freshness and coherence over aggressive client caching of code**.

### Code/shell/manifests

Keep HTML, CSS, application JS, import maps/manifests and other mutable shell files on revalidation semantics (`max-age=0, must-revalidate` or equivalent). The current Vercel configuration already applies this conservative policy globally.

Benefits:

- a normal source edit can be deployed without generating hashed JS bundles;
- browser/Vercel ETags can return `304` when unchanged;
- new deployments do not leave long-lived stale module graphs behind.

### Large immutable assets

Assets may receive long immutable caching **only when the URL itself is content/version specific** (for example a filename changed when its bytes change). Do not mark mutable filenames immutable.

### No service worker by default

The initial Three.js architecture has no service worker/app-shell cache. A service worker can easily create split-version HTML/module/asset graphs and would undermine the fast static-edit loop. Adding one requires a separate explicit task with versioning and rollback rules.

### Update coherence

- Never hot-swap ES modules inside a running match.
- A running document stays on one loaded client module graph until full reload.
- On a detected client/API protocol/schema incompatibility, lock input and require a safe full-page refresh rather than guessing compatibility.
- A full reload must recover identity/state through the authority/session contract; cache code cannot recreate gameplay state.
- Do not append random cache-busting query strings on every request. Use normal revalidation for mutable code and intentional versioned URLs for immutable assets.

This means normal JS/CSS edits remain truly no-build while still avoiding stale-code surprises.

## 21. Three.js dependency policy

Three.js is a **source-controlled runtime dependency**, not an implicit build dependency.

- Pin one tested Three.js revision/version.
- Commit the browser ESM files actually required by the client under `web/vendor/three/<version>/`.
- Use an import map for `three`/official addons when that keeps addon imports intact.
- Do not load `three` from `unpkg`, `jsDelivr`, a mutable `latest` URL, or a runtime npm resolver.
- Upgrading Three.js is an explicit dependency-change task: update vendored files/import map, then verify rendering/loaders; ordinary gameplay/UI edits do not reinstall or rebuild Three.js.

## 22. Canonical data flow examples

### Local accepted move

```text
Pointer -> place-piece Intent
        -> Application Controller
        -> Local Authority
        -> shared validate/transition
        -> new CanonicalState(revision + 1)
        -> Store commit
        -> Scene/UI selectors update
        -> Motion animates committed placement
        -> Audio/Telemetry observe
```

### Remote accepted move

```text
Pointer -> place-piece Intent
        -> Application Controller marks PendingIntent
        -> Remote Authority
        -> API Transport
        -> current api/ validates/commits
        -> response authoritative snapshot/version
        -> normalize + Store commit
        -> PendingIntent cleared
        -> Scene/UI reconcile
        -> Motion animates committed placement
```

### Remote rejection/stale state

```text
Intent -> Remote Authority -> API rejection/current snapshot
       -> discard incompatible pending presentation
       -> replace CanonicalState with authoritative snapshot
       -> reconcile Scene/UI
       -> explain rejection/resync
       -> unlock input only when authority contract permits
```

At no point does a mesh position, DOM class, animation callback or local timer become the rule commit.

## 23. Import/dependency rules

The intended dependency direction is downward toward pure contracts, never sideways into authority from presentation.

Allowed examples:

- `boot -> authority/scene/ui/input/...`
- `local-authority -> shared/rules + shared/transitions`
- `remote-authority -> transport + shared/normalize`
- `state/selectors -> shared/state-schema`
- `scene/ui/camera/motion/audio -> state/selectors`
- `input -> intent constructors + presentation selectors`
- `api/*` may later import pure `web/app/shared/*` modules after an explicit backend migration task.

Forbidden examples:

- `scene -> remote-authority`
- `ui -> rooms-transport`
- `motion -> state.store.commit()`
- `audio -> transitions`
- `telemetry -> authority.commit()`
- `storage -> board/turn mutation`
- `input -> api fetch`
- `shared -> three/DOM/fetch/storage`

Circular imports across these ownership boundaries are architecture failures, not conveniences to tolerate.

## 24. Static/no-build acceptance criteria

A later implementation of this architecture is conformant only when all of the following are true:

1. `web/index.html` boots the Three.js app with browser-native ES modules.
2. Editing an application `.js`, `.css`, or `.html` file does not require npm build/bundle/transpile/export before it can be served.
3. Three.js browser modules are pinned and served as committed static files.
4. The browser network/import graph for the new app contains no `.pck`, `.wasm`, Godot loader, or Godot-generated runtime dependency.
5. No generated bundle is the editable source of truth.
6. Scene/UI/camera/motion/audio cannot directly commit canonical gameplay state.
7. Every user interaction reaches authority as an intent.
8. Online authority never falls back to local authority during network failure.
9. A server snapshot/resync can deterministically rebuild all gameplay visuals before input resumes.
10. Telemetry failure cannot block gameplay response/commit.
11. Cache policy allows normal static edits to become fresh through revalidation without requiring hashed bundle output.
12. Any value still covered by an `OPEN` backend gap remains opaque/unimplemented rather than being guessed in frontend code.
13. `main` and the current Godot Production deployment remain untouched until explicit cutover.

## 25. What this task intentionally does not implement

THREEJS-008 defines boundaries only. It does not yet:

- replace `web/index.html`;
- add vendored Three.js files;
- remove current Godot artifacts;
- move/share backend rule modules;
- implement a new state store/renderer/scene;
- change `api/rooms.js`;
- change persistence/telemetry schema;
- enable branch deployment;
- deploy the rebuild;
- resolve any `OPEN` backend gap.

Later implementation tasks must follow this document rather than letting whichever module is easiest to edit become a second rules/state authority.