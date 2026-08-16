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

    const result = await page.evaluate(() => {
      const canvas = document.querySelector('#scene');
      const marker = document.querySelector('#build-marker');
      const status = document.querySelector('#boot-status');
      const unsupported = document.querySelector('#unsupported-webgl');
      const canvasRect = canvas?.getBoundingClientRect();
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
        shellPresent: Boolean(window.__YAKOLAK_THREEJS_SHELL__),
      };
    });

    const forbidden = requests.filter((url) => forbiddenRequest.test(url));
    const requestedModule = requests.some((url) => url.includes('/vendor/three/r185/three.module.js'));
    const requestedCore = requests.some((url) => url.includes('/vendor/three/r185/three.core.js'));

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
