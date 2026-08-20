import { connect } from '@tursodatabase/serverless';
import { createInMemoryAuthoritativeStore } from './authoritative-memory-store.js';
import { PROBE_TABLE } from './authoritative-schema.js';
import {
  AUTHORITATIVE_STORE_INTERFACE_VERSION,
  assertAuthoritativeStore,
  failAuthority,
} from './authoritative-store-contract.js';
import { createTursoAuthoritativeStoreFromConnection } from './authoritative-turso-store.js';

export { AUTHORITATIVE_STORE_INTERFACE_VERSION, assertAuthoritativeStore, createInMemoryAuthoritativeStore, PROBE_TABLE };

export function createTursoAuthoritativeStore(env) {
  if (!env?.TURSO_DATABASE_URL || !env?.TURSO_AUTH_TOKEN) failAuthority('datastore_unavailable');
  const db = connect({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
  return assertAuthoritativeStore(createTursoAuthoritativeStoreFromConnection(db));
}
