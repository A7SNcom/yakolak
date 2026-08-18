import { test, expect } from '@playwright/test';

test.skip(!process.env.PAGES015_API_ORIGIN, 'manual PAGES-015 live CORS gate only');

test('PAGES-015 GitHub Pages browser origin can fetch live Worker health through CORS', async ({ page }) => {
  const apiOrigin = String(process.env.PAGES015_API_ORIGIN || '').replace(/\/$/, '');
  expect(apiOrigin).toMatch(/^https:\/\/[^/]+$/);

  await page.goto('https://a7sncom.github.io/yakolak/threejs/', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  expect(new URL(page.url()).origin).toBe('https://a7sncom.github.io');

  const result = await page.evaluate(async (origin) => {
    try {
      const response = await fetch(`${origin}/health?pages015-browser=${crypto.randomUUID()}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
      });
      const body = await response.json().catch(() => null);
      return {
        fetchResolved: true,
        status: response.status,
        ok: response.ok && body?.ok === true,
        compatibility: body?.compatibility || null,
      };
    } catch (error) {
      return {
        fetchResolved: false,
        error: String(error?.message || error),
      };
    }
  }, apiOrigin);

  expect(result.fetchResolved, JSON.stringify(result)).toBe(true);
  expect(result.status).toBe(200);
  expect(result.ok).toBe(true);
  expect(result.compatibility?.protocol?.id).toBe('yakolak-online-room');
  expect(String(result.compatibility?.protocol?.version)).toBe('1');
  expect(result.compatibility?.capabilities?.id).toBe('yakolak-online-room-capabilities-v1');
  expect(result.compatibility?.turso?.id).toBe('yakolak-pages005-room-probe');
  expect(result.compatibility?.turso?.version).toBe(1);
  expect(String(result.compatibility?.worker?.versionId || '')).not.toBe('');
});
