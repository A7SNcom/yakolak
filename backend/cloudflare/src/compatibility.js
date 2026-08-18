export const ONLINE_PROTOCOL = Object.freeze({
  id: 'yakolak-online-room',
  version: '1',
});

export const ONLINE_CAPABILITIES = Object.freeze({
  id: 'yakolak-online-room-capabilities-v1',
  names: Object.freeze([
    'health.compatibility.v1',
    'room-probe.read.v1',
    'room-probe.write.v1',
  ]),
});

export const TURSO_SCHEMA = Object.freeze({
  id: 'yakolak-pages005-room-probe',
  version: 1,
  migrationPolicy: 'expand-contract-forward-only',
  dataRollbackRequired: false,
});

function optionalIdentity(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

export function compatibilityIdentity(env = {}) {
  const metadata = env?.CF_VERSION_METADATA || {};
  return {
    protocol: { ...ONLINE_PROTOCOL },
    capabilities: {
      id: ONLINE_CAPABILITIES.id,
      names: [...ONLINE_CAPABILITIES.names],
    },
    turso: { ...TURSO_SCHEMA },
    worker: {
      provider: 'cloudflare-workers',
      versionId: optionalIdentity(metadata.id),
      versionTag: optionalIdentity(metadata.tag),
      versionTimestamp: optionalIdentity(metadata.timestamp),
    },
  };
}

export function withCompatibility(payload, env = {}) {
  return {
    ...payload,
    compatibility: compatibilityIdentity(env),
  };
}
