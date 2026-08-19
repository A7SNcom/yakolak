import { chromium } from 'playwright';

const baseUrl = process.env.SHELL_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => ['ready', 'failed', 'unsupported-webgl'].includes(document.documentElement.dataset.bootState));

  const result = await page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    if (!shell) throw new Error('Three.js shell is missing');
    const worldLayout = shell.getAsset('data.world-layout');
    const [three, layerModule, registryModule] = await Promise.all([
      import('three'),
      import('/app/scene/gameplay-interaction-layer.js'),
      import('/app/core/resource-registry.js'),
    ]);
    const registry = registryModule.createResourceRegistry({ platform: window });
    const interaction = layerModule.createGameplayInteractionLayer({ worldLayout, resourceRegistry: registry });

    const scene = new three.Scene();
    scene.add(interaction.root);
    interaction.root.updateMatrixWorld(true);

    const defaultCamera = new three.PerspectiveCamera();
    const cameraSeesInteractionLayer = defaultCamera.layers.test(interaction.zoneMesh.layers);

    const rayAt = (x, z) => {
      const raycaster = new three.Raycaster(
        new three.Vector3(x, 120, z),
        new three.Vector3(0, -1, 0),
      );
      const beforeMask = raycaster.layers.mask;
      const hit = interaction.raycast(raycaster);
      return {
        beforeMask,
        afterMask: raycaster.layers.mask,
        target: hit?.target || null,
        point: hit?.point || null,
        candidateCount: hit?.candidateCount || 0,
      };
    };

    const boardCenter = rayAt(0, 0);
    const boardNearRight = rayAt(30, 0);
    const rightStack = rayAt(135, -48);
    const emptyGap = rayAt(90, 90);

    const beforeState = interaction.snapshot();
    const materialUuidBeforeState = interaction.zoneMesh.material.uuid;
    interaction.setTargetState('board:4', { hovered: true, pressed: true, focused: true });
    const afterState = interaction.snapshot();
    const materialUuidAfterState = interaction.zoneMesh.material.uuid;

    interaction.addControlTarget({
      id: 'control:confirm',
      center: [190, 10, 190],
      size: [40, 16, 40],
    });
    interaction.root.updateMatrixWorld(true);
    const control = rayAt(190, 190);
    const withControl = interaction.snapshot();
    const removedControl = interaction.removeControlTarget('control:confirm');
    const afterRemove = rayAt(190, 190);

    const registryBeforeRelease = registry.snapshot();
    interaction.dispose();
    const registryAfterRelease = registry.snapshot();
    registry.dispose('interaction-layer-browser-complete');

    return {
      bootState: document.documentElement.dataset.bootState,
      cameraSeesInteractionLayer,
      boardCenter,
      boardNearRight,
      rightStack,
      emptyGap,
      beforeState,
      afterState,
      materialUuidBeforeState,
      materialUuidAfterState,
      control,
      withControl,
      removedControl,
      afterRemove,
      registryBeforeRelease,
      registryAfterRelease,
    };
  });

  const checks = {
    bootReady: result.bootState === 'ready',
    noPageErrors: pageErrors.length === 0,
    dedicatedLayerNotRenderedByDefaultCamera: result.cameraSeesInteractionLayer === false,
    fixedProxyCounts: result.beforeState.zoneProxyCount === 9 && result.beforeState.stackProxyCount === 12,
    twoBaseRaycastRoots: JSON.stringify(result.beforeState.raycastRoots) === JSON.stringify(['interaction-zones', 'interaction-piece-stacks']),
    invisibleSharedMaterial: result.beforeState.invisibleMaterialShared === true
      && result.beforeState.materialOpacity === 0
      && result.beforeState.materialColorWrite === false,
    boardCenterHit: result.boardCenter.target?.id === 'board:4' && result.boardCenter.target?.cellId === 4,
    overlapResolvesNearestCenter: result.boardNearRight.target?.id === 'board:5',
    rightStackHit: result.rightStack.target?.id === 'stack:right:0',
    noDecorativeFallback: result.emptyGap.target === null,
    raycasterLayerRestored: [result.boardCenter, result.boardNearRight, result.rightStack, result.emptyGap]
      .every(entry => entry.beforeMask === entry.afterMask),
    interactionStateSeparateFromMaterial: result.afterState.states.some(state => state.targetId === 'board:4'
      && state.hovered && state.pressed && state.focused)
      && result.materialUuidBeforeState === result.materialUuidAfterState
      && result.afterState.visiblePresentationMutation === false,
    laterControlProxySupported: result.control.target?.id === 'control:confirm'
      && result.withControl.controlProxyCount === 1
      && result.removedControl === true
      && result.afterRemove.target === null,
    resourceOwnershipReleased: result.registryBeforeRelease.gpuObjects > 0
      && result.registryAfterRelease.gpuObjects === 0,
  };

  const ok = Object.values(checks).every(Boolean);
  failed ||= !ok;
  console.log(JSON.stringify({ ok, checks, result, pageErrors }));
  await context.close();
} finally {
  await browser.close();
}

if (failed) process.exit(1);
