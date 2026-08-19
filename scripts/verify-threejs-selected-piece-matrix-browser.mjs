import { chromium } from 'playwright';

const baseUrl = process.env.SHELL_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => ['ready', 'failed', 'unsupported-webgl'].includes(document.documentElement.dataset.bootState));

  const result = await page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    if (!shell) throw new Error('Three.js shell is missing');

    const [
      THREE,
      registryModule,
      materialModule,
      pieceModule,
      selectedModule,
      lightingModule,
      seatModule,
      stateModule,
      rulesModule,
    ] = await Promise.all([
      import('three'),
      import('/app/core/resource-registry.js'),
      import('/app/materials/canonical-materials.js'),
      import('/app/scene/pieces.js'),
      import('/app/scene/selected-piece-presentation.js'),
      import('/app/scene/lighting-rig.js'),
      import('/app/shared/seat-order.js'),
      import('/app/session/canonical-session-state.js'),
      import('/app/shared/rules.js'),
    ]);

    const worldLayout = shell.getAsset('data.world-layout');
    const approvedContract = shell.getAsset('data.approved-contract');
    const runtimeAssetsBySize = {
      small: shell.getAsset('model.piece-small'),
      medium: shell.getAsset('model.piece-medium'),
      large: shell.getAsset('model.piece-large'),
    };
    if (!worldLayout || !approvedContract || Object.values(runtimeAssetsBySize).some(asset => !asset)) {
      throw new Error('THREEJS-039 matrix requires canonical runtime data and all three piece GLBs');
    }

    const registry = registryModule.createResourceRegistry({ platform: window });
    const materialSystem = materialModule.createCanonicalMaterialSystem({
      runtimeData: approvedContract,
      resourceRegistry: registry,
    });
    const pieces = pieceModule.createPieceInstances({
      runtimeAssetsBySize,
      worldLayout,
      approvedContract,
      materialsByColor: materialSystem.players,
      resourceRegistry: registry,
    });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(approvedContract.materials.palette.wall);
    scene.add(pieces.root);
    const lighting = lightingModule.createMinimalLightingRig({ runtimeData: approvedContract });
    scene.add(lighting.root);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    renderer.setPixelRatio(1);
    renderer.setSize(320, 320, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const target = new THREE.WebGLRenderTarget(320, 320, { depthBuffer: true, stencilBuffer: false });
    const pixels = new Uint8Array(320 * 320 * 4);
    const baseline = new Uint8Array(pixels.length);
    const selectedPixels = new Uint8Array(pixels.length);
    const maskPixels = new Uint8Array(pixels.length);

    const seats = seatModule.configuredSeatOrder('marble', 4).map((slot, index) => ({
      seatId: slot.seatId,
      type: index === 0 ? 'human' : 'computer',
      color: slot.color,
      ready: true,
    }));
    const seatIdByColor = Object.fromEntries(seats.map(seat => [seat.color, seat.seatId]));

    function canonicalForColor(color, revision) {
      return stateModule.createCanonicalSessionState({
        preferredColor: 'marble',
        targetPlayers: 4,
        winsToMatch: 3,
        seats,
        board: rulesModule.emptyBoard(),
        activeSeatId: seatIdByColor[color],
        deadlineAtMs: 500_000 + revision,
        round: 1,
        revision,
        lifecycle: { phase: 'turn-loop', presentationGeneration: 30 },
      });
    }

    let requestedRenders = 0;
    const selectedPresentation = selectedModule.createSelectedPiecePresentation({
      pieceInstances: pieces,
      resourceRegistry: registry,
      requestRender() { requestedRenders += 1; },
    });

    const cameraNames = ['playDesktop', 'playCompact', 'playPortrait2', 'playPortraitCrowded'];
    const cameras = Object.fromEntries(cameraNames.map(name => {
      const config = worldLayout.cameras[name];
      const camera = new THREE.PerspectiveCamera(config.fov, 1, 1, 2400);
      camera.position.fromArray(config.position);
      camera.lookAt(...config.target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      return [name, camera];
    }));

    function renderInto(camera, destination) {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 320, 320, destination);
    }

    const maskScene = new THREE.Scene();
    maskScene.background = new THREE.Color(0x000000);
    const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    let maskMesh = null;

    function renderMask(camera, descriptor) {
      if (maskMesh) maskScene.remove(maskMesh);
      maskMesh = new THREE.Mesh(descriptor.geometry, maskMaterial);
      maskMesh.matrixAutoUpdate = false;
      maskMesh.matrix.fromArray(descriptor.matrixElements);
      maskMesh.matrixWorldNeedsUpdate = true;
      maskScene.add(maskMesh);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(maskScene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 320, 320, maskPixels);
    }

    function changedPixelStats(before, after, mask) {
      let changed = 0;
      let maskCount = 0;
      let changedInsideMask = 0;
      for (let offset = 0; offset < before.length; offset += 4) {
        const delta = Math.abs(before[offset] - after[offset])
          + Math.abs(before[offset + 1] - after[offset + 1])
          + Math.abs(before[offset + 2] - after[offset + 2]);
        const isChanged = delta >= 24;
        if (isChanged) changed += 1;
        const isMask = mask[offset] + mask[offset + 1] + mask[offset + 2] >= 600;
        if (isMask) {
          maskCount += 1;
          if (isChanged) changedInsideMask += 1;
        }
      }
      return {
        changedPixels: changed,
        maskPixels: maskCount,
        changedInsideMask,
        changedInsideMaskRatio: maskCount === 0 ? 1 : changedInsideMask / maskCount,
      };
    }

    const cases = [];
    let revision = 100;
    const baseMaterials = Object.fromEntries(Object.entries(materialSystem.players).map(([color, material]) => [color, {
      uuid: material.uuid,
      color: material.color.getHex(),
      roughness: material.roughness,
      metalness: material.metalness,
      opacity: material.opacity,
      transparent: material.transparent,
    }]));

    for (const cameraName of cameraNames) {
      const camera = cameras[cameraName];
      selectedPresentation.clear('cancel');
      renderInto(camera, baseline);

      for (const color of ['marble', 'blue', 'gold', 'green']) {
        for (const size of ['small', 'medium', 'large']) {
          const state = canonicalForColor(color, revision++);
          const pieceId = `piece:${color}:${size}:1`;
          const beforeRequest = requestedRenders;
          const selection = selectedPresentation.select(state, pieceId);
          const descriptor = pieces.getSelectionPresentationDescriptor(pieceId);
          renderInto(camera, selectedPixels);
          renderMask(camera, descriptor);
          const pixelStats = changedPixelStats(baseline, selectedPixels, maskPixels);
          const material = materialSystem.players[color];
          const materialUnchanged = material.uuid === baseMaterials[color].uuid
            && material.color.getHex() === baseMaterials[color].color
            && material.roughness === baseMaterials[color].roughness
            && material.metalness === baseMaterials[color].metalness
            && material.opacity === baseMaterials[color].opacity
            && material.transparent === baseMaterials[color].transparent;

          cases.push({
            cameraName,
            color,
            size,
            pieceId,
            selectedLogicalObjectCount: selection.selectedLogicalObjectCount,
            emphasisRenderPrimitiveCount: selection.emphasisRenderPrimitiveCount,
            immediateRenderRequest: requestedRenders === beforeRequest + 1,
            filledOverlay: selection.filledOverlay,
            neighborMaterialMutationCount: selection.neighborMaterialMutationCount,
            materialUnchanged,
            ...pixelStats,
          });
          selectedPresentation.clear('cancel');
        }
      }
    }

    const changedValues = cases.map(entry => entry.changedPixels);
    const maskRatios = cases.map(entry => entry.changedInsideMaskRatio);
    const checks = {
      matrixSize: cases.length === 48,
      exactlyOneSelectedLogicalObject: cases.every(entry => entry.selectedLogicalObjectCount === 1),
      stableThreeLinePrimitives: cases.every(entry => entry.emphasisRenderPrimitiveCount === 3),
      immediateRenderRequest: cases.every(entry => entry.immediateRenderRequest),
      noFilledOverlay: cases.every(entry => entry.filledOverlay === false),
      neutralNeighbors: cases.every(entry => entry.neighborMaterialMutationCount === 0 && entry.materialUnchanged),
      cueVisibleEverywhere: cases.every(entry => entry.changedPixels >= 4),
      selectedGeometryMostlyUnobscured: cases.every(entry => entry.maskPixels > 0 && entry.changedInsideMaskRatio <= 0.35),
      clearedAfterMatrix: selectedPresentation.snapshot().selectedLogicalObjectCount === 0,
    };

    const metrics = {
      cases: cases.length,
      cameras: cameraNames,
      colors: ['marble', 'blue', 'gold', 'green'],
      sizes: ['small', 'medium', 'large'],
      minChangedPixels: Math.min(...changedValues),
      maxChangedPixels: Math.max(...changedValues),
      maxChangedInsideMaskRatio: Math.max(...maskRatios),
      renderRequests: requestedRenders,
    };

    const failingCases = cases.filter(entry => (
      entry.selectedLogicalObjectCount !== 1
      || entry.emphasisRenderPrimitiveCount !== 3
      || !entry.immediateRenderRequest
      || entry.filledOverlay !== false
      || entry.neighborMaterialMutationCount !== 0
      || !entry.materialUnchanged
      || entry.changedPixels < 4
      || entry.maskPixels <= 0
      || entry.changedInsideMaskRatio > 0.35
    ));

    selectedPresentation.release();
    pieces.release();
    lighting.release();
    materialSystem.release();
    target.dispose();
    maskMaterial.dispose();
    renderer.dispose();
    registry.dispose('threejs-039-render-matrix-complete');

    return {
      bootState: document.documentElement.dataset.bootState,
      checks,
      metrics,
      failingCases,
      policy: selectedModule.SELECTED_PIECE_VISUAL_POLICY,
    };
  });

  const ok = result.bootState === 'ready'
    && pageErrors.length === 0
    && Object.values(result.checks).every(Boolean);
  failed ||= !ok;
  console.log(JSON.stringify({ ok, result, pageErrors }));
  await context.close();
} finally {
  await browser.close();
}

if (failed) process.exit(1);
