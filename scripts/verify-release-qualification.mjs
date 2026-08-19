#!/usr/bin/env node
import fs from "node:fs";

const [releaseTag, assetSha256Input] = process.argv.slice(2);
const assetSha256 = String(assetSha256Input || "").toLowerCase();
if (!releaseTag || !/^[a-f0-9]{64}$/.test(assetSha256)) {
  console.error("usage: node scripts/verify-release-qualification.mjs <releaseTag> <assetSha256>");
  process.exit(2);
}

const HEX64 = /^[a-f0-9]{64}$/;
const GENERATION = /^sha256:[a-f0-9]{64}$/;
const REQUIRED_CAPABILITIES = [
  "health.compatibility.v1",
  "room-probe.read.v1",
  "room-probe.write.v1",
];
const ledgerPath = new URL("../RELEASE_QUALIFICATION/ledger.jsonl", import.meta.url);

const rows = fs
  .readFileSync(ledgerPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid JSON on ledger line ${index + 1}: ${error.message}`);
    }
  });

function exactStringSet(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

function parseFrontendKey(value) {
  const match = /^(.*):([a-f0-9]{64})$/.exec(String(value || ""));
  if (!match || !match[1]) return null;
  return { releaseTag: match[1], assetSha256: match[2] };
}

function keyedRowsFor(frontendKey) {
  const parsed = parseFrontendKey(frontendKey);
  if (!parsed) return [];
  return rows.filter(
    (row) =>
      row.releaseTag === parsed.releaseTag &&
      String(row.assetSha256 || "").toLowerCase() === parsed.assetSha256,
  );
}

function findStrongArchive(keyedRows, { descriptorSha256, deploymentGeneration } = {}) {
  return [...keyedRows].reverse().find(
    (row) =>
      row.event === "archive_verified" &&
      row.assetName === "pages-composite.tar" &&
      row.immutable === true &&
      row.releaseAttestationVerified === true &&
      row.archiveSha256Verified === true &&
      row.nonProductionRestoreVerified === true &&
      HEX64.test(String(row.onlineCompatibilityDescriptorSha256 || "")) &&
      GENERATION.test(String(row.deploymentGenerationInArchive || "")) &&
      (!descriptorSha256 || row.onlineCompatibilityDescriptorSha256 === descriptorSha256) &&
      (!deploymentGeneration || row.deploymentGenerationInArchive === deploymentGeneration),
  );
}

function findStrongGeneration(keyedRows, { deploymentGeneration } = {}) {
  return [...keyedRows].reverse().find(
    (row) =>
      row.event === "deployment_generation_verified" &&
      row.assetName === "pages-composite.tar" &&
      row.verified === true &&
      GENERATION.test(String(row.deploymentGeneration || "")) &&
      row.pagesDeploymentStatus === "succeed" &&
      row.manifestVerified === true &&
      row.archiveMatchVerified === true &&
      row.pages014LiveEvidenceVerified === true &&
      HEX64.test(String(row.publicRuntimeProtocolSha256 || "")) &&
      row.protocolVersion === "1" &&
      HEX64.test(String(row.contentIdentitySha256 || "")) &&
      HEX64.test(String(row.liveManifestSha256 || "")) &&
      Number.isInteger(Number(row.pages014VerifierWorkflowRunId)) &&
      Number(row.pages014VerifierWorkflowRunId) > 0 &&
      Number.isInteger(Number(row.pages014VerifierJobId)) &&
      Number(row.pages014VerifierJobId) > 0 &&
      (!deploymentGeneration || row.deploymentGeneration === deploymentGeneration),
  );
}

function canonicalPairings(pairings) {
  if (!Array.isArray(pairings)) return null;
  return pairings
    .map((pair) => ({
      frontendRole: pair?.frontendRole,
      workerRole: pair?.workerRole,
      frontendKey: pair?.frontendKey,
      frontendDescriptorSha256: pair?.frontendDescriptorSha256,
      workerVersionId: pair?.workerVersionId,
      verified: pair?.verified,
    }))
    .sort((a, b) =>
      `${a.frontendRole}/${a.workerRole}`.localeCompare(`${b.frontendRole}/${b.workerRole}`),
    );
}

function samePairingMatrix(left, right) {
  return JSON.stringify(canonicalPairings(left)) === JSON.stringify(canonicalPairings(right));
}

function isCompleteBackendRow(row, currentFrontendKey) {
  if (
    row.event !== "backend_compatibility_verified" ||
    row.verified !== true ||
    row.safe !== true ||
    !GENERATION.test(String(row.deploymentGeneration || "")) ||
    !["active", "previous"].includes(row.frontendRole) ||
    typeof row.workerVersionId !== "string" ||
    row.workerVersionId.length === 0 ||
    typeof row.previousWorkerVersionId !== "string" ||
    row.previousWorkerVersionId.length === 0 ||
    row.workerVersionId === row.previousWorkerVersionId ||
    row.workerDeployment !== `cloudflare:${row.workerVersionId}` ||
    !HEX64.test(String(row.workerLockEvidenceSha256 || "")) ||
    row.protocolIdentity !== "yakolak-online-room@1" ||
    row.protocolVersion !== "1" ||
    row.capabilityIdentity !== "yakolak-online-room-capabilities-v1" ||
    !exactStringSet(row.capabilities, REQUIRED_CAPABILITIES) ||
    row.tursoTuple !== "yakolak-pages005-room-probe@1" ||
    row.tursoSchemaId !== "yakolak-pages005-room-probe" ||
    row.tursoSchemaVersion !== 1 ||
    row.migrationPolicy !== "expand-contract-forward-only" ||
    row.tursoDataRollbackRequired !== false ||
    row.liveHealthVerified !== true ||
    row.browserCorsVerified !== true ||
    row.liveTursoRoundTripVerified !== true ||
    row.rollbackWindowVerified !== true ||
    row.frontendArchiveReverified !== true ||
    !HEX64.test(String(row.frontendDescriptorSha256 || "")) ||
    !HEX64.test(String(row.evidenceSha256 || "")) ||
    typeof row.apiOrigin !== "string" ||
    !/^https:\/\/[^/]+$/.test(row.apiOrigin) ||
    !Array.isArray(row.compatibleFrontendWindow) ||
    row.compatibleFrontendWindow.length !== 2 ||
    !Array.isArray(row.compatibleWorkerWindow) ||
    !exactStringSet(row.compatibleWorkerWindow, [
      `active:${row.workerVersionId}`,
      `previous:${row.previousWorkerVersionId}`,
    ]) ||
    !Array.isArray(row.compatiblePairings) ||
    row.compatiblePairings.length !== 4
  ) {
    return false;
  }

  const pairByRole = new Map();
  for (const pair of row.compatiblePairings) {
    const key = `${pair?.frontendRole}/${pair?.workerRole}`;
    if (
      !["active/active", "active/previous", "previous/active", "previous/previous"].includes(key) ||
      pairByRole.has(key) ||
      pair?.verified !== true ||
      !parseFrontendKey(pair?.frontendKey) ||
      !HEX64.test(String(pair?.frontendDescriptorSha256 || ""))
    ) {
      return false;
    }
    const expectedWorkerVersion =
      pair.workerRole === "active" ? row.workerVersionId : row.previousWorkerVersionId;
    if (pair.workerVersionId !== expectedWorkerVersion) {
      return false;
    }
    pairByRole.set(key, pair);
  }
  if (pairByRole.size !== 4) return false;

  const frontendIdentity = {};
  for (const role of ["active", "previous"]) {
    const rolePairs = row.compatiblePairings.filter((pair) => pair.frontendRole === role);
    const keys = [...new Set(rolePairs.map((pair) => pair.frontendKey))];
    const descriptors = [...new Set(rolePairs.map((pair) => pair.frontendDescriptorSha256))];
    if (rolePairs.length !== 2 || keys.length !== 1 || descriptors.length !== 1) {
      return false;
    }
    frontendIdentity[role] = { key: keys[0], descriptorSha256: descriptors[0] };
  }

  if (
    frontendIdentity.active.key === frontendIdentity.previous.key ||
    !exactStringSet(row.compatibleFrontendWindow, [
      frontendIdentity.active.key,
      frontendIdentity.previous.key,
    ]) ||
    frontendIdentity[row.frontendRole].key !== currentFrontendKey ||
    frontendIdentity[row.frontendRole].descriptorSha256 !== row.frontendDescriptorSha256
  ) {
    return false;
  }

  return true;
}

function sameBackendWindow(left, right) {
  return (
    left.evidenceSha256 === right.evidenceSha256 &&
    left.workerLockEvidenceSha256 === right.workerLockEvidenceSha256 &&
    left.workerVersionId === right.workerVersionId &&
    left.previousWorkerVersionId === right.previousWorkerVersionId &&
    left.workerDeployment === right.workerDeployment &&
    left.protocolIdentity === right.protocolIdentity &&
    left.protocolVersion === right.protocolVersion &&
    left.capabilityIdentity === right.capabilityIdentity &&
    exactStringSet(left.capabilities, right.capabilities) &&
    left.tursoTuple === right.tursoTuple &&
    left.tursoSchemaId === right.tursoSchemaId &&
    left.tursoSchemaVersion === right.tursoSchemaVersion &&
    left.migrationPolicy === right.migrationPolicy &&
    left.tursoDataRollbackRequired === right.tursoDataRollbackRequired &&
    left.apiOrigin === right.apiOrigin &&
    exactStringSet(left.compatibleFrontendWindow, right.compatibleFrontendWindow) &&
    exactStringSet(left.compatibleWorkerWindow, right.compatibleWorkerWindow) &&
    samePairingMatrix(left.compatiblePairings, right.compatiblePairings)
  );
}

const frontendKey = `${releaseTag}:${assetSha256}`;
const keyed = keyedRowsFor(frontendKey);
const archive = findStrongArchive(keyed);
const generation = findStrongGeneration(keyed);
const backend = [...keyed].reverse().find((row) => isCompleteBackendRow(row, frontendKey));

let siblingBackend = null;
let siblingArchive = null;
let siblingGeneration = null;

if (backend) {
  const siblingFrontendKey =
    backend.compatibleFrontendWindow.find((key) => key !== frontendKey) || null;
  const siblingKeyed = siblingFrontendKey ? keyedRowsFor(siblingFrontendKey) : [];
  siblingBackend = [...siblingKeyed]
    .reverse()
    .find(
      (row) =>
        isCompleteBackendRow(row, siblingFrontendKey) &&
        row.frontendRole !== backend.frontendRole &&
        sameBackendWindow(row, backend),
    );

  if (siblingBackend) {
    siblingArchive = findStrongArchive(siblingKeyed, {
      descriptorSha256: siblingBackend.frontendDescriptorSha256,
      deploymentGeneration: siblingBackend.deploymentGeneration,
    });
    siblingGeneration = findStrongGeneration(siblingKeyed, {
      deploymentGeneration: siblingBackend.deploymentGeneration,
    });
  }
}

const missing = [];
if (!archive) missing.push("strong_archive_verified");
if (!generation) missing.push("strong_deployment_generation_verified");
if (archive && generation && generation.deploymentGeneration !== archive.deploymentGenerationInArchive) {
  missing.push("archive_generation_identity_match");
}
if (!backend) missing.push("complete_backend_compatibility_verified");
if (archive && backend && backend.frontendDescriptorSha256 !== archive.onlineCompatibilityDescriptorSha256) {
  missing.push("frontend_descriptor_identity_match");
}
if (generation && backend && backend.deploymentGeneration !== generation.deploymentGeneration) {
  missing.push("backend_generation_identity_match");
}
if (backend && !siblingBackend) missing.push("complete_backend_window_sibling");
if (siblingBackend && !siblingArchive) missing.push("sibling_strong_archive_verified");
if (siblingBackend && !siblingGeneration) {
  missing.push("sibling_strong_deployment_generation_verified");
}
if (
  siblingArchive &&
  siblingGeneration &&
  siblingArchive.deploymentGenerationInArchive !== siblingGeneration.deploymentGeneration
) {
  missing.push("sibling_archive_generation_identity_match");
}
if (
  siblingArchive &&
  siblingBackend &&
  siblingArchive.onlineCompatibilityDescriptorSha256 !== siblingBackend.frontendDescriptorSha256
) {
  missing.push("sibling_frontend_descriptor_identity_match");
}
if (
  siblingGeneration &&
  siblingBackend &&
  siblingGeneration.deploymentGeneration !== siblingBackend.deploymentGeneration
) {
  missing.push("sibling_backend_generation_identity_match");
}

if (missing.length) {
  console.error(
    `release qualification incomplete for ${releaseTag} / ${assetSha256}: missing ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `release qualification complete for ${releaseTag} / ${assetSha256}; full active+previous backend window verified`,
);
