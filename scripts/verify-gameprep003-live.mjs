import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.GAMEPREP003_BASE_URL || 'https://a7sncom.github.io/yakolak/threejs/';
const timeoutMs = Number(process.env.GAMEPREP003_TIMEOUT_MS || 25_000);

function attachDiagnostics(page, label) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => {
    const message = error?.stack || error?.message || String(error);
    pageErrors.push(message);
    console.log(JSON.stringify({ label, event: 'pageerror', message }));
  });
  page.on('console', message => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const text = message.text();
    consoleErrors.push(`${message.type()}:${text}`);
    console.log(JSON.stringify({ label, event: `console-${message.type()}`, message: text }));
  });
  return { pageErrors, consoleErrors };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    bootState: document.documentElement.dataset.bootState || null,
    gameprep003: document.documentElement.dataset.gameprep003 || null,
    preIntro: document.documentElement.dataset.yakolakPreIntro || null,
    intro: document.documentElement.dataset.yakolakIntro || null,
    loaderHandoff: document.documentElement.dataset.yakolakLoaderHandoff || null,
    fastplayScene: document.documentElement.dataset.fastplayScene || null,
    setupHidden: document.querySelector('#local-setup')?.hidden ?? null,
    overlayHidden: document.querySelector('.overlay')?.hidden ?? null,
    phases: window.__yakolakApprovedIntroPhases || [],
    introSnapshot: window.__YAKOLAK_THREEJS_SHELL__?.getIntroSnapshot?.() || null,
    resources: window.__YAKOLAK_THREEJS_SHELL__?.getResourceRegistrySnapshot?.() || null,
  }));
}

async function waitForSetupWithDiagnostics(page, label, timeout = timeoutMs) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await snapshot(page);
    console.log(JSON.stringify({ label, elapsedMs: Date.now() - started, ...last }));
    if (last.bootState === 'setup-ready' && last.setupHidden === false) return last;
    await page.waitForTimeout(1_000);
  }
  const error = new Error(`${label}: setup did not become visible within ${timeout}ms`);
  error.snapshot = last;
  throw error;
}

function assertApprovedNormalPhases(result, diagnostics) {
  const names = result.phases.map(entry => entry.phase);
  for (const required of ['matched', 'star-to-3d', 'camera-orbit', 'box-closed-descending', 'box-closed-landed', 'lid-opening', 'complete']) {
    assert.ok(names.includes(required), `normal intro never visibly reached ${required}: ${names.join(' > ')}`);
  }
  assert.equal(names.filter(name => name === 'complete').length, 1, 'normal intro completed more than once in one page load');
  assert.equal(diagnostics.pageErrors.length, 0, `normal page errors: ${diagnostics.pageErrors.join(' | ')}`);
}

async function runNormal(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const diagnostics = attachDiagnostics(page, 'normal');
  try {
    await page.goto(`${baseUrl}?gameprep003=normal-${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const result = await waitForSetupWithDiagnostics(page, 'normal');
    assertApprovedNormalPhases(result, diagnostics);

    const beforeReload = result.phases.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloaded = await waitForSetupWithDiagnostics(page, 'reload');
    const names = reloaded.phases.map(entry => entry.phase);
    assert.equal(names.filter(name => name === 'complete').length, 1, 'reload intro did not complete exactly once for the new page load');
    assert.ok(reloaded.phases.length >= 2, 'reload lost intro phase evidence');
    assert.equal(reloaded.bootState, 'setup-ready');
    assert.ok(beforeReload >= 2, 'first page load did not record intro evidence');
    assert.equal(diagnostics.pageErrors.length, 0, `reload page errors: ${diagnostics.pageErrors.join(' | ')}`);
    return { normal: result, reload: reloaded };
  } finally {
    await context.close();
  }
}

async function runReduced(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const diagnostics = attachDiagnostics(page, 'reduced');
  try {
    const started = Date.now();
    await page.goto(`${baseUrl}?gameprep003=reduced-${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const result = await waitForSetupWithDiagnostics(page, 'reduced', 15_000);
    const elapsedMs = Date.now() - started;
    assert.equal(result.introSnapshot?.reducedMotion, true, 'THREEJS-096 did not observe Reduced Motion');
    assert.equal(result.bootState, 'setup-ready');
    assert.equal(diagnostics.pageErrors.length, 0, `reduced page errors: ${diagnostics.pageErrors.join(' | ')}`);
    assert.ok(elapsedMs < 15_000, `Reduced Motion stranded setup for ${elapsedMs}ms`);
    return { result, elapsedMs };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const normal = await runNormal(browser);
  const reduced = await runReduced(browser);
  console.log(JSON.stringify({
    GAMEPREP_003_PUBLIC_INTRO: 'PASS',
    normalPhases: normal.normal.phases.map(entry => entry.phase),
    reloadPhases: normal.reload.phases.map(entry => entry.phase),
    reducedElapsedMs: reduced.elapsedMs,
  }));
} finally {
  await browser.close();
}
