import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const failures = [];

page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
page.on('console', message => {
  const text = message.text();
  console.log(`[browser:${message.type()}] ${text}`);
  if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
});

try {
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 120000 });
  const state = await page.locator('body').getAttribute('data-state');
  const version = await page.locator('body').getAttribute('data-version');
  if (state !== 'ready') throw new Error(`unexpected shell state: ${state}`);
  if (version !== '2.2.0') throw new Error(`unexpected version: ${version}`);
  await page.screenshot({ path: 'web-smoke-2.2.png', fullPage: true });
  if (failures.length) throw new Error(failures.join('\n'));
  console.log('YAKOLAK_WEB_SMOKE_OK version=2.2.0');
} finally {
  await browser.close();
}
