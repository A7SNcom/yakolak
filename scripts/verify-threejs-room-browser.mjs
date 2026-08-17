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
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => ['ready', 'failed', 'unsupported-webgl'].includes(document.documentElement.dataset.bootState));

  const result = await page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    if (!shell) throw new Error('Three.js shell is missing');
    const roomSpecText = shell.getAsset('scene.room-spec');
    const worldLayout = shell.getAsset('data.world-layout');
    const approvedContract = shell.getAsset('data.approved-contract');
    const [roomModule, THREE] = await Promise.all([
      import('/app/scene/neutral-room.js'),
      import('three'),
    ]);

    const room = roomModule.createNeutralRoom({ roomSpecText, worldLayout, approvedContract });
    const scene = new THREE.Scene();
    scene.add(room.root);
    room.root.updateMatrixWorld(true);
    const runtime = room.getRuntimeSnapshot();
    const geometryRefs = Object.values(room.surfaces).map((surface) => surface.geometry);
    const materialRefs = Object.values(room.surfaces).map((surface) => surface.material);

    const raycaster = new THREE.Raycaster();
    const ndcSamples = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(-0.9, -0.9),
      new THREE.Vector2(0.9, -0.9),
      new THREE.Vector2(-0.9, 0.9),
      new THREE.Vector2(0.9, 0.9),
    ];
    const roomSurfaces = Object.values(room.surfaces);
    const camera = new THREE.PerspectiveCamera(45, 390 / 844, 0.1, 10000);
    const smooth = (t) => t * t * (3 - 2 * t);
    const lerp = (a, b, t) => a + (b - a) * t;
    const lerpVec3 = (a, b, t) => a.map((value, index) => lerp(value, b[index], t));

    function viewHasNoVoid(position, target, fov) {
      camera.position.fromArray(position);
      camera.fov = fov;
      camera.lookAt(...target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      return ndcSamples.every((ndc) => {
        raycaster.setFromCamera(ndc, camera);
        return raycaster.intersectObjects(roomSurfaces, false).length > 0;
      });
    }

    const endpointViews = Object.entries(worldLayout.cameras).map(([name, pose]) => [
      name,
      viewHasNoVoid(pose.position, pose.target, pose.fov),
    ]);

    let sampledTravelViews = 0;
    let allTravelViewsEnclosed = true;
    for (const pair of room.layout.cameraValidation.travel) {
      const from = worldLayout.cameras[pair.from];
      const to = worldLayout.cameras[pair.to];
      for (let index = 0; index < 17; index += 1) {
        const t = smooth(index / 16);
        sampledTravelViews += 1;
        if (!viewHasNoVoid(
          lerpVec3(from.position, to.position, t),
          lerpVec3(from.target, to.target, t),
          lerp(from.fov, to.fov, t),
        )) allTravelViewsEnclosed = false;
      }
    }

    const frontInitial = room.surfaces.front.visible;
    const frontHidden = room.setFrontWallVisibility(false) === false && room.surfaces.front.visible === false;
    const frontRestored = room.setFrontWallVisibility(true) === true && room.surfaces.front.visible === true;

    const snapshot = {
      bootState: document.documentElement.dataset.bootState,
      bounds: runtime.bounds,
      dimensions: runtime.dimensions,
      surfaceBounds: runtime.surfaceBounds,
      surfaceCount: Object.keys(room.surfaces).length,
      uniqueGeometryCount: new Set(geometryRefs).size,
      uniqueMaterialCount: new Set(materialRefs).size,
      wallColor: room.materials.wall.color.getHexString(),
      floorColor: room.materials.floor.color.getHexString(),
      wallRoughness: room.materials.wall.roughness,
      wallMetalness: room.materials.wall.metalness,
      floorRoughness: room.materials.floor.roughness,
      floorMetalness: room.materials.floor.metalness,
      frontInitial,
      frontHidden,
      frontRestored,
      backContentPosition: room.contentAnchors.back.position.toArray(),
      rightContentPosition: room.contentAnchors.right.position.toArray(),
      wallContentInset: runtime.wallContentInset,
      cameraCount: room.layout.cameraValidation.cameraCount,
      travelPairCount: room.layout.cameraValidation.travel.length,
      endpointViews,
      sampledTravelViews,
      allTravelViewsEnclosed,
      voidSafety: runtime.voidSafety,
    };

    room.dispose();
    return snapshot;
  });

  const near = (actual, expected, epsilon = 0.001) => Math.abs(actual - expected) <= epsilon;
  const planeBoundsExact = (entry, expectedMin, expectedMax) => entry
    && entry.min.every((value, index) => near(value, expectedMin[index]))
    && entry.max.every((value, index) => near(value, expectedMax[index]));
  const checks = {
    bootReady: result.bootState === 'ready',
    noPageErrors: pageErrors.length === 0,
    exactDimensions: JSON.stringify(result.dimensions) === JSON.stringify({ width: 4800, height: 1900, depth: 4800 }),
    exactlySixSurfaces: result.surfaceCount === 6,
    sharedProceduralGeometry: result.uniqueGeometryCount === 2,
    sharedMatteMaterials: result.uniqueMaterialCount === 2
      && result.wallColor === 'f7f7f4'
      && result.floorColor === 'deddd7'
      && result.wallRoughness === 1 && result.floorRoughness === 1
      && result.wallMetalness === 0 && result.floorMetalness === 0,
    floorExact: planeBoundsExact(result.surfaceBounds.floor, [-2400, -650, -2400], [2400, -650, 2400]),
    ceilingExact: planeBoundsExact(result.surfaceBounds.ceiling, [-2400, 1250, -2400], [2400, 1250, 2400]),
    backExact: planeBoundsExact(result.surfaceBounds.back, [-2400, -650, -2400], [2400, 1250, -2400]),
    frontExact: planeBoundsExact(result.surfaceBounds.front, [-2400, -650, 2400], [2400, 1250, 2400]),
    leftExact: planeBoundsExact(result.surfaceBounds.left, [-2400, -650, -2400], [-2400, 1250, 2400]),
    rightExact: planeBoundsExact(result.surfaceBounds.right, [2400, -650, -2400], [2400, 1250, 2400]),
    frontVisibilityControlled: result.frontInitial === true && result.frontHidden === true && result.frontRestored === true,
    wallContentInsetExact: result.wallContentInset === 14
      && JSON.stringify(result.backContentPosition) === JSON.stringify([0, 300, -2386])
      && JSON.stringify(result.rightContentPosition) === JSON.stringify([2386, 300, 0]),
    allCanonicalCamerasCovered: result.cameraCount === 16 && result.endpointViews.length === 16
      && result.endpointViews.every(([, enclosed]) => enclosed === true),
    scriptedTravelNeverSeesVoid: result.travelPairCount === 10
      && result.sampledTravelViews === 170
      && result.allTravelViewsEnclosed === true,
    explicitVoidSafety: result.voidSafety.enclosedSurfaceCount === 6
      && result.voidSafety.defaultFrontWallVisible === true,
  };
  const ok = Object.values(checks).every(Boolean);
  failed ||= !ok;
  console.log(JSON.stringify({ ok, checks, result, pageErrors }));
  await context.close();
} finally {
  await browser.close();
}

if (failed) process.exit(1);
