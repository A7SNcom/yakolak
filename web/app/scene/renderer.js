import * as THREE from 'three';
import { createResourceRegistry, RESOURCE_KINDS, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import { createContextRecoveryController } from './context-recovery.js';

// THREEJS-012/014/027: this module is the only renderer/canvas owner.
// Destructive GPU cleanup is delegated to the shared resource registry.
const DIAGNOSTICS_KEY = '__YAKOLAK_RENDERER_INFO__';

export const RENDERER_BASELINE = Object.freeze({
  canvasId: 'scene',
  canvasClassName: 'scene',
  clearColor: 0x0b1018,
  clearAlpha: 1,
  toneMappingExposure: 1,
});

const WEBGL2_CONTEXT_ATTRIBUTES = Object.freeze({
  alpha: false,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'default',
  failIfMajorPerformanceCaveat: false,
});

let activeOwner = null;

export class WebGLNotSupportedError extends Error {
  constructor(message = 'WebGL 2 is unavailable') {
    super(message);
    this.name = 'WebGLNotSupportedError';
  }
}

export class RendererOwnershipError extends Error {
  constructor(message = 'The primary WebGL2 renderer already has an owner') {
    super(message);
    this.name = 'RendererOwnershipError';
  }
}

function requireMount(mount) {
  if (!(mount instanceof HTMLElement)) {
    throw new TypeError('Renderer owner requires an HTMLElement mount');
  }
  if (mount.querySelector('canvas')) {
    throw new RendererOwnershipError('Renderer mount must not contain a second canvas');
  }
}

function createOwnedCanvas(mount) {
  const canvas = document.createElement('canvas');
  canvas.id = RENDERER_BASELINE.canvasId;
  canvas.className = RENDERER_BASELINE.canvasClassName;
  canvas.dataset.rendererOwner = 'primary-webgl2';
  canvas.setAttribute('aria-label', 'Three.js preview scene');
  mount.prepend(canvas);
  return canvas;
}

function positiveDimension(value, fallback) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return Math.max(1, Math.round(number));
  return Math.max(1, Math.round(fallback || 1));
}

