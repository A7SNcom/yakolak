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
      if (shell) {
        const runtimeAsset = shell.getAsset('model.board-and-lid');
        const [layoutResponse, sceneModule, three] = await Promise.all([
          fetch('/assets/models/board-and-lid-layout.json', { cache: 'no-store' }),
          import('/app/scene/board-and-lid.js'),
          import('three'),
        ]);
        if (!layoutResponse.ok) throw new Error(`board/lid layout HTTP ${layoutResponse.status}`);
        const layout = await layoutResponse.json();
        const material = new three.MeshBasicMaterial();
        const objects = sceneModule.createBoardAndLidObjects({ runtimeAsset, layout, boardMaterial: material });
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
          runtimeFormat: runtimeAsset?.format,
          semanticProfile: runtimeAsset?.semanticProfile,
          semanticRoles: runtimeAsset?.semanticGroups?.map((group) => group.semanticRole),
          componentCount: runtimeAsset?.components?.length,
          boardMeshCount: boardAssetSpace?.children?.length,
          lidMeshCount: lidAssetSpace?.children?.length,
          ruleCenters,
          alignmentWithinTolerance: alignment.every((entry) => entry.withinTolerance),
          start,
          lifted,
          final,
        };
        objects.dispose();
        material.dispose();
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
      };
    });

    const forbidden = requests.filter((url) => forbiddenRequest.test(url));
    const requestedModule = requests.some((url) => url.includes('/vendor/three/r185/three.module.js'));
    const requestedCore = requests.some((url) => url.includes('/vendor/three/r185/three.core.js'));
    const boardGlbRequested = requests.some((url) => new URL(url).pathname === '/assets/models/board-and-lid.glb');
    const boardStlRequested = requests.some((url) => new URL(url).pathname === '/runtime-assets/models/board-and-lid.stl');
    const near = (actual, expected, epsilon = 0.001) => Array.isArray(actual)
      && actual.length === expected.length
      && actual.every((value, index) => Math.abs(value - expected[index]) <= epsilon);
    const expectedRuleCenters = [
      [-48, 2, -48], [0, 2, -48], [48, 2, -48],
      [-48, 2, 0], [0, 2, 0], [48, 2, 0],
      [-48, 2, 48], [0, 2, 48], [48, 2, 48],
    ];

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
