import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.V118_BASE_URL || 'http://127.0.0.1:4173';
const evidenceDir = new URL('../artifacts/v118-rounds/', import.meta.url);
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/scripts/v118-rounds-harness.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__yakolakV118Rounds));

  await page.evaluate(() => window.__yakolakOnlineSetupBridge.create({ color: 'right', targetPlayers: 2 }));
  await page.waitForSelector('#yakolakRoundChoice');
  assert.equal(await page.locator('[data-rounds="3"]').count(), 1);
  assert.equal(await page.locator('[data-rounds="5"]').count(), 1);
  assert.equal(await page.evaluate(() => window.__v118Requests.length), 0, 'room must not be created before a round choice');

  const threeBox = await page.locator('[data-rounds="3"]').boundingBox();
  const fiveBox = await page.locator('[data-rounds="5"]').boundingBox();
  assert.ok(threeBox && threeBox.height >= 48 && threeBox.width >= 120, '3-round mobile target is too small');
  assert.ok(fiveBox && fiveBox.height >= 48 && fiveBox.width >= 120, '5-round mobile target is too small');
  await page.screenshot({ path: new URL('mobile-choice.png', evidenceDir).pathname, fullPage: true });

  await page.click('[data-rounds="3"]');
  await page.waitForFunction(() => window.__v118Requests.length === 1);
  let request = await page.evaluate(() => window.__v118Requests[0]);
  assert.match(request.url, /\/api\/rooms-v118$/);
  assert.equal(request.payload.targetRounds, 3);
  assert.equal(request.payload.targetPlayers, 2);
  assert.equal(request.payload.color, 'right');
  assert.equal(await page.locator('#yakolakRoundChoice').count(), 0);

  await page.evaluate(() => window.__yakolakOnlineSetupBridge.create({ color: 'back', targetPlayers: 4 }));
  await page.waitForSelector('#yakolakRoundChoice');
  assert.equal(await page.evaluate(() => window.__v118Requests.length), 1, 'a second room must also wait for selection');
  await page.click('[data-rounds="5"]');
  await page.waitForFunction(() => window.__v118Requests.length === 2);
  request = await page.evaluate(() => window.__v118Requests[1]);
  assert.equal(request.payload.targetRounds, 5);
  assert.equal(request.payload.targetPlayers, 4);
  assert.equal(request.payload.color, 'back');

  await page.evaluate(async () => {
    document.querySelector('.yo-body').innerHTML = '<h2 class="yo-step-title">اختر لونك للانضمام</h2><div class="yo-colors"></div>';
    await fetch('/api/rooms', { method: 'POST', body: JSON.stringify({ action: 'preview', code: 'ABC234' }) });
  });
  await page.waitForSelector('.yo-round-summary');
  assert.match(await page.locator('.yo-round-summary').innerText(), /5 جولات/);
  await page.evaluate(() => {
    document.querySelector('.yo-body').innerHTML = '<h2 class="yo-step-title">اللعب أونلاين</h2>';
  });
  await page.waitForFunction(() => !document.querySelector('.yo-round-summary'));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.__yakolakOnlineSetupBridge.create({ color: 'left', targetPlayers: 3 }));
  await page.waitForSelector('#yakolakRoundChoice');
  await page.screenshot({ path: new URL('desktop-choice.png', evidenceDir).pathname, fullPage: true });
  assert.equal(await page.locator('#yakolakRoundChoice .yr-card').count(), 1);

  console.log('v118 browser round choice passed on mobile and desktop');
} finally {
  await browser.close();
}
