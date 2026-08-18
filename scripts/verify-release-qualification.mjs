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

const keyed = rows.filter(
  (row) =>
    row.releaseTag === releaseTag &&
    String(row.assetSha256 || "").toLowerCase() === assetSha256,
);
const frontendKey = `${releaseTag}:${assetSha256}`;

const archive = [...keyed].reverse().find(
  (row) =>
    row.event === "archive_verified" &&
    row.assetName === "pages-composite.tar" &&
    row.immutable === true &&
    row.releaseAttestationVerified === true &&
    row.archiveSha256Verified === true &&
    row.nonProductionRestoreVerified === true &&
    HEX64.test(String(row.onlineCompatibilityDescriptorSha256 || "")) &&
    GENERATION.test(String(row.deploymentGenerationInArchive || "")),
);

const generation = [...keyed].reverse().find(
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
    Number(row.pages014VerifierJobId) > 0,
);

const backend = [...keyed].reverse().find((row) => {
  if (
    row.event !== "backend_compatibility_verified" ||
    row.verified !== true ||
    row.safe !== true ||
    !GENERATION.test(String(row.deploymentGeneration || "")) ||
    typeof row.workerDeployment !== "string" ||
    row.workerDeployment.length === 0 ||
    typeof row.workerVersionId !== "string" ||
    row.workerVersionId.length === 0 ||
    typeof row.previousWorkerVersionId !== "string" ||
    row.previousWorkerVersionId.length === 0 ||
    row.workerVersionId === row.previousWorkerVersionId ||
    row.protocolIdentity !== "yakolak-online-room@1" ||
    row.protocolVersion !== "1" ||
    row.capabilityIdentity !== "yakolak-online-room-capabilities-v1" ||
    !Array.isArray(row.capabilities) ||
    !row.capabilities.includes("health.compatibility.v1") ||
    !row.capabilities.includes("room-probe.read.v1") ||
    !row.capabilities.includes("room-probe.write.v1") ||
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
    !row.compatibleFrontendWindow.includes(frontendKey) ||
    !Array.isArray(row.compatibleWorkerWindow) ||
    row.compatibleWorkerWindow.length !== 2 ||
    !row.compatibleWorkerWindow.includes(`active:${row.workerVersionId}`) ||
    !row.compatibleWorkerWindow.includes(`previous:${row.previousWorkerVersionId}`) ||
    !Array.isArray(row.compatiblePairings) ||
    row.compatiblePairings.length !== 4
  ) {
    return false;
  }

  const expectedCombinations = [
    ["active", "active", row.workerVersionId],
    ["active", "previous", row.previousWorkerVersionId],
    ["previous", "active", row.workerVersionId],
    ["previous", "previous", row.previousWorkerVersionId],
  ];

  for (const [frontendRole, workerRole, workerVersionId] of expectedCombinations) {
    const pair = row.compatiblePairings.find(
      (candidate) =>
        candidate?.frontendRole === frontendRole &&
        candidate?.workerRole === workerRole,
    );
    if (
      !pair ||
      pair.verified !== true ||
      pair.workerVersionId !== workerVersionId ||
      !row.compatibleFrontendWindow.includes(String(pair.frontendKey || "")) ||
      !HEX64.test(String(pair.frontendDescriptorSha256 || ""))
    ) {
      return false;
    }
  }

  const currentPairs = row.compatiblePairings.filter((pair) => pair.frontendKey === frontendKey);
  if (
    currentPairs.length !== 2 ||
    currentPairs.some(
      (pair) => String(pair.frontendDescriptorSha256 || "") !== String(row.frontendDescriptorSha256 || ""),
    )
  ) {
    return false;
  }

  return true;
});

const missing = [];
if (!archive) missing.push("strong_archive_verified");
if (!generation) missing.push("strong_deployment_generation_verified");
if (archive && generation) {
  if (generation.deploymentGeneration !== archive.deploymentGenerationInArchive) {
    missing.push("archive_generation_identity_match");
  }
}
if (!backend) missing.push("complete_backend_compatibility_verified");
if (archive && backend) {
  if (backend.frontendDescriptorSha256 !== archive.onlineCompatibilityDescriptorSha256) {
    missing.push("frontend_descriptor_identity_match");
  }
}
if (generation && backend) {
  if (backend.deploymentGeneration !== generation.deploymentGeneration) {
    missing.push("backend_generation_identity_match");
  }
}

if (missing.length) {
  console.error(
    `release qualification incomplete for ${releaseTag} / ${assetSha256}: missing ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.log(`release qualification complete for ${releaseTag} / ${assetSha256}`);
