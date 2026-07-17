import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_KEY =
  /^upstream-ui:[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+:v[1-9][0-9]*$/;
const CONTRACT_ID = /^reference\.feature\.\d{3}$/;
const REVISION = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function addOwner(sourceKeyOwners, contractOwners, owner, errors) {
  const sourceOwners = sourceKeyOwners.get(owner.sourceKey) ?? [];
  sourceOwners.push(owner);
  sourceKeyOwners.set(owner.sourceKey, sourceOwners);
  for (const contractId of owner.contractIds) {
    const contractSources = contractOwners.get(contractId) ?? [];
    contractSources.push(owner);
    contractOwners.set(contractId, contractSources);
    if (contractSources.length > 1) {
      errors.push(`legacyContractId is duplicated: ${contractId}`);
    }
  }
}

function validateRevision(label, actual, expected, errors) {
  if (!REVISION.test(actual ?? "")) {
    errors.push(`${label} sourceRevision is invalid`);
  } else if (actual !== expected) {
    errors.push(`${label} sourceRevision does not match target ${expected}`);
  }
}

function deltaOwners(deltaClassifications, errors) {
  const owners = [];
  const classifications = deltaClassifications?.classifications;
  if (!classifications || typeof classifications !== "object" || Array.isArray(classifications)) {
    errors.push("delta classifications must be an object");
    return owners;
  }
  for (const [sourcePath, classification] of Object.entries(classifications)) {
    const interactions = classification?.interactions;
    if (!Array.isArray(interactions)) {
      errors.push(`${sourcePath}: interactions must be an array`);
      continue;
    }
    for (const [index, interaction] of interactions.entries()) {
      const label = `${sourcePath}: interactions[${index}]`;
      if (!SOURCE_KEY.test(interaction?.sourceKey ?? "")) {
        errors.push(`${label}: sourceKey is invalid`);
        continue;
      }
      if (
        !Array.isArray(interaction.legacyContractIds)
        || interaction.legacyContractIds.some((contractId) => !CONTRACT_ID.test(contractId))
      ) {
        errors.push(`${label}: legacyContractIds are invalid`);
        continue;
      }
      owners.push({
        type: "delta",
        label,
        sourceKey: interaction.sourceKey,
        contractIds: new Set(interaction.legacyContractIds),
      });
    }
  }
  return owners;
}

function snapshotOwners(snapshotIdentities, errors) {
  if (
    !snapshotIdentities
    || typeof snapshotIdentities !== "object"
    || Array.isArray(snapshotIdentities)
    || snapshotIdentities.schemaVersion !== 1
  ) {
    errors.push("full snapshot identity manifest schemaVersion must equal 1");
    return [];
  }
  if (!Array.isArray(snapshotIdentities.identities)) {
    errors.push("full snapshot identities must be an array");
    return [];
  }
  const owners = [];
  for (const [index, identity] of snapshotIdentities.identities.entries()) {
    const label = `full snapshot identities[${index}]`;
    if (!SOURCE_KEY.test(identity?.sourceKey ?? "")) {
      errors.push(`${label}: sourceKey is invalid`);
      continue;
    }
    if (!CONTRACT_ID.test(identity?.legacyContractId ?? "")) {
      errors.push(`${label}: legacyContractId is invalid`);
      continue;
    }
    if (typeof identity.interaction !== "string" || !identity.interaction.trim()) {
      errors.push(`${label}: interaction is required`);
    }
    if (!Array.isArray(identity.evidence) || identity.evidence.length === 0) {
      errors.push(`${label}: evidence is required`);
    }
    owners.push({
      type: "full-snapshot",
      label,
      sourceKey: identity.sourceKey,
      contractIds: new Set([identity.legacyContractId]),
      evidence: Array.isArray(identity.evidence) ? identity.evidence : [],
    });
  }
  return owners;
}

function sourceLedgerFiles(sourceLedger, errors) {
  const files = new Map();
  if (!Array.isArray(sourceLedger?.files)) {
    errors.push("canonical source ledger files must be an array");
    return files;
  }
  for (const [index, file] of sourceLedger.files.entries()) {
    if (typeof file?.path !== "string" || !file.path) {
      errors.push(`canonical source ledger files[${index}] path is invalid`);
      continue;
    }
    if (files.has(file.path)) {
      errors.push(`canonical source ledger path is duplicated: ${file.path}`);
      continue;
    }
    files.set(file.path, file);
  }
  return files;
}

function isSafeRelativePath(value) {
  return (
    typeof value === "string"
    && value.length > 0
    && !path.posix.isAbsolute(value)
    && path.posix.normalize(value) === value
    && value !== ".."
    && !value.startsWith("../")
  );
}

async function validateEvidence(owner, sourceFiles, frozenSource, errors) {
  for (const [index, evidence] of (owner.evidence ?? []).entries()) {
    const label = `${owner.label}: evidence[${index}]`;
    if (!isSafeRelativePath(evidence?.path)) {
      errors.push(`${label}: path is invalid`);
      continue;
    }
    if (!SHA256.test(evidence?.sha256 ?? "")) {
      errors.push(`${label}: SHA-256 is invalid`);
      continue;
    }
    if (typeof evidence.symbol !== "string" || !evidence.symbol.trim()) {
      errors.push(`${label}: symbol is required`);
    }
    const sourceRow = sourceFiles.get(evidence.path);
    if (!sourceRow) {
      errors.push(`${label}: path is missing from canonical source ledger`);
    } else if (sourceRow.sha256 !== evidence.sha256) {
      errors.push(`${label}: source ledger SHA mismatch`);
    }
    if (typeof frozenSource !== "string" || !frozenSource) {
      errors.push(`${label}: frozen source root is invalid`);
      continue;
    }
    const sourcePath = path.resolve(frozenSource, evidence.path);
    const sourceRoot = `${path.resolve(frozenSource)}${path.sep}`;
    if (!sourcePath.startsWith(sourceRoot)) {
      errors.push(`${label}: path escapes frozen source`);
      continue;
    }
    try {
      const contents = await readFile(sourcePath);
      const actualSha256 = createHash("sha256").update(contents).digest("hex");
      if (actualSha256 !== evidence.sha256) {
        errors.push(`${label}: frozen source SHA mismatch`);
      }
      if (
        typeof evidence.symbol === "string"
        && evidence.symbol
        && !contents.toString("utf8").includes(evidence.symbol)
      ) {
        errors.push(`${label}: symbol is missing from frozen source`);
      }
    } catch {
      errors.push(`${label}: frozen source file is unreadable`);
    }
  }
}

export async function validateFeatureSourceAuthority({
  sourceRevision,
  aliases,
  deltaClassifications,
  snapshotIdentities,
  featureLedger,
  sourceLedger,
  frozenSource,
}) {
  const errors = [];
  if (!REVISION.test(sourceRevision ?? "")) {
    return ["target sourceRevision is invalid"];
  }
  validateRevision("source alias manifest", aliases?.sourceRevision, sourceRevision, errors);
  validateRevision(
    "delta classifications",
    deltaClassifications?.targetRevision,
    sourceRevision,
    errors,
  );
  validateRevision(
    "full snapshot identity manifest",
    snapshotIdentities?.sourceRevision,
    sourceRevision,
    errors,
  );
  validateRevision("feature ledger", featureLedger?.sourceRevision, sourceRevision, errors);
  validateRevision("canonical source ledger", sourceLedger?.sourceRevision, sourceRevision, errors);

  const aliasEntries = Object.entries(aliases?.aliases ?? {});
  const sourceKeyOwners = new Map();
  const contractOwners = new Map();
  const owners = [
    ...deltaOwners(deltaClassifications, errors),
    ...snapshotOwners(snapshotIdentities, errors),
  ];
  for (const owner of owners) {
    addOwner(sourceKeyOwners, contractOwners, owner, errors);
  }
  for (const [sourceKey, matchingOwners] of sourceKeyOwners.entries()) {
    if (matchingOwners.length > 1) {
      errors.push(`sourceKey is duplicated across source identities: ${sourceKey}`);
    }
  }

  for (const [contractId, sourceKey] of aliasEntries) {
    if (!CONTRACT_ID.test(contractId) || !SOURCE_KEY.test(sourceKey)) {
      errors.push(`source alias is invalid: ${contractId}`);
      continue;
    }
    const matchingOwners = sourceKeyOwners.get(sourceKey) ?? [];
    if (matchingOwners.length !== 1) {
      errors.push(`${contractId}: alias sourceKey requires exactly one source identity`);
      continue;
    }
  }
  for (const owner of owners.filter((candidate) => candidate.type === "full-snapshot")) {
    for (const contractId of owner.contractIds) {
      if (aliases?.aliases?.[contractId] !== owner.sourceKey) {
        errors.push(`${owner.label}: source identity alias does not match ${contractId}`);
      }
    }
  }

  for (const feature of featureLedger?.features ?? []) {
    if (feature.deliveryStatus !== "implemented") continue;
    if (!SOURCE_KEY.test(feature.sourceKey ?? "")) {
      errors.push(`${feature.contractId}: implemented source identity is required`);
      continue;
    }
    if (aliases?.aliases?.[feature.contractId] !== feature.sourceKey) {
      errors.push(`${feature.contractId}: implemented feature source alias does not match`);
    }
    if ((sourceKeyOwners.get(feature.sourceKey) ?? []).length !== 1) {
      errors.push(`${feature.contractId}: implemented feature requires one source owner`);
    }
  }

  const sourceFiles = sourceLedgerFiles(sourceLedger, errors);
  for (const owner of owners.filter((candidate) => candidate.type === "full-snapshot")) {
    await validateEvidence(owner, sourceFiles, frozenSource, errors);
  }
  return errors;
}

export async function assertFeatureSourceAuthority(options) {
  const errors = await validateFeatureSourceAuthority(options);
  if (errors.length > 0) {
    throw new Error(`feature source authority validation failed:\n${errors.join("\n")}`);
  }
}
