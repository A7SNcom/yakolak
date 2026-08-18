# THREEJS Resource Lifecycle Contract

Status: **THREEJS-027 authoritative lifecycle contract**

The browser shell has exactly one root lifecycle registry: `web/app/core/resource-registry.js`. `boot.js` creates it and passes the same instance into asset loading, renderer/context recovery, material creation, preview presentation and frame governance. Presentation modules must not create parallel disposal systems.

## Ownership classes

| Ownership | Lifetime | Examples | Release rule |
|---|---|---|---|
| `shared-immutable` | Root shell lifetime, reusable across setup/rematch generations | decoded canonical asset geometries, canonical materials, loaders/decoders | Reuse by stable key. A consumer scope must not destroy it. Explicit cache replacement/clear or final root teardown releases it. |
| `generation-scoped` | One shell/match/presentation generation | renderer owner, scene geometries, frame governor listeners/observer/subscriptions | `beginGeneration()` or scope release destroys the previous generation exactly once. |
| `transient` | Short staging/replacement operation | decoded asset staging, restored preview geometry, one-shot RAF/timeout handles | Replace/release immediately when superseded, cancelled, rolled back or completed. |

A resource is registered when it is created/adopted, not later during cleanup.

## Registry-owned resource kinds

The registry is the only destruction boundary for:

- geometries and instanced-mesh instance-buffer owners;
- materials and material/shader variants;
- textures and `ImageBitmap` objects;
- render targets and future shadow maps;
- the WebGL renderer;
- loaders and decoders;
- animation-frame handles;
- timeout/interval handles;
- observers;
- DOM/window/media-query/context listeners;
- subscriptions and other cleanup callbacks.

Future THREEJS-026 shadow resources, THREEJS-096 motion resources, and every later visual task MUST use this registry and an explicit ownership class. They may not add a second cleanup registry or scatter direct `.dispose()`, `.close()`, listener-removal, timer-cancellation or observer-disconnect calls through presentation modules.

## Replacement and reuse rules

1. Prefer `getOrCreateShared(stableKey, factory)` for immutable reusable resources.
2. Use a lifecycle scope for generation resources.
3. Use `replace(stableKey, nextResource)` for transient variants so the replaced resource is released before the replacement becomes authoritative.
4. Asset decoding is staged as `transient`; a successful cache commit reclassifies decoded GPU/ImageBitmap resources as `shared-immutable`.
5. Cancel/failure/rollback releases staged resources immediately.
6. Cache replacement/clear explicitly releases the replaced cached resource.
7. A consumer that borrows shared geometry/material/texture never releases it.
8. `scope.releaseDeep(value)` is scope-local: it may release only active non-shared resources owned by that exact scope. It must never destroy `shared-immutable` resources or resources owned by another scope. Root `registry.releaseDeep(value)` remains the explicit global destruction primitive for authoritative cache/rollback owners.
9. Once `scope.release()` succeeds, that scope is closed. All lifecycle-producing calls through it must fail before factories, subscriptions, observers, listeners, timers, animation handles or resources can create side effects.
10. Lifecycle metadata is validated before external work begins. Invalid ownership/kind metadata must fail before adding listeners, subscribing, observing, scheduling RAF/timers, or invoking a shared-resource factory; a rejected registration must leave both the registry and the external platform unchanged.
11. Replacement is transactional at external setup boundaries. In particular, a listener with a stable replacement key remains authoritative until the replacement listener has been installed successfully; if installation throws, the prior listener and its registry token remain active and no teardown is committed.
12. Non-shared resource identity has one active scope owner. A second scope may borrow only `shared-immutable` identity; moving transient/generation ownership requires explicit `reclassify: true`. Cross-scope observer claims must fail before `observer.observe()` runs, so an ownership rejection cannot create an untracked observation.
13. External setup is rollback-safe against reentrant registration failure. If listener installation, subscription setup, observer activation, RAF scheduling, timeout scheduling or interval scheduling succeeds but the registry becomes unusable before ownership is recorded, the new external handle is synchronously removed/unsubscribed/disconnected/cancelled and the original registration error is rethrown.
14. One-shot scheduling is completion-safe even under a synchronous platform adapter. If RAF/timeout invokes its callback before the registry token can be created, the handle is treated as already completed, cancelled best-effort, no lifecycle entry is created, and the returned token is inactive.
15. Shared factories must return a concrete resource. If a newly created shared resource cannot be registered because the registry becomes unusable or registration otherwise fails, that unowned resource is cleaned up immediately with its explicit cleanup/default disposal path. A resource that was already actively owned before the shared claim is never destroyed by this rollback.

## WebGL context loss

`context-recovery.js` marks the root registry context-lost before presentation is paused. Cleanup is idempotent and exception-contained while the context is lost. Renderer teardown does not attempt an additional forced context loss when loss has already occurred.

On restore, each registered renderer restorer is invoked once per restore generation. The preview releases the previous GPU-facing transient scope before creating and registering the restored resources. Duplicate restore notifications for one generation are ignored.

Authoritative session/seat/move state remains outside this graphics lifecycle.

## Leak invariant

After any completed `setup → play → rematch → return` cycle, the registry snapshot must return to the prior baseline for:

- GPU objects, including instanced-mesh instance buffers;
- animation-frame handles;
- timers;
- observers;
- DOM/window/media listeners;
- subscriptions.

The THREEJS-027 contract tests run consecutive lifecycle cycles and also verify context-loss/idempotent destruction, shared-resource reuse, post-release scope closure, replacement-key integrity, scope-local deep-release ownership, metadata-preflight side-effect safety, transactional listener replacement failure, cross-scope ownership isolation, reentrant external-setup rollback, synchronous one-shot completion without stale handles and failed shared-factory rollback without damaging pre-owned resources.

## Diagnostics

The ready shell exposes `getResourceRegistrySnapshot()` read-only diagnostics. This is observability only; external code must not mutate registry state through diagnostics.

## Prohibited patterns

Outside `resource-registry.js`, presentation/resource modules must not directly destroy owned Three/WebGL/ImageBitmap resources. In particular, do not add:

- `geometry.dispose()`, `material.dispose()`, `texture.dispose()`, `renderer.dispose()`;
- `imageBitmap.close()`;
- ad-hoc `cancelAnimationFrame`, `clearTimeout`, `clearInterval`;
- ad-hoc listener removal/disconnect cleanup as a parallel lifecycle system.

Component facades may keep a backward-compatible `dispose` alias, but it must only delegate to their registry-backed `release()` method.
