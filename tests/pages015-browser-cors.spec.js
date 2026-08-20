import { test, expect } from '@playwright/test';

test.skip(!process.env.PAGES015_API_ORIGIN, 'manual PAGES-015 live CORS gate only');

test('PAGES-015 GitHub Pages browser origin can health-check and round-trip a live Worker room through CORS', async ({ page }) => {
  const apiOrigin = String(process.env.PAGES015_API_ORIGIN || '').replace(/\/$/, '');
  expect(apiOrigin).toMatch(/^https:\/\/[^/]+$/);

  await page.goto('https://a7sncom.github.io/yakolak/threejs/', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  expect(new URL(page.url()).origin).toBe('https://a7sncom.github.io');

  const result = await page.evaluate(async (origin) => {
    try {
      const healthResponse = await fetch(`${origin}/health?pages015-browser=${crypto.randomUUID()}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
      });
      const healthBody = await healthResponse.json().catch(() => null);

      const roomId = `p005-${crypto.randomUUID().replaceAll('-', '')}`;
      const payload = {
        probe: 'PAGES-015-browser-cors',
        nonce: crypto.randomUUID(),
        writtenAt: new Date().toISOString(),
      };

      // application/json forces a browser CORS preflight. A resolved 201 therefore
      // proves the real GitHub Pages origin can preflight and write the Worker.
      const writeResponse = await fetch(`${origin}/__pages005/rooms`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId, payload }),
      });
      const writeBody = await writeResponse.json().catch(() => null);

      const readResponse = await fetch(`${origin}/__pages005/rooms/${roomId}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
      });
      const readBody = await readResponse.json().catch(() => null);

      return {
        fetchResolved: true,
        health: {
          status: healthResponse.status,
          ok: healthResponse.ok && healthBody?.ok === true,
          compatibility: healthBody?.compatibility || null,
        },
        roomId,
        payload,
        write: {
          status: writeResponse.status,
          body: writeBody,
        },
        read: {
          status: readResponse.status,
          body: readBody,
        },
      };
    } catch (error) {
      return {
        fetchResolved: false,
        error: String(error?.message || error),
      };
    }
  }, apiOrigin);

  expect(result.fetchResolved, JSON.stringify(result)).toBe(true);

  expect(result.health.status).toBe(200);
  expect(result.health.ok).toBe(true);
  expect(result.health.compatibility?.protocol?.id).toBe('yakolak-online-room');
  expect(String(result.health.compatibility?.protocol?.version)).toBe('1');
  expect(result.health.compatibility?.capabilities?.id).toBe('yakolak-online-room-capabilities-v1');
  expect(result.health.compatibility?.turso?.id).toBe('yakolak-pages005-room-probe');
  expect(result.health.compatibility?.turso?.version).toBe(1);
  expect(String(result.health.compatibility?.worker?.versionId || '')).not.toBe('');

  expect(result.write.status, JSON.stringify(result.write.body)).toBe(201);
  expect(result.write.body?.ok).toBe(true);
  expect(result.write.body?.room?.roomId).toBe(result.roomId);

  expect(result.read.status, JSON.stringify(result.read.body)).toBe(200);
  expect(result.read.body?.ok).toBe(true);
  expect(result.read.body?.room?.roomId).toBe(result.roomId);
  expect(result.read.body?.room?.payload).toEqual(result.payload);
  expect(String(result.read.body?.room?.integrity || '')).toMatch(/^[a-f0-9]{64}$/);
});
