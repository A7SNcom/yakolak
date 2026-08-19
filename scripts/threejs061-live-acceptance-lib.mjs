import crypto from 'node:crypto';

export const THREEJS061_LIVE_URL = 'https://a7sncom.github.io/yakolak/threejs/';
export const THREEJS061_MANIFEST_SCHEMA = 'pages-deployment-generation-v1';
export const THREEJS061_CONTENT_IDENTITY = 'sha256-canonical-file-manifest-v1';

function fail(code, details = null) {
  const error = new Error(code);
  error.code = code;
  if (details !== null) error.details = details;
  throw error;
}

function requireObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value;
}

function requireSha(value, code, length) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(normalized)) fail(code);
  return normalized;
}

function requireSha256Generation(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) fail('threejs061_invalid_deployment_generation');
  return normalized;
}

export function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function normalizeThreejs061LiveUrl(value = THREEJS061_LIVE_URL) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    fail('threejs061_invalid_live_url');
  }
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'a7sncom.github.io'
    || url.port
    || url.username
    || url.password
    || url.pathname.replace(/\/+$/, '/') !== '/yakolak/threejs/'
    || url.search
    || url.hash
  ) fail('threejs061_live_url_must_be_exact_pages_candidate');
  url.pathname = '/yakolak/threejs/';
  return url.href;
}

export function deriveThreejs061PagesUrls(liveUrl = THREEJS061_LIVE_URL) {
  const threejsUrl = normalizeThreejs061LiveUrl(liveUrl);
  const rootUrl = new URL('../', threejsUrl).href;
  return Object.freeze({
    threejsUrl,
    rootUrl,
    manifestUrl: new URL('deployment-manifest.json', rootUrl).href,
    runtimeConfigUrl: new URL('runtime-config.json', threejsUrl).href,
  });
}

export function validateThreejs061DeploymentManifest(value, {
  expectedCandidateSha,
} = {}) {
  const manifest = requireObject(value, 'threejs061_manifest_required');
  const candidate = requireSha(expectedCandidateSha, 'threejs061_expected_candidate_sha_required', 40);
  if (manifest.schemaVersion !== 1) fail('threejs061_manifest_schema_version_mismatch');
  if (manifest.generationSchema !== THREEJS061_MANIFEST_SCHEMA) fail('threejs061_manifest_generation_schema_mismatch');

  const deploymentGeneration = requireSha256Generation(manifest.deploymentGeneration);
  const godotRootSha = requireSha(manifest.godotRootSha, 'threejs061_manifest_godot_sha_invalid', 40);
  const threejsCandidateSha = requireSha(manifest.threejsCandidateSha, 'threejs061_manifest_candidate_sha_invalid', 40);
  if (threejsCandidateSha !== candidate) {
    fail('threejs061_live_candidate_mismatch', {
      expectedCandidateSha: candidate,
      liveCandidateSha: threejsCandidateSha,
      deploymentGeneration,
    });
  }

  const runtime = requireObject(manifest.publicRuntimeProtocol, 'threejs061_manifest_runtime_identity_missing');
  const publicRuntimeProtocolSha256 = requireSha(runtime.sha256, 'threejs061_manifest_runtime_sha_invalid', 64);
  const protocolVersion = String(runtime.protocolVersion ?? '').trim();
  if (!protocolVersion) fail('threejs061_manifest_protocol_version_missing');

  const content = requireObject(manifest.contentIdentity, 'threejs061_manifest_content_identity_missing');
  if (content.algorithm !== THREEJS061_CONTENT_IDENTITY) fail('threejs061_manifest_content_algorithm_mismatch');
  const contentIdentitySha256 = requireSha(content.sha256, 'threejs061_manifest_content_sha_invalid', 64);
  if (!Array.isArray(content.excludes) || !content.excludes.includes('deployment-manifest.json')) {
    fail('threejs061_manifest_content_exclusion_missing');
  }

  return Object.freeze({
    schemaVersion: 1,
    generationSchema: THREEJS061_MANIFEST_SCHEMA,
    deploymentGeneration,
    godotRootSha,
    threejsCandidateSha,
    publicRuntimeProtocolSha256,
    protocolVersion,
    contentIdentityAlgorithm: THREEJS061_CONTENT_IDENTITY,
    contentIdentitySha256,
  });
}

export function validateThreejs061RuntimeConfig(bytes, manifestIdentity) {
  const identity = requireObject(manifestIdentity, 'threejs061_manifest_identity_required');
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const actualHash = sha256Hex(buffer);
  if (actualHash !== identity.publicRuntimeProtocolSha256) {
    fail('threejs061_runtime_config_hash_mismatch', {
      expected: identity.publicRuntimeProtocolSha256,
      actual: actualHash,
    });
  }

  let config;
  try {
    config = JSON.parse(buffer.toString('utf8'));
  } catch {
    fail('threejs061_runtime_config_not_json');
  }
  requireObject(config, 'threejs061_runtime_config_required');
  if (String(config.frontendSha || '').toLowerCase() !== identity.threejsCandidateSha) {
    fail('threejs061_runtime_frontend_sha_mismatch');
  }
  if (String(config.protocolVersion ?? '') !== identity.protocolVersion) {
    fail('threejs061_runtime_protocol_version_mismatch');
  }
  if (config.environment !== 'production' || config.branch !== 'threejs-rebuild') {
    fail('threejs061_runtime_environment_mismatch');
  }
  if (!['configured', 'absent', 'invalid'].includes(config.apiOriginState)) {
    fail('threejs061_runtime_api_origin_state_invalid');
  }

  return Object.freeze({
    sha256: actualHash,
    frontendSha: identity.threejsCandidateSha,
    protocolVersion: identity.protocolVersion,
    environment: config.environment,
    branch: config.branch,
    apiOriginState: config.apiOriginState,
    apiOrigin: config.apiOrigin ?? null,
  });
}

export function assertThreejs061RootStillGodot(rootHtml, threejsHtml) {
  const root = String(rootHtml || '');
  const candidate = String(threejsHtml || '');
  if (!root.trim()) fail('threejs061_root_html_missing');
  if (!candidate.trim()) fail('threejs061_threejs_html_missing');
  if (root.includes('THREEJS REBUILD')) fail('threejs061_root_no_longer_godot');
  if (!candidate.includes('THREEJS REBUILD')) fail('threejs061_threejs_marker_missing');
  return true;
}
