export const EXPECTED_ONLINE_PROTOCOL = Object.freeze({
  id: 'yakolak-online-room',
  version: '1',
});

export const REQUIRED_ONLINE_CAPABILITIES = Object.freeze({
  id: 'yakolak-online-room-capabilities-v1',
  names: Object.freeze([
    'health.compatibility.v1',
    'room-probe.read.v1',
    'room-probe.write.v1',
  ]),
});

export const SUPPORTED_TURSO_SCHEMA = Object.freeze({
  id: 'yakolak-pages005-room-probe',
  minVersion: 1,
  maxVersion: 1,
});

export class OnlineCompatibilityError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'OnlineCompatibilityError';
    this.code = code;
  }
}

function normalizeOrigin(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new OnlineCompatibilityError('online_api_origin_absent');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new OnlineCompatibilityError('online_api_origin_invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new OnlineCompatibilityError('online_api_origin_invalid');
  }
  return url.origin;
}

export function validateOnlineCompatibility(identity, {
  expectedProtocolVersion = EXPECTED_ONLINE_PROTOCOL.version,
  requireWorkerVersion = false,
} = {}) {
  if (!identity || typeof identity !== 'object') {
    throw new OnlineCompatibilityError('online_compatibility_missing');
  }

  if (
    identity.protocol?.id !== EXPECTED_ONLINE_PROTOCOL.id ||
    String(identity.protocol?.version ?? '') !== String(expectedProtocolVersion)
  ) {
    throw new OnlineCompatibilityError('online_protocol_incompatible');
  }

  const advertised = new Set(Array.isArray(identity.capabilities?.names) ? identity.capabilities.names : []);
  if (
    identity.capabilities?.id !== REQUIRED_ONLINE_CAPABILITIES.id ||
    REQUIRED_ONLINE_CAPABILITIES.names.some((name) => !advertised.has(name))
  ) {
    throw new OnlineCompatibilityError('online_capabilities_incompatible');
  }

  const schemaVersion = Number(identity.turso?.version);
  if (
    identity.turso?.id !== SUPPORTED_TURSO_SCHEMA.id ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion < SUPPORTED_TURSO_SCHEMA.minVersion ||
    schemaVersion > SUPPORTED_TURSO_SCHEMA.maxVersion ||
    identity.turso?.migrationPolicy !== 'expand-contract-forward-only' ||
    identity.turso?.dataRollbackRequired !== false
  ) {
    throw new OnlineCompatibilityError('online_turso_schema_incompatible');
  }

  if (requireWorkerVersion && !String(identity.worker?.versionId ?? '').trim()) {
    throw new OnlineCompatibilityError('online_worker_version_missing');
  }

  return Object.freeze({
    protocolId: identity.protocol.id,
    protocolVersion: String(identity.protocol.version),
    capabilityId: identity.capabilities.id,
    capabilities: Object.freeze([...advertised].sort()),
    tursoSchemaId: identity.turso.id,
    tursoSchemaVersion: schemaVersion,
    workerVersionId: String(identity.worker?.versionId ?? '').trim() || null,
  });
}

export function createOnlineCompatibilityGate({
  apiOrigin,
  fetchImpl = globalThis.fetch,
  expectedProtocolVersion = EXPECTED_ONLINE_PROTOCOL.version,
} = {}) {
  let state = 'unverified';
  let lastIdentity = null;
  let lastError = null;

  function fail(error) {
    state = 'incompatible';
    lastError = error instanceof OnlineCompatibilityError
      ? error
      : new OnlineCompatibilityError('online_compatibility_check_failed', String(error?.message || error));
    throw lastError;
  }

  async function refresh() {
    try {
      if (typeof fetchImpl !== 'function') throw new OnlineCompatibilityError('online_fetch_unavailable');
      const origin = normalizeOrigin(apiOrigin);
      state = 'checking';
      const response = await fetchImpl(`${origin}/health`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        headers: { accept: 'application/json' },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) {
        throw new OnlineCompatibilityError('online_health_unavailable');
      }
      const validated = validateOnlineCompatibility(body.compatibility, { expectedProtocolVersion, requireWorkerVersion: true });
      state = 'compatible';
      lastIdentity = validated;
      lastError = null;
      return validated;
    } catch (error) {
      return fail(error);
    }
  }

  function observeSnapshot(payload) {
    try {
      const validated = validateOnlineCompatibility(payload?.compatibility, { expectedProtocolVersion, requireWorkerVersion: true });
      if (lastIdentity && (
        validated.protocolId !== lastIdentity.protocolId ||
        validated.protocolVersion !== lastIdentity.protocolVersion ||
        validated.capabilityId !== lastIdentity.capabilityId ||
        validated.tursoSchemaId !== lastIdentity.tursoSchemaId ||
        validated.tursoSchemaVersion !== lastIdentity.tursoSchemaVersion
      )) {
        throw new OnlineCompatibilityError('online_snapshot_identity_changed');
      }
      state = 'compatible';
      lastIdentity = validated;
      lastError = null;
      return validated;
    } catch (error) {
      return fail(error);
    }
  }

  function assertMutationAllowed() {
    if (state !== 'compatible' || !lastIdentity) {
      throw lastError || new OnlineCompatibilityError('online_compatibility_unverified');
    }
    return lastIdentity;
  }

  function snapshot() {
    return Object.freeze({
      state,
      compatible: state === 'compatible',
      identity: lastIdentity,
      errorCode: lastError?.code || null,
    });
  }

  return Object.freeze({
    refresh,
    observeSnapshot,
    assertMutationAllowed,
    snapshot,
  });
}
