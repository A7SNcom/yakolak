import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorker, __testing } from '../backend/cloudflare/src/worker.js';

function createMemoryStore() {
  const rooms = new Map();
  return {
    async ensureTable() {},
    async writeRoom({ roomId, payload, integrity, now }) {
      const previous = rooms.get(roomId);
      rooms.set(roomId, {
        roomId,
        payload: structuredClone(payload),
        integrity,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      });
    },
    async readRoom(roomId) {
      const room = rooms.get(roomId);
      return room ? structuredClone(room) : null;
    },
    async cleanup(beforeIso) {
      let deleted = 0;
      for (const [roomId, room] of rooms) {
        if (room.updatedAt < beforeIso) {
          rooms.delete(roomId);
          deleted += 1;
        }
      }
      return deleted;
    },
  };
}

test('PAGES-005 worker imports shared rules and uses the locked Pages origin', async () => {
  assert.equal(__testing.PAGES_ORIGIN, 'https://a7sncom.github.io');
  assert.equal(__testing.isAllowedOrigin('https://a7sncom.github.io'), true);
  assert.equal(__testing.isAllowedOrigin('https://example.com'), false);
  assert.match(__testing.createRoomId(), __testing.ROOM_ID_PATTERN);
  assert.match(await __testing.sha256Hex('yakolak'), /^[a-f0-9]{64}$/);
});

test('PAGES-005 HTTP room write/read round trip preserves payload', async () => {
  const store = createMemoryStore();
  const worker = createWorker({ createStore: () => store });
  const roomId = 'p005-0123456789abcdef0123456789abcdef';
  const payload = { probe: 'PAGES-005', version: 1, values: [3, 5] };

  const write = await worker.fetch(new Request('https://worker.invalid/__pages005/rooms', {
    method: 'POST',
    headers: {
      origin: 'https://a7sncom.github.io',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ roomId, payload }),
  }), {});
  assert.equal(write.status, 201);
  const written = await write.json();
  assert.equal(written.ok, true);
  assert.equal(written.room.roomId, roomId);
  assert.deepEqual(written.room.payload, payload);

  const read = await worker.fetch(new Request(`https://worker.invalid/__pages005/rooms/${roomId}`, {
    headers: { origin: 'https://a7sncom.github.io' },
  }), {});
  assert.equal(read.status, 200);
  const fetched = await read.json();
  assert.equal(fetched.ok, true);
  assert.equal(fetched.room.roomId, roomId);
  assert.deepEqual(fetched.room.payload, payload);
  assert.equal(fetched.room.integrity, written.room.integrity);
});

test('PAGES-005 rejects foreign browser origins', async () => {
  const worker = createWorker({ createStore: () => createMemoryStore() });
  const response = await worker.fetch(new Request('https://worker.invalid/health', {
    headers: { origin: 'https://evil.example' },
  }), {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'origin_not_allowed');
});
