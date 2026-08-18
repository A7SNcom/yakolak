#!/usr/bin/env node
import fs from "node:fs";

const [releaseTag, assetSha256] = process.argv.slice(2);
if (!releaseTag || !/^[a-f0-9]{64}$/i.test(assetSha256 || "")) {
  console.error("usage: node scripts/verify-release-qualification.mjs <releaseTag> <assetSha256>");
  process.exit(2);
}

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
    String(row.assetSha256 || "").toLowerCase() === assetSha256.toLowerCase(),
);

const archive = keyed.find(
  (row) =>
    row.event === "archive_verified" &&
    row.immutable === true &&
    row.releaseAttestationVerified === true &&
    row.archiveSha256Verified === true &&
    row.nonProductionRestoreVerified === true,
);

const generation = keyed.find(
  (row) =>
    row.event === "deployment_generation_verified" &&
    row.verified === true &&
    typeof row.deploymentGeneration === "string" &&
    row.deploymentGeneration.length > 0,
);

const backend = [...keyed].reverse().find(
  (row) =>
    row.event === "backend_compatibility_verified" &&
    row.verified === true &&
    row.safe === true &&
    typeof row.workerDeployment === "string" &&
    row.workerDeployment.length > 0 &&
    typeof row.workerVersionId === "string" &&
    row.workerVersionId.length > 0 &&
    typeof row.previousWorkerVersionId === "string" &&
    row.previousWorkerVersionId.length > 0 &&
    row.workerVersionId !== row.previousWorkerVersionId &&
    row.protocolIdentity === "yakolak-online-room@1" &&
    row.protocolVersion === "1" &&
    row.capabilityIdentity === "yakolak-online-room-capabilities-v1" &&
    Array.isArray(row.capabilities) &&
    row.capabilities.includes("health.compatibility.v1") &&
    row.capabilities.includes("room-probe.read.v1") &&
    row.capabilities.includes("room-probe.write.v1") &&
    row.tursoTuple === "yakolak-pages005-room-probe@1" &&
    row.tursoSchemaId === "yakolak-pages005-room-probe" &&
    row.tursoSchemaVersion === 1 &&
    row.migrationPolicy === "expand-contract-forward-only" &&
    row.tursoDataRollbackRequired === false &&
    row.liveHealthVerified === true &&
    row.browserCorsVerified === true &&
    row.liveTursoRoundTripVerified === true &&
    row.rollbackWindowVerified === true &&
    Array.isArray(row.compatibleFrontendWindow) &&
    row.compatibleFrontendWindow.length === 2 &&
    Array.isArray(row.compatibleWorkerWindow) &&
    row.compatibleWorkerWindow.length === 2 &&
    typeof row.apiOrigin === "string" &&
    /^https:\/\/[^/]+$/.test(row.apiOrigin),
);

const missing = [];
if (!archive) missing.push("archive_verified");
if (!generation) missing.push("deployment_generation_verified");
if (!backend) missing.push("complete_backend_compatibility_verified");

if (missing.length) {
  console.error(
    `release qualification incomplete for ${releaseTag} / ${assetSha256}: missing ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.log(`release qualification complete for ${releaseTag} / ${assetSha256}`);