export function createRendererOwner({ mount, resourceRegistry = null }) {
  if (activeOwner && !activeOwner.disposed) {
    throw new RendererOwnershipError();
  }

  requireMount(mount);
  const ownsRegistry = !resourceRegistry;
  const registry = resourceRegistry || createResourceRegistry();
  const lifecycle = registry.createScope('renderer-owner', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });

  const canvas = createOwnedCanvas(mount);
  lifecycle.register(canvas, {
    kind: RESOURCE_KINDS.DOM_NODE,
    label: 'primary-webgl2-canvas',
  });

  const context = canvas.getContext('webgl2', WEBGL2_CONTEXT_ATTRIBUTES);
  if (!context) {
    lifecycle.release('webgl2-unavailable');
    if (ownsRegistry) registry.dispose('renderer-bootstrap-failed');
    throw new WebGLNotSupportedError();
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context });
  } catch (error) {
    lifecycle.release('renderer-construction-failed');
    if (ownsRegistry) registry.dispose('renderer-bootstrap-failed');
    throw error;
  }

  lifecycle.register(renderer, {
    kind: RESOURCE_KINDS.RENDERER,
    label: 'primary-webgl2-renderer',
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = RENDERER_BASELINE.toneMappingExposure;
  renderer.autoClear = true;
  renderer.setClearColor(RENDERER_BASELINE.clearColor, RENDERER_BASELINE.clearAlpha);
  renderer.shadowMap.enabled = false;

  let disposed = false;
  let diagnosticsTarget = null;
  let displayState = Object.freeze({ width: 0, height: 0, pixelRatio: 0 });
  const resourceRestorers = new Set();

  const contextRecovery = createContextRecoveryController({
    canvas,
    resourceRegistry: registry,
    async restoreResources({ generation }) {
      displayState = Object.freeze({ width: 0, height: 0, pixelRatio: 0 });
      for (const restorer of [...resourceRestorers]) {
        await restorer(Object.freeze({ generation }));
      }
    },
  });
  lifecycle.registerCleanup(() => contextRecovery.release(), {
    label: 'context-recovery-controller',
  });

  function assertLive() {
    if (disposed) throw new RendererOwnershipError('Renderer owner has been disposed');
  }

  function resizeToDisplaySize({ width, height, pixelRatio } = {}) {
    assertLive();

    const displayWidth = positiveDimension(width, canvas.clientWidth);
    const displayHeight = positiveDimension(height, canvas.clientHeight);
    const ratio = Number(pixelRatio);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      throw new TypeError('Renderer resize requires a positive pixelRatio from the frame governor');
    }

    if (!contextRecovery.canUseGpu) {
      return Object.freeze({
        width: displayWidth,
        height: displayHeight,
        pixelRatio: ratio,
        drawingBufferWidth: canvas.width,
        drawingBufferHeight: canvas.height,
        resized: false,
        skipped: true,
      });
    }

    const resized = displayState.width !== displayWidth
      || displayState.height !== displayHeight
      || Math.abs(displayState.pixelRatio - ratio) > 0.0001;

    if (resized) {
      renderer.setDrawingBufferSize(displayWidth, displayHeight, ratio);
      displayState = Object.freeze({ width: displayWidth, height: displayHeight, pixelRatio: ratio });
    }

    return Object.freeze({
      width: displayWidth,
      height: displayHeight,
      pixelRatio: ratio,
      drawingBufferWidth: canvas.width,
      drawingBufferHeight: canvas.height,
      resized,
      skipped: false,
    });
  }

  function render(scene, camera) {
    assertLive();
    if (!contextRecovery.canUseGpu) return false;
    renderer.render(scene, camera);
    return true;
  }

  function registerResourceRestorer(restorer) {
    assertLive();
    if (typeof restorer !== 'function') throw new TypeError('Resource restorer must be a function');
    resourceRestorers.add(restorer);
    const token = lifecycle.registerCleanup(() => resourceRestorers.delete(restorer), {
      kind: RESOURCE_KINDS.SUBSCRIPTION,
      label: 'resource-restorer',
    });
    return () => token.release('resource-restorer-unregistered');
  }

  function subscribeContextState(subscriber, options) {
    assertLive();
    return contextRecovery.subscribe(subscriber, options);
  }

  function getContextSnapshot() {
    return contextRecovery.snapshot();
  }

  function getResourceSnapshot() {
    return registry.snapshot();
  }

  function exposeDevelopmentDiagnostics(target = window) {
    assertLive();

    if (diagnosticsTarget === target) return renderer.info;
    if (Object.prototype.hasOwnProperty.call(target, DIAGNOSTICS_KEY)) {
      throw new RendererOwnershipError(`${DIAGNOSTICS_KEY} is already defined`);
    }

    Object.defineProperty(target, DIAGNOSTICS_KEY, {
      configurable: true,
      enumerable: false,
      get: () => renderer.info,
    });
    diagnosticsTarget = target;
    return renderer.info;
  }

  function revokeDevelopmentDiagnostics() {
    if (!diagnosticsTarget) return;
    const descriptor = Object.getOwnPropertyDescriptor(diagnosticsTarget, DIAGNOSTICS_KEY);
    if (descriptor?.configurable) delete diagnosticsTarget[DIAGNOSTICS_KEY];
    diagnosticsTarget = null;
  }

  let owner;
  function release() {
    if (disposed) return;
    disposed = true;
    revokeDevelopmentDiagnostics();
    resourceRestorers.clear();
    lifecycle.release('renderer-owner-released');
    if (activeOwner === owner) activeOwner = null;
    if (ownsRegistry) registry.dispose('renderer-owned-registry-released');
  }

  owner = Object.freeze({
    canvas,
    get disposed() {
      return disposed;
    },
    resizeToDisplaySize,
    render,
    registerResourceRestorer,
    subscribeContextState,
    getContextSnapshot,
    getResourceSnapshot,
    exposeDevelopmentDiagnostics,
    release,
    dispose: release,
  });

  activeOwner = owner;
  return owner;
}
