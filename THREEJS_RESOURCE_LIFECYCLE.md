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

The THREEJS-027 contract test runs 25 consecutive cycles and also verifies context-loss/idempotent destruction and shared-resource reuse.

## Diagnostics

The ready shell exposes `getResourceRegistrySnapshot()` read-only diagnostics. This is observability only; external code must not mutate registry state through diagnostics.

## Prohibited patterns

Outside `resource-registry.js`, presentation/resource modules must not directly destroy owned Three/WebGL/ImageBitmap resources. In particular, do not add:

- `geometry.dispose()`, `material.dispose()`, `texture.dispose()`, `renderer.dispose()`;
- `imageBitmap.close()`;
- ad-hoc `cancelAnimationFrame`, `clearTimeout`, `clearInterval`;
- ad-hoc listener removal/disconnect cleanup as a parallel lifecycle system.

Component facades may keep a backward-compatible `dispose` alias, but it must only delegate to their registry-backed `release()` method.
