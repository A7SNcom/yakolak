import * as THREE from 'three';

// THREEJS-012: this module is the only renderer/canvas owner; post-processing needs a measured follow-up task.
const DIAGNOSTICS_KEY = '__YAKOLAK_RENDERER_INFO__';

export const RENDERER_BASELINE = Object.freeze({
  canvasId: 'scene',
  canvasClassName: 'scene',
  maxPixelRatio: 1.5,
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

function getPixelRatio() {
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), RENDERER_BASELINE.maxPixelRatio);
}

export function createRendererOwner({ mount }) {
  if (activeOwner && !activeOwner.disposed) {
    throw new RendererOwnershipError();
  }

  requireMount(mount);
  const canvas = createOwnedCanvas(mount);
  const context = canvas.getContext('webgl2', WEBGL2_CONTEXT_ATTRIBUTES);

  if (!context) {
    canvas.remove();
    throw new WebGLNotSupportedError();
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context });
  } catch (error) {
    canvas.remove();
    throw error;
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = RENDERER_BASELINE.toneMappingExposure;
  renderer.autoClear = true;
  renderer.setClearColor(RENDERER_BASELINE.clearColor, RENDERER_BASELINE.clearAlpha);
  renderer.setPixelRatio(getPixelRatio());
  renderer.shadowMap.enabled = false;

  let disposed = false;
  let diagnosticsTarget = null;

  function assertLive() {
    if (disposed) throw new RendererOwnershipError('Renderer owner has been disposed');
  }

  function resizeToDisplaySize() {
    assertLive();

    const pixelRatio = getPixelRatio();
    if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);

    const width = Math.max(1, Math.floor(canvas.clientWidth));
    const height = Math.max(1, Math.floor(canvas.clientHeight));
    const targetWidth = Math.floor(width * pixelRatio);
    const targetHeight = Math.floor(height * pixelRatio);
    const resized = canvas.width !== targetWidth || canvas.height !== targetHeight;

    if (resized) renderer.setSize(width, height, false);
    return Object.freeze({ width, height, resized });
  }

  function render(scene, camera) {
    assertLive();
    renderer.render(scene, camera);
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
  function dispose() {
    if (disposed) return;
    disposed = true;
    revokeDevelopmentDiagnostics();
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    if (activeOwner === owner) activeOwner = null;
  }

  owner = Object.freeze({
    canvas,
    get disposed() {
      return disposed;
    },
    resizeToDisplaySize,
    render,
    exposeDevelopmentDiagnostics,
    dispose,
  });

  activeOwner = owner;
  return owner;
}
