import crypto from 'node:crypto';

const apiOrigin = String(process.env.API_ORIGIN || process.argv[2] || '').replace(/\/$/, '');
if (!/^https:\/\//.test(apiOrigin)) {
  console.error('Usage: API_ORIGIN=https://<worker-host> node scripts/probe-pages005-cloudflare-roundtrip.mjs');
  process.exit(2);
}

const roomId = `p005-${crypto.randomBytes(16).toString('hex')}`;
const payload = {
  probe: 'PAGES-005',
  nonce: crypto.randomUUID(),
  writtenAt: new Date().toISOString(),
};

const writeResponse = await fetch(`${apiOrigin}/__pages005/rooms`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'origin': 'https://a7sncom.github.io',
  },
  body: JSON.stringify({ roomId, payload }),
});
const writeBody = await writeResponse.json().catch(() => null);
if (writeResponse.status !== 201 || !writeBody?.ok || writeBody?.room?.roomId !== roomId) {
  throw new Error(`write failed: HTTP ${writeResponse.status} ${JSON.stringify(writeBody)}`);
}

const readResponse = await fetch(`${apiOrigin}/__pages005/rooms/${roomId}`, {
  headers: { origin: 'https://a7sncom.github.io' },
});
const readBody = await readResponse.json().catch(() => null);
if (readResponse.status !== 200 || !readBody?.ok || readBody?.room?.roomId !== roomId) {
  throw new Error(`read failed: HTTP ${readResponse.status} ${JSON.stringify(readBody)}`);
}

if (JSON.stringify(readBody.room.payload) !== JSON.stringify(payload)) {
  throw new Error(`roundtrip mismatch: ${JSON.stringify(readBody.room.payload)}`);
}
if (!/^[a-f0-9]{64}$/.test(String(readBody.room.integrity || ''))) {
  throw new Error('roundtrip integrity digest missing');
}

console.log(JSON.stringify({
  ok: true,
  apiOrigin,
  roomId,
  writeStatus: writeResponse.status,
  readStatus: readResponse.status,
  integrity: readBody.room.integrity,
}, null, 2));
