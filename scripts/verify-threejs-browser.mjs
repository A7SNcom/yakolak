import { chromium } from 'playwright';

const baseUrl = process.env.SHELL_URL || 'http://127.0.0.1:4173/';
const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile-320x568', width: 320, height: 568 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];

const forbiddenRequest = /(?:\.pck(?:$|[?#])|\.wasm(?:$|[?#])|\/index\.js(?:$|[?#])|index\.audio|godot)/i;
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

let failed = false;

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const requests = [];
    const pageErrors = [];

    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const state = document.documentElement.dataset.bootState;
      return state === 'ready' || state === 'failed' || state === 'unsupported-webgl';
    });

    const result = await page.evaluate(async () => {
      const canvas = document.querySelector('#scene');
      const marker = document.querySelector('#build-marker');
      const status = document.querySelector('#boot-status');
      const unsupported = document.querySelector('#unsupported-webgl');
      const canvasRect = canvas?.getBoundingClientRect();
      const shell = window.__YAKOLAK_THREEJS_SHELL__;

      let boardLid = null;
      let playerBases = null;
      if (shell) {
        const boardRuntimeAsset = shell.getAsset('model.board-and-lid');
        const playerBaseRuntimeAsset = shell.getAsset('model.player-base');
        const worldLayout = shell.getAsset('data.world-layout');
        const [boardLayoutResponse, playerBaseLayoutResponse, boardModule, playerBasesModule, three] = await Promise.all([
          fetch('/assets/models/board-and-lid-layout.json', { cache: 'no-store' }),
          fetch('/assets/models/player-base-layout.json', { cache: 'no-store' }),
          import('/app/scene/board-and-lid.js'),
          import('/app/scene/player-bases.js'),
          import('three'),
        ]);
        if (!boardLayoutResponse.ok) throw new Error(`board/lid layout HTTP ${boardLayoutResponse.status}`);
        if (!playerBaseLayoutResponse.ok) throw new Error(`player-base layout HTTP ${playerBaseLayoutResponse.status}`);
        const boardLayout = await boardLayoutResponse.json();
        const playerBaseLayout = await playerBaseLayoutResponse.json();

        const boardMaterial = new three.MeshBasicMaterial();
        const objects = boardModule.createBoardAndLidObjects({ runtimeAsset: boardRuntimeAsset, layout: boardLayout, boardMaterial });
        const boardAssetSpace = objects.board.children[0];
        const lidAssetSpace = objects.lid.children[0];
        const ruleCenters = objects.getRuleCellCenters();
        const alignment = objects.getVisualAlignmentReport();
        const start = {
          boardPosition: objects.board.position.toArray(),
          boardRotation: objects.board.rotation.toArray().slice(0, 3).map((radians) => three.MathUtils.radToDeg(radians)),
          lidPosition: objects.lid.position.toArray(),
          lidRotation: objects.lid.rotation.toArray().slice(0, 3).map((radians) => three.MathUtils.radToDeg(radians)),
          lidVisible: objects.lid.visible,
        };
        objects.setLidPhase('intro-lifted');
        const lifted = { position: objects.lid.position.toArray(), visible: objects.lid.visible };
        objects.setLidPhase('post-intro');
        const final = { position: objects.lid.position.toArray(), visible: objects.lid.visible };
        boardLid = {
          runtimeFormat: boardRuntimeAsset?.format,
          semanticProfile: boardRuntimeAsset?.semanticProfile,
          semanticRoles: boardRuntimeAsset?.semanticGroups?.map((group) => group.semanticRole),
          componentCount: boardRuntimeAsset?.components?.length,
          boardMeshCount: boardAssetSpace?.children?.length,
          lidMeshCount: lidAssetSpace?.children?.length,
          ruleCenters,
          alignmentWithinTolerance: alignment.every((entry) => entry.withinTolerance),
          start,
          lifted,
          final,
        };
        objects.dispose();
        boardMaterial.dispose();

        const materialsByColor = Object.fromEntries(
          ['marble', 'blue', 'gold', 'green'].map((colorId) => [colorId, new three.MeshBasicMaterial()]),
        );
        const bases = playerBasesModule.createPlayerBaseInstances({
          runtimeAsset: playerBaseRuntimeAsset,
          geometryLayout: playerBaseLayout,
          worldLayout,
          materialsByColor,
        });
        const ownership = bases.getOwnershipSnapshot();
        const bounds = bases.getBoundsReport();
        const homeAlignment = bases.getHomeAlignmentReport();
        const seatSnapshots = bases.seatOrder.map((seatId) => {
          const seat = bases.getSeat(seatId);
          return {
            seatId,
            colorId: seat?.colorId,
            ownershipSource: seat?.base?.userData?.ownershipSource,
            position: seat?.base?.position?.toArray(),
            rotation: seat?.base?.rotation?.toArray().slice(0, 3).map((radians) => three.MathUtils.radToDeg(radians)),
            meshCount: seat?.assetSpace?.children?.length,
          };
        });
        const right = bases.getSeat('right');
        const geometrySharedAcrossSeats = Array.from({ length: playerBaseRuntimeAsset?.components?.length || 0 }, (_, index) => {
          const reference = right?.assetSpace?.children?.[index]?.geometry;
          return bases.seatOrder.every((seatId) => bases.getSeat(seatId)?.assetSpace?.children?.[index]?.geometry === reference);
        }).every(Boolean);
        playerBases = {
          runtimeFormat: playerBaseRuntimeAsset?.format,
          componentCount: playerBaseRuntimeAsset?.components?.length,
          ownership,
          bounds,
          homeAlignment,
          seatSnapshots,
          geometrySharedAcrossSeats,
        };
        bases.dispose();
        Object.values(materialsByColor).forEach((material) => material.dispose());
      }

      return {
        runtime: document.documentElement.dataset.runtime,
        bootState: document.documentElement.dataset.bootState,
        status: status?.textContent?.trim(),
        marker: marker?.textContent?.trim(),
        unsupportedHidden: unsupported?.hidden,
        canvasWidth: Math.round(canvasRect?.width || 0),
        canvasHeight: Math.round(canvasRect?.height || 0),
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        shellPresent: Boolean(shell),
        boardLid,
        playerBases,
      };
    });

    const forbidden = requests.filter((url) => forbiddenRequest.test(url));
    const requestedModule = requests.some((url) => url.includes('/vendor/three/r185/three.module.js'));
    const requestedCore = requests.some((url) => url.includes('/vendor/three/r185/three.core.js'));
    const boardGlbRequested = requests.some((url) => new URL(url).pathname === '/assets/models/board-and-lid.glb');
    const boardStlRequested = requests.some((url) => new URL(url).pathname === '/runtime-assets/models/board-and-lid.stl');
    const playerBaseGlbRequested = requests.some((url) => new URL(url).pathname === '/assets/models/player-base.glb');
    const playerBaseStlRequested = requests.some((url) => new URL(url).pathname === '/runtime-assets/models/player-base.stl');
    const near = (actual, expected, epsilon = 0.001) => Array.isArray(actual)
      && actual.length === expected.length
      && actual.every((value, index) => Math.abs(value - expected[index]) <= epsilon);
    const expectedRuleCenters = [
      [-48, 2, -48], [0, 2, -48], [48, 2, -48],
      [-48, 2, 0], [0, 2, 0], [48, 2, 0],
      [-48, 2, 48], [0, 2, 48], [48, 2, 48],
    ];
    const expectedOwnership = [
      { seatId: 'right', colorId: 'marble', source: 'world-layout.identities' },
      { seatId: 'back', colorId: 'blue', source: 'world-layout.identities' },
      { seatId: 'left', colorId: 'gold', source: 'world-layout.identities' },
      { seatId: 'front', colorId: 'green', source: 'world-layout.identities' },
    ];
    const expectedBaseTransforms = {
      right: { position: [135, 6, 0], rotation: [-90, 0, 0] },
      back: { position: [0, 6, -135], rotation: [-90, 0, -90] },
      left: { position: [-135, 6, 0], rotation: [-90, 0, 180] },
      front: { position: [0, 6, 135], rotation: [-90, 0, 90] },
    };
    const expectedBounds = {
      right: { min: [102, 0, -84.5], max: [168, 12, 84.5] },
      back: { min: [-84.5, 0, -168], max: [84.5, 12, -102] },
      left: { min: [-168, 0, -84.5], max: [-102, 12, 84.5] },
      front: { min: [-84.5, 0, 102], max: [84.5, 12, 168] },
    };
    const seatTransformsExact = result.playerBases?.seatSnapshots?.every((seat) => {
      const expected = expectedBaseTransforms[seat.seatId];
      return expected
        && seat.colorId === expectedOwnership.find((entry) => entry.seatId === seat.seatId)?.colorId
        && seat.ownershipSource === 'world-layout.identities'
        && seat.meshCount === 12
        && near(seat.position, expected.position)
        && near(seat.rotation, expected.rotation);
    });
    const playerBaseBoundsExact = result.playerBases?.bounds?.every((entry) => {
      const expected = expectedBounds[entry.seatId];
      return expected && near(entry.min, expected.min) && near(entry.max, expected.max);
    });

    const checks = {
      bootReady: result.bootState === 'ready',
      runtimeStaticEsm: result.runtime === 'threejs-static-esm',
      shellPresent: result.shellPresent,
      correctViewport: result.innerWidth === viewport.width && result.innerHeight === viewport.height,
      canvasFillsViewport: result.canvasWidth === viewport.width && result.canvasHeight === viewport.height,
      noHorizontalOverflow: !result.horizontalOverflow,
      markerVisible: Boolean(result.marker?.startsWith('DEV /')),
      unsupportedHidden: result.unsupportedHidden === true,
      noPageErrors: pageErrors.length === 0,
      noForbiddenRequests: forbidden.length === 0,
      vendoredThreeRequested: requestedModule && requestedCore,
      boardUsesCommittedGlb: boardGlbRequested && !boardStlRequested,
      boardGlbDecoded: result.boardLid?.runtimeFormat === 'yakolak-glb-components-v1'
        && result.boardLid?.semanticProfile === 'yakolak-board-intro-lid-v2'
        && result.boardLid?.componentCount === 29,
      boardAndLidIndependentlyAddressable: result.boardLid?.boardMeshCount === 28
        && result.boardLid?.lidMeshCount === 1
        && result.boardLid?.semanticRoles?.includes('board')
        && result.boardLid?.semanticRoles?.includes('intro-lid'),
      boardTransformExact: near(result.boardLid?.start?.boardPosition, [0, 6, 0])
        && near(result.boardLid?.start?.boardRotation, [-90, 0, 0]),
      lidTransformsExact: near(result.boardLid?.start?.lidPosition, [0, 62.5, 0])
        && near(result.boardLid?.start?.lidRotation, [-90, 180, 0])
        && result.boardLid?.start?.lidVisible === true
        && near(result.boardLid?.lifted?.position, [0, 802.5, 0])
        && result.boardLid?.lifted?.visible === true
        && near(result.boardLid?.final?.position, [0, 802.5, 0])
        && result.boardLid?.final?.visible === false,
      ruleCellCentersExact: JSON.stringify(result.boardLid?.ruleCenters) === JSON.stringify(expectedRuleCenters),
      visualCellCentersWithinTolerance: result.boardLid?.alignmentWithinTolerance === true,
      playerBaseUsesCommittedGlb: playerBaseGlbRequested && !playerBaseStlRequested,
      playerBaseGlbDecodedOnce: result.playerBases?.runtimeFormat === 'yakolak-glb-components-v1'
        && result.playerBases?.componentCount === 12,
      fourPlayerBasesExplicitlyOwned: JSON.stringify(result.playerBases?.ownership) === JSON.stringify(expectedOwnership),
      playerBaseTransformsExact: seatTransformsExact === true,
      playerBaseBoundsExact: playerBaseBoundsExact === true,
      playerBaseHomeStacksAligned: result.playerBases?.homeAlignment?.length === 4
        && result.playerBases.homeAlignment.every((entry) => entry.uniqueHomeCount === 3 && entry.withinTolerance === true && entry.maxErrorXZ <= 0.3),
      playerBaseGeometrySharedAcrossSeats: result.playerBases?.geometrySharedAcrossSeats === true,
    };

    const ok = Object.values(checks).every(Boolean);
    failed ||= !ok;

    console.log(JSON.stringify({
      viewport,
      ok,
      checks,
      result,
      pageErrors,
      forbiddenRequests: forbidden,
      networkRequests: requests.map((url) => new URL(url).pathname),
    }));

    await context.close();
  }
} finally {
  await browser.close();
}

if (failed) process.exit(1);
