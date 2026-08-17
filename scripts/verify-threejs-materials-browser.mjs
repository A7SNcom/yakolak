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

  const result = await page.evaluate(() => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    if (!shell) throw new Error('Three.js shell is missing');
    const runtimeData = shell.getRuntimeData?.();
    const materials = shell.getMaterialSnapshot?.();
    if (!runtimeData || !materials) throw new Error('Canonical runtime/material data is missing');
    return {
      bootState: document.documentElement.dataset.bootState,
      materialState: document.documentElement.dataset.canonicalMaterials,
      runtimeColors: runtimeData.rules.colors,
      runtimeColorIdentity: runtimeData.colorIdentity,
      runtimePalette: runtimeData.materials.palette,
      playerIds: materials.playerIds,
      playerPresentation: materials.playerPresentation,
      stateCues: materials.stateCues,
      materials: materials.materials,
    };
  });

  const expectedPalette = {
    wall: '#f7f7f4', floor: '#deddd7', table: '#aeb2b6', board: '#4a5562',
    marble: '#f1eee6', blue: '#3769a5', gold: '#b78a44', green: '#2f856a', ink: '#3f3f3f',
  };
  const expectedIds = ['marble', 'blue', 'gold', 'green'];
  const uuids = Object.values(result.materials).map((entry) => entry.uuid);
  const checks = {
    bootReady: result.bootState === 'ready' && result.materialState === 'ready',
    noPageErrors: pageErrors.length === 0,
    runtimeIdentitySingleSource: JSON.stringify(result.runtimeColors) === JSON.stringify(expectedIds)
      && JSON.stringify(result.runtimeColorIdentity.canonicalPlayableIds) === JSON.stringify(expectedIds),
    paletteExact: JSON.stringify(result.runtimePalette) === JSON.stringify(expectedPalette),
    playerIdsExact: JSON.stringify(result.playerIds) === JSON.stringify(expectedIds),
    marbleIsWhiteMarblePresentation: result.playerPresentation.marble.displayName === 'white marble'
      && result.playerPresentation.marble.materialKey === 'marble'
      && result.playerPresentation.marble.gameplayId === 'marble',
    playerMaterialsExact: expectedIds.every((id) => result.materials[id]?.colorHex === expectedPalette[id]
      && result.materials[id]?.gameplayId === id
      && typeof result.materials[id]?.nonColorIdentityCue === 'string'),
    neutralMaterialsExact: ['wall', 'floor', 'table', 'board', 'ink'].every((key) => result.materials[key]?.colorHex === expectedPalette[key]),
    materialsAreSharedRegistryEntries: uuids.length === 9 && new Set(uuids).size === 9,
    stateCuesNeverColorOnly: ['selected', 'active', 'winner'].every((state) => {
      const cue = result.stateCues[state];
      return cue?.requiresNonColorCue === true && cue?.hueOnlyAllowed === false && cue?.brightnessOnlyAllowed === false;
    }),
    finishCuesDistinct: new Set(expectedIds.map((id) => result.materials[id].nonColorIdentityCue)).size === 4,
    marbleFinishReadable: result.materials.marble.roughness === 0.88 && result.materials.marble.metalness === 0,
    blueFinishReadable: result.materials.blue.roughness === 0.72 && result.materials.blue.metalness === 0,
    goldFinishReadable: result.materials.gold.roughness === 0.38 && result.materials.gold.metalness === 0.12,
    greenFinishReadable: result.materials.green.roughness === 0.56 && result.materials.green.metalness === 0,
  };

  const ok = Object.values(checks).every(Boolean);
  failed ||= !ok;
  console.log(JSON.stringify({ ok, checks, result, pageErrors }));
  await context.close();
} finally {
  await browser.close();
}

if (failed) process.exit(1);
