import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.YAKOLAK_UX_SELECT_46_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];

test.use({ launchOptions: { args: ARGS } });
test.describe.configure({ timeout: 90000, mode: 'serial' });

function snapshot() {
  const body = document.body;
  const yakolakDataset = {};
  if (body) {
    for (const [key, value] of Object.entries(body.dataset)) {
      if (key.toLowerCase().includes('yakolak')) yakolakDataset[key] = value;
    }
  }
  return {
    href: location.href,
    readyState: document.readyState,
    webdriver: navigator.webdriver,
    canvasCount: document.querySelectorAll('canvas').length,
    bridge: body?.dataset?.yakolakUxSelect46Bridge || '',
    gameplay: body?.dataset?.yakolakGameplay || '',
    setup: body?.dataset?.yakolakSetup || '',
    preintro: body?.dataset?.yakolakPreIntro || '',
    handoff: body?.dataset?.yakolakIntroHandoffEvent || '',
    funcs: {
      start: typeof window.yakolakUx46StartPassPlay,
      clear: typeof window.yakolakUx46ClearSelection,
      refresh: typeof window.yakolakUx46RefreshPickTargets,
      inheritedRefresh: typeof window.yakolakTestRefreshPickTargets,
      select44Start: typeof window.yakolakTestSelect44StartMatrix,
    },
    yakolakDataset,
  };
}

test('UX-SELECT-46 startup bridge probe', async ({ page }) => {
  const consoleLines = [];
  const pageErrors = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLines.push(`${msg.type()}: ${text}`);
    if (/error|script|invalid|parse|godot|yakolak/i.test(text)) console.log(`UX46_BROWSER_CONSOLE ${msg.type()} ${text}`);
  });
  page.on('pageerror', error => {
    pageErrors.push(String(error));
    console.log(`UX46_PAGE_ERROR ${String(error)}`);
  });

  await page.goto(`${BASE_URL}/?yakolakTestFast=1&uxSelect46=1`, { waitUntil: 'domcontentloaded' });
  let last = null;
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(1500);
    last = await page.evaluate(snapshot);
    console.log(`UX46_STARTUP_SNAPSHOT t=${((i + 1) * 1.5).toFixed(1)}s ${JSON.stringify(last)}`);
    if (last.bridge === 'ready') break;
  }
  console.log(`UX46_STARTUP_ERRORS ${JSON.stringify(pageErrors)}`);
  console.log(`UX46_STARTUP_CONSOLE_TAIL ${JSON.stringify(consoleLines.slice(-30))}`);
  expect(last?.bridge).toBe('ready');
  expect(last?.funcs?.start).toBe('function');
  expect(last?.funcs?.clear).toBe('function');
  expect(last?.funcs?.refresh).toBe('function');
});
