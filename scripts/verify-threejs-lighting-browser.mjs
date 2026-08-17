import { chromium } from 'playwright';

const baseUrl = process.env.SHELL_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

let failed = false;
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => ['ready', 'failed', 'unsupported-webgl'].includes(document.documentElement.dataset.bootState));

  const result = await page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    if (!shell) throw new Error('Three.js shell is missing');
    const runtimeData = shell.getRuntimeData();
    const [THREE, lightingModule, materialModule] = await Promise.all([
      import('three'),
      import('/app/scene/lighting-rig.js'),
      import('/app/materials/canonical-materials.js'),
    ]);

    function pixelMetrics(bytes) {
      const count = Math.floor(bytes.length / 4);
      const lumas = [];
      const contentLumas = [];
      let clippedLow = 0;
      let clippedHigh = 0;
      let saturationSum = 0;
      let contentCount = 0;
      for (let index = 0; index < count; index += 1) {
        const offset = index * 4;
        const r = bytes[offset] / 255;
        const g = bytes[offset + 1] / 255;
        const b = bytes[offset + 2] / 255;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        lumas.push(luma);
        saturationSum += saturation;
        if (luma <= 0.02) clippedLow += 1;
        if (luma >= 0.98) clippedHigh += 1;
        if (luma < 0.965 || saturation > 0.055) {
          contentLumas.push(luma);
          contentCount += 1;
        }
      }
      const sorted = [...lumas].sort((a, b) => a - b);
      const content = contentLumas.length ? contentLumas : lumas;
      const mean = lumas.reduce((sum, value) => sum + value, 0) / Math.max(lumas.length, 1);
      const contentMean = content.reduce((sum, value) => sum + value, 0) / Math.max(content.length, 1);
      const variance = content.reduce((sum, value) => sum + (value - contentMean) ** 2, 0) / Math.max(content.length, 1);
      const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))] ?? 0;
      return {
        mean,
        contentMean,
        contentStdDev: Math.sqrt(variance),
        p10: percentile(0.1),
        p50: percentile(0.5),
        p90: percentile(0.9),
        clippedLowFraction: clippedLow / Math.max(count, 1),
        clippedHighFraction: clippedHigh / Math.max(count, 1),
        meanSaturation: saturationSum / Math.max(count, 1),
        contentFraction: contentCount / Math.max(count, 1),
      };
    }

    async function baselineMetrics(file) {
      const image = new Image();
      image.src = `/__baseline/${file}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return { file, width: canvas.width, height: canvas.height, ...pixelMetrics(pixels) };
    }

    const baseline = await Promise.all([
      baselineMetrics('production-320x568.png'),
      baselineMetrics('production-390x844.png'),
      baselineMetrics('production-1440x900.png'),
    ]);

    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(2);
    renderer.setSize(390, 844, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(runtimeData.materials.palette.wall);
    const materialSystem = materialModule.createCanonicalMaterialSystem({ runtimeData });
    const lighting = lightingModule.createMinimalLightingRig({ runtimeData });
    scene.add(lighting.root);

    const geometry = new THREE.SphereGeometry(1, 24, 16);
    const fixture = new THREE.Group();
    const meshes = materialModule.CANONICAL_PLAYER_IDS.map((colorId) => {
      const mesh = new THREE.Mesh(geometry, materialSystem.getPlayerMaterial(colorId));
      mesh.userData.colorId = colorId;
      fixture.add(mesh);
      return mesh;
    });
    scene.add(fixture);

    const camera = new THREE.PerspectiveCamera(45, 390 / 844, 0.1, 20000);
    const gl = renderer.getContext();
    const sample = new Uint8Array(4);

    function arrangeFixture(cameraSpec) {
      camera.position.fromArray(cameraSpec.position);
      camera.up.set(0, 1, 0);
      camera.fov = cameraSpec.fov;
      camera.aspect = 390 / 844;
      camera.near = 0.1;
      camera.far = 20000;
      camera.lookAt(...cameraSpec.target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      const target = new THREE.Vector3().fromArray(cameraSpec.target);
      const position = new THREE.Vector3().fromArray(cameraSpec.position);
      const forward = target.clone().sub(position).normalize();
      let right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
      if (right.lengthSq() < 1e-6) right = new THREE.Vector3(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, forward).normalize();
      const distance = Math.max(position.distanceTo(target), 1);
      const radius = Math.max(4, distance * 0.032);
      const spacing = radius * 2.55;
      const offsets = [[-0.55, 0.55], [0.55, 0.55], [-0.55, -0.55], [0.55, -0.55]];
      meshes.forEach((mesh, index) => {
        mesh.scale.setScalar(radius);
        mesh.position.copy(target)
          .addScaledVector(right, offsets[index][0] * spacing)
          .addScaledVector(up, offsets[index][1] * spacing);
      });
      fixture.updateMatrixWorld(true);
    }

    function sampleMeshCenter(mesh) {
      const projected = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      const width = renderer.domElement.width;
      const height = renderer.domElement.height;
      const x = Math.max(0, Math.min(width - 1, Math.round((projected.x * 0.5 + 0.5) * (width - 1))));
      const y = Math.max(0, Math.min(height - 1, Math.round((projected.y * 0.5 + 0.5) * (height - 1))));
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sample);
      const rgb = [sample[0] / 255, sample[1] / 255, sample[2] / 255];
      const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      return { colorId: mesh.userData.colorId, rgb, luma };
    }

    const cameraReports = [];
    for (const [cameraId, spec] of Object.entries(runtimeData.cameras)) {
      arrangeFixture(spec);
      renderer.render(scene, camera);
      gl.finish();
      const samples = meshes.map(sampleMeshCenter);
      let minPairDistance = Infinity;
      for (let a = 0; a < samples.length; a += 1) {
        for (let b = a + 1; b < samples.length; b += 1) {
          const distance = Math.hypot(
            samples[a].rgb[0] - samples[b].rgb[0],
            samples[a].rgb[1] - samples[b].rgb[1],
            samples[a].rgb[2] - samples[b].rgb[2],
          );
          minPairDistance = Math.min(minPairDistance, distance);
        }
      }
      cameraReports.push({
        cameraId,
        minLuma: Math.min(...samples.map((entry) => entry.luma)),
        maxLuma: Math.max(...samples.map((entry) => entry.luma)),
        minPairDistance,
        samples,
      });
    }

    arrangeFixture(runtimeData.cameras.playPortrait2 || Object.values(runtimeData.cameras)[0]);
    for (let index = 0; index < 20; index += 1) renderer.render(scene, camera);
    gl.finish();
    const frameMs = [];
    for (let index = 0; index < 80; index += 1) {
      fixture.rotation.y = index * 0.006;
      const started = performance.now();
      renderer.render(scene, camera);
      gl.finish();
      frameMs.push(performance.now() - started);
    }
    frameMs.sort((a, b) => a - b);
    const percentile = (p) => frameMs[Math.min(frameMs.length - 1, Math.floor((frameMs.length - 1) * p))];
    const mobileCost = {
      viewport: [390, 844],
      deviceScaleFactor: 2,
      synchronizedFrames: frameMs.length,
      medianFrameMs: percentile(0.5),
      p95FrameMs: percentile(0.95),
      maxFrameMs: frameMs[frameMs.length - 1],
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      programs: renderer.info.programs?.length ?? 0,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
      shadows: renderer.shadowMap.enabled,
      environmentMap: scene.environment !== null,
      neutralLightCount: lighting.snapshot().neutralLightCount,
    };

    const width = renderer.domElement.width;
    const height = renderer.domElement.height;
    const fullPixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, fullPixels);
    const candidateMetrics = pixelMetrics(fullPixels);
    const baselineContentMeans = baseline.map((entry) => entry.contentMean);
    const tuningEnvelope = {
      contentMeanMin: Math.max(0.05, Math.min(...baselineContentMeans) * 0.35),
      contentMeanMax: Math.min(0.95, Math.max(...baselineContentMeans) * 1.8),
      maxContentClipFraction: 0.25,
    };

    const shellLightingBefore = shell.getLightingSnapshot();
    shell.setPreviewTurnEmphasis('blue');
    const shellLightingActive = shell.getLightingSnapshot();
    shell.setPreviewTurnEmphasis(null);
    const shellLightingAfter = shell.getLightingSnapshot();

    geometry.dispose();
    lighting.dispose();
    materialSystem.dispose();
    renderer.dispose();

    return {
      bootState: document.documentElement.dataset.bootState,
      lightingState: document.documentElement.dataset.canonicalLighting,
      baseline,
      candidateMetrics,
      tuningEnvelope,
      cameraReports,
      mobileCost,
      shellLightingBefore,
      shellLightingActive,
      shellLightingAfter,
    };
  });

  const checks = {
    bootReady: result.bootState === 'ready' && result.lightingState === 'ready',
    noPageErrors: pageErrors.length === 0,
    frozenBaselinePixelsLoaded: result.baseline.length === 3 && result.baseline.every((entry) => entry.width > 0 && entry.height > 0),
    baselineActuallyTunesCandidate: result.candidateMetrics.contentMean >= result.tuningEnvelope.contentMeanMin
      && result.candidateMetrics.contentMean <= result.tuningEnvelope.contentMeanMax
      && result.candidateMetrics.clippedLowFraction <= result.tuningEnvelope.maxContentClipFraction
      && result.candidateMetrics.clippedHighFraction <= result.tuningEnvelope.maxContentClipFraction,
    allCanonicalCamerasMeasured: result.cameraReports.length === 16,
    materialsReadableEveryCamera: result.cameraReports.every((entry) => entry.minLuma > 0.035
      && entry.maxLuma < 0.985
      && entry.minPairDistance > 0.025),
    minimalNeutralRig: result.shellLightingBefore?.neutral?.neutralLightCount === 3
      && JSON.stringify(result.shellLightingBefore.neutral.lightTypes) === JSON.stringify(['HemisphereLight', 'DirectionalLight', 'DirectionalLight'])
      && result.shellLightingBefore.neutral.fillFold === 'hemisphere'
      && result.shellLightingBefore.neutral.shadows === false
      && result.shellLightingBefore.neutral.environmentMap === false,
    turnEmphasisSeparated: result.shellLightingBefore.turnEmphasis.lightCount === 0
      && result.shellLightingActive.turnEmphasis.activePlayerId === 'blue'
      && result.shellLightingActive.turnEmphasis.neutralLightingMutation === false
      && JSON.stringify(result.shellLightingBefore.neutral.intensities) === JSON.stringify(result.shellLightingActive.neutral.intensities)
      && JSON.stringify(result.shellLightingBefore.neutral.intensities) === JSON.stringify(result.shellLightingAfter.neutral.intensities),
    mobileCostRecordedBeforeExtras: result.mobileCost.synchronizedFrames === 80
      && Number.isFinite(result.mobileCost.medianFrameMs)
      && Number.isFinite(result.mobileCost.p95FrameMs)
      && result.mobileCost.p95FrameMs < 100
      && result.mobileCost.drawCalls <= 4
      && result.mobileCost.triangles < 10000
      && result.mobileCost.textures === 0
      && result.mobileCost.shadows === false
      && result.mobileCost.environmentMap === false
      && result.mobileCost.neutralLightCount === 3,
  };
  const ok = Object.values(checks).every(Boolean);
  failed ||= !ok;
  console.log(JSON.stringify({ ok, checks, result, pageErrors }));
  await context.close();
} finally {
  await browser.close();
}

if (failed) process.exit(1);
