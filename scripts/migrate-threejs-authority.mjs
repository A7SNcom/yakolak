import { AUTHORITY_SCHEMA_VERSION } from '../backend/cloudflare/src/authoritative-schema.js';
import { createTursoAuthoritativeStore } from '../backend/cloudflare/src/authoritative-store.js';

const env = {
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
};

if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
  console.error('THREEJS-063 migration requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
  process.exitCode = 2;
} else {
  const store = createTursoAuthoritativeStore(env);
  await store.ensureTable();
  console.log(JSON.stringify({
    task: 'THREEJS-063',
    schemaVersion: AUTHORITY_SCHEMA_VERSION,
    state: 'schema_ready',
  }));
}
