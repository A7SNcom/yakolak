import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const previewUrl = process.env.PREVIEW_URL;
if (!previewUrl) throw new Error('PREVIEW_URL is required');
const outDir = process.env.ARTIFACT_DIR || 'artifacts/e2e';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleMessages = [];
const pageErrors = [];
const responses = [];
page.on('console', (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('response', (response) => {
  const url = response.url();
  if (url.includes('vercel.app') || url.includes('jsdelivr.net')) responses.push({ status: response.status(), url });
});

let navigationError = null;
try {
  await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
} catch (error) {
  navigationError = String(error);
}
await page.waitForTimeout(15_000);

const state = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  bodyText: document.body?.innerText?.slice(0, 2000) || '',
  bodyHtml: document.body?.innerHTML?.slice(0, 4000) || '',
  readyClass: document.body?.classList?.contains('yakolak-ready') || false,
  gameExists: Boolean(globalThis.__yakolakGame),
  pieceCount: globalThis.__yakolakGame?.pieces?.length || 0,
  loaderText: document.getElementById('yakolakLoaderStatus')?.textContent || '',
  loaderPercent: document.getElementById('yakolakLoaderPercent')?.textContent || '',
  webglCanvas: Boolean(document.querySelector('canvas')),
}));

await page.screenshot({ path: `${outDir}/diagnostic-preview.png`, fullPage: true });
const report = { previewUrl, navigationError, state, consoleMessages, pageErrors, responses: responses.slice(-100) };
await fs.writeFile(`${outDir}/diagnostic.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
