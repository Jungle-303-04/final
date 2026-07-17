#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertFeatureSourceAuthority,
  validateFeatureSourceAuthority,
} from "./reference-feature-source-identity.mjs";

export { validateFeatureSourceAuthority };

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_SOURCE = path.join(
  REPOSITORY_ROOT,
  "docs",
  "spec",
  "frontend",
  "reference-feature-inventory.md",
);
const DEFAULT_OUTPUT = path.join(REPOSITORY_ROOT, "docs", "migration", "reference-feature-ledger.json");
const DEFAULT_CONTRACTS_OUTPUT = path.join(
  REPOSITORY_ROOT,
  "src",
  "packages",
  "contracts",
  "reference_feature_catalog.json",
);
const DEFAULT_PORT_MAP = path.join(
  REPOSITORY_ROOT,
  "docs",
  "migration",
  "reference-feature-port-map.json",
);
const DEFAULT_SOURCE_KEY_ALIASES = path.join(
  REPOSITORY_ROOT,
  "docs",
  "migration",
  "reference-feature-source-aliases.json",
);
const DEFAULT_SOURCE_IDENTITIES = path.join(
  REPOSITORY_ROOT,
  "docs",
  "migration",
  "reference-feature-source-identities.json",
);
const DEFAULT_DELTA_CLASSIFICATIONS = path.join(
  REPOSITORY_ROOT,
  "docs",
  "migration",
  "reference-ui-delta-classifications.json",
);
const DEFAULT_SOURCE_LEDGER = path.join(
  REPOSITORY_ROOT,
  "docs",
  "migration",
  "reference-source-ledger.json",
);
const DEFAULT_FROZEN_SOURCE = path.join(REPOSITORY_ROOT, "references", "upstream");
const DEFAULT_REVISION = "cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc";
const DELIVERY_STATUSES = new Set([
  "implemented",
  "in_progress",
  "planned",
  "reference_only",
  "not_applicable",
]);
const NON_PRODUCT_DELIVERY_STATUSES = new Set(["reference_only", "not_applicable"]);
const RELEASE_SURFACES = new Set(["all", "web"]);
const RELEASE_PHASES = new Set(["baseline", "post_parity"]);
const RELEASE_PHASE_FILTERS = new Set(["all", ...RELEASE_PHASES]);
const SOURCE_KEY = /^upstream-ui:[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+:v[1-9][0-9]*$/;
const DESKTOP_ONLY_ENDPOINT =
  /^(?:(?:GET|POST|PUT|PATCH|DELETE)\s+\/desktop(?:[/?]|$)|WS\s+\/local-terminal(?:[/?]|$))/;

function tableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function endpointsFor(cells) {
  const source = cells.join(" | ");
  return [...source.matchAll(/`((?:GET|POST|PUT|PATCH|DELETE|SSE|WS)\s+[^`]+)`/g)].map(
    (match) => match[1],
  );
}

function isStreamingEndpoint(endpoint) {
  return /^(SSE|WS)\s/.test(endpoint) || /(?:\/|-)stream(?:[/?}]|$)/.test(endpoint);
}

function sectionPortMap(portMap, section) {
  if (!portMap || typeof portMap !== "object" || portMap.schemaVersion !== 1) {
    throw new Error("이식 경계 맵의 schemaVersion은 1이어야 합니다");
  }
  const port = portMap.sections?.[section];
  if (!port) throw new Error(`이식 경계가 없습니다: ${section}`);
  if (!port.area || !port.deliveryStatus || !port.backendContract || !port.frontendContract) {
    throw new Error(`이식 경계가 불완전합니다: ${section}`);
  }
  if (!DELIVERY_STATUSES.has(port.deliveryStatus)) {
    throw new Error(`알 수 없는 이식 상태입니다: ${section} (${port.deliveryStatus})`);
  }
  if (port.desktopContract !== null && typeof port.desktopContract !== "string") {
    throw new Error(`desktopContract는 문자열 또는 null이어야 합니다: ${section}`);
  }
  if (!Array.isArray(port.verification) || port.verification.length === 0) {
    throw new Error(`검증 대상이 없습니다: ${section}`);
  }
  return port;
}

function featurePortMap(portMap, section, contractId) {
  const sectionPort = sectionPortMap(portMap, section);
  const override = portMap.features?.[contractId] ?? {};
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    throw new Error(`행별 이식 경계는 객체여야 합니다: ${contractId}`);
  }
  const port = { ...sectionPort, ...override };
  if (!DELIVERY_STATUSES.has(port.deliveryStatus)) {
    throw new Error(`알 수 없는 이식 상태입니다: ${contractId} (${port.deliveryStatus})`);
  }
  if (port.releasePhase !== undefined && !RELEASE_PHASES.has(port.releasePhase)) {
    throw new Error(`알 수 없는 출하 단계입니다: ${contractId} (${port.releasePhase})`);
  }
  if (port.streaming !== undefined && typeof port.streaming !== "boolean") {
    throw new Error(`실시간 이식 증거는 boolean이어야 합니다: ${contractId}`);
  }
  return port;
}

function featureCoverage(port, streaming) {
  const coverage = port.coverage ?? {};
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) {
    throw new Error("행별 이식 증거는 객체여야 합니다");
  }
  return {
    backend: coverage.backend ?? null,
    frontend: coverage.frontend ?? null,
    desktop: coverage.desktop ?? null,
    realtime: streaming ? coverage.realtime ?? null : "not_required",
  };
}

function sourceKeyFor(sourceKeyAliases, contractId) {
  const sourceKey = sourceKeyAliases?.[contractId];
  if (sourceKey === undefined) return null;
  if (typeof sourceKey !== "string" || !SOURCE_KEY.test(sourceKey)) {
    throw new Error(`sourceKey alias is invalid: ${contractId}`);
  }
  return sourceKey;
}

function validateSourceKeyAliasManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1) {
    throw new Error("sourceKey alias manifest의 schemaVersion은 1이어야 합니다");
  }
  if (!/^[0-9a-f]{40}$/.test(value.sourceRevision ?? "")) {
    throw new Error("sourceKey alias manifest의 sourceRevision은 40자리 SHA여야 합니다");
  }
  if (!value.aliases || typeof value.aliases !== "object" || Array.isArray(value.aliases)) {
    throw new Error("sourceKey alias manifest의 aliases는 객체여야 합니다");
  }
  for (const [contractId, sourceKey] of Object.entries(value.aliases)) {
    if (!/^reference\.feature\.\d{3}$/.test(contractId) || typeof sourceKey !== "string" || !SOURCE_KEY.test(sourceKey)) {
      throw new Error(`sourceKey alias가 유효하지 않습니다: ${contractId}`);
    }
  }
  return {
    sourceRevision: value.sourceRevision,
    aliases: value.aliases,
  };
}

export function assertSourceKeyAliasManifestRevisionMatchesTarget(manifest, targetRevision) {
  if (!manifest?.sourceRevision) {
    throw new Error("sourceKey alias manifest revision is required for strict release");
  }
  if (manifest.sourceRevision !== targetRevision) {
    throw new Error(
      `sourceKey alias manifest revision ${manifest.sourceRevision} does not match target ${targetRevision}`,
    );
  }
  return manifest.sourceRevision;
}

export function parseReferenceInventory(markdown, sourceRevision, portMap, sourceKeyAliases = {}) {
  if (!/^[0-9a-f]{40}$/.test(sourceRevision)) {
    throw new Error("sourceRevision must be a 40-character lowercase hexadecimal revision");
  }
  const features = [];
  let section = "root";
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^#{2,6}\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1];
      continue;
    }
    if (!lines[index].trim().startsWith("|")) continue;
    const cells = tableCells(lines[index]);
    if (isTableSeparator(cells) || isTableSeparator(tableCells(lines[index + 1] ?? ""))) continue;
    const endpoints = endpointsFor(cells);
    const number = String(features.length + 1).padStart(3, "0");
    const contractId = `reference.feature.${number}`;
    const sourceKey = sourceKeyFor(sourceKeyAliases, contractId);
    const port = featurePortMap(portMap, section, contractId);
    const streaming = port.streaming ?? endpoints.some(isStreamingEndpoint);
    features.push({
      id: `reference-feature-${number}`,
      contractId,
      sourceKey,
      legacyContractIds: [contractId],
      identityStatus: sourceKey ? "source-key" : "legacy-unmapped",
      section,
      line: index + 1,
      cells,
      endpoints,
      streaming,
      area: port.area,
      releasePhase: port.releasePhase ?? "baseline",
      deliveryStatus: port.deliveryStatus,
      backendContract: port.backendContract,
      frontendContract: port.frontendContract,
      desktopContract: port.desktopContract,
      verification: port.verification,
      coverage: featureCoverage(port, streaming),
    });
  }
  const ledger = {
    schemaVersion: 1,
    sourceRevision,
    featureCount: features.length,
    features,
  };
  const errors = validateFeatureLedger(ledger);
  if (errors.length > 0) throw new Error(`feature ledger validation failed:\n${errors.join("\n")}`);
  return ledger;
}

export function validateFeatureLedger(ledger) {
  const errors = [];
  if (!ledger || typeof ledger !== "object") return ["ledger must be an object"];
  if (ledger.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (!/^[0-9a-f]{40}$/.test(ledger.sourceRevision ?? "")) {
    errors.push("sourceRevision must be a 40-character lowercase hexadecimal revision");
  }
  if (!Array.isArray(ledger.features)) return [...errors, "features must be an array"];
  if (ledger.featureCount !== ledger.features.length) errors.push("featureCount must equal features.length");

  const ids = new Set();
  for (const feature of ledger.features) {
    const id = String(feature?.id ?? "<unknown>");
    if (!id || id === "<unknown>") {
      errors.push("<unknown>: id is required");
      continue;
    }
    if (!feature.section) errors.push(`${id}: section is required`);
    if (!feature.contractId) errors.push(`${id}: contractId is required`);
    if (feature.sourceKey !== null && (typeof feature.sourceKey !== "string" || !SOURCE_KEY.test(feature.sourceKey))) {
      errors.push(`${id}: sourceKey must be null or an immutable sourceKey`);
    }
    if (!Array.isArray(feature.legacyContractIds) || feature.legacyContractIds.length === 0 || feature.legacyContractIds.some((value) => !/^reference\.feature\.\d{3}$/.test(value))) {
      errors.push(`${id}: legacyContractIds must contain reference feature aliases`);
    }
    const expectedIdentityStatus = feature.sourceKey ? "source-key" : "legacy-unmapped";
    if (feature.identityStatus !== expectedIdentityStatus) {
      errors.push(`${id}: identityStatus must match sourceKey presence`);
    }
    if (!Number.isInteger(feature.line) || feature.line < 1) errors.push(`${id}: line must be positive`);
    if (!Array.isArray(feature.cells) || feature.cells.length === 0) {
      errors.push(`${id}: cells are required`);
    }
    if (!Array.isArray(feature.endpoints)) errors.push(`${id}: endpoints must be an array`);
    if (typeof feature.streaming !== "boolean") errors.push(`${id}: streaming must be boolean`);
    if (!feature.area) errors.push(`${id}: area is required`);
    if (!RELEASE_PHASES.has(feature.releasePhase)) {
      errors.push(`${id}: releasePhase must be baseline or post_parity`);
    }
    if (!DELIVERY_STATUSES.has(feature.deliveryStatus)) {
      errors.push(`${id}: deliveryStatus must be a supported value`);
    }
    if (feature.deliveryStatus === "implemented" && !feature.sourceKey) {
      errors.push(`${id}: implemented source identity is required`);
    }
    if (!feature.backendContract) errors.push(`${id}: backendContract is required`);
    if (!feature.frontendContract) errors.push(`${id}: frontendContract is required`);
    if (feature.desktopContract !== null && typeof feature.desktopContract !== "string") {
      errors.push(`${id}: desktopContract must be a string or null`);
    }
    if (!Array.isArray(feature.verification) || feature.verification.length === 0) {
      errors.push(`${id}: at least one verification target is required`);
    }
    if (!feature.coverage || typeof feature.coverage !== "object") {
      errors.push(`${id}: coverage is required`);
    } else {
      for (const boundary of ["backend", "frontend", "desktop"]) {
        const value = feature.coverage[boundary];
        if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
          errors.push(`${id}: coverage.${boundary} must be an object or null`);
        }
      }
      const realtime = feature.coverage.realtime;
      if (feature.streaming && realtime !== null && (typeof realtime !== "object" || Array.isArray(realtime))) {
        errors.push(`${id}: streaming coverage.realtime must be an object or null`);
      }
      if (!feature.streaming && realtime !== "not_required") {
        errors.push(`${id}: non-streaming coverage.realtime must be not_required`);
      }
    }
    if (ids.has(id)) errors.push(`${id}: id is duplicated`);
    ids.add(id);
  }
  return errors;
}

export function assertFeatureDeliveryComplete(
  ledger,
  { surface = "all", phase = "all" } = {},
) {
  const validationErrors = validateFeatureLedger(ledger);
  if (validationErrors.length > 0) {
    throw new Error(`기능 ledger validation failed:\n${validationErrors.join("\n")}`);
  }
  if (!RELEASE_SURFACES.has(surface)) {
    throw new Error(`지원하지 않는 release surface입니다: ${surface}`);
  }
  if (!RELEASE_PHASE_FILTERS.has(phase)) {
    throw new Error(`지원하지 않는 release phase입니다: ${phase}`);
  }
  const incomplete = [];
  for (const feature of ledger.features) {
    if (NON_PRODUCT_DELIVERY_STATUSES.has(feature.deliveryStatus)) continue;
    if (phase !== "all" && feature.releasePhase !== phase) continue;
    if (surface === "web" && isDesktopOnlyFeature(feature)) continue;
    if (surface === "all" && feature.deliveryStatus !== "implemented") {
      incomplete.push(`${feature.contractId}: ${feature.deliveryStatus}`);
      continue;
    }
    const coverage = feature.coverage;
    for (const boundary of ["backend", "frontend"]) {
      if (!isReadyCoverage(coverage[boundary])) {
        incomplete.push(`${feature.contractId}: incomplete ${boundary} coverage`);
      }
    }
    if (surface === "all" && feature.desktopContract && !isReadyCoverage(coverage.desktop)) {
      incomplete.push(`${feature.contractId}: incomplete desktop coverage`);
    }
    if (feature.streaming && !isReadyCoverage(coverage.realtime)) {
      incomplete.push(`${feature.contractId}: incomplete realtime coverage`);
    }
    if (!feature.sourceKey) {
      incomplete.push(`${feature.contractId}: missing immutable sourceKey`);
    }
  }
  if (incomplete.length > 0) {
    throw new Error(
      `출하 동등성 미완료 (${incomplete.length}개):\n${incomplete.join("\n")}`,
    );
  }
}

function isReadyCoverage(coverage) {
  return Boolean(
    coverage
      && typeof coverage === "object"
      && !Array.isArray(coverage)
      && ["implemented", "not_required"].includes(coverage.state),
  );
}

function isDesktopOnlyFeature(feature) {
  return feature.endpoints.length > 0 && feature.endpoints.every((endpoint) => DESKTOP_ONLY_ENDPOINT.test(endpoint));
}

function parseArguments(argv) {
  const values = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    contractsOutput: DEFAULT_CONTRACTS_OUTPUT,
    portMap: DEFAULT_PORT_MAP,
    sourceKeyAliases: DEFAULT_SOURCE_KEY_ALIASES,
    sourceIdentities: DEFAULT_SOURCE_IDENTITIES,
    deltaClassifications: DEFAULT_DELTA_CLASSIFICATIONS,
    sourceLedger: DEFAULT_SOURCE_LEDGER,
    frozenSource: DEFAULT_FROZEN_SOURCE,
    sourceRevision: DEFAULT_REVISION,
    check: false,
    requireComplete: false,
    releaseSurface: "all",
    releasePhase: "all",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--check") {
      values.check = true;
      continue;
    }
    if (flag === "--require-complete") {
      values.requireComplete = true;
      continue;
    }
    if (flag === "--surface" && argv[index + 1]) {
      values.releaseSurface = argv[index + 1];
      index += 1;
      continue;
    }
    if (flag === "--phase" && argv[index + 1]) {
      values.releasePhase = argv[index + 1];
      index += 1;
      continue;
    }
    if (
      ![
        "--source",
        "--output",
        "--contracts-output",
        "--port-map",
        "--source-key-aliases",
        "--source-identities",
        "--delta-classifications",
        "--source-ledger",
        "--frozen-source",
        "--revision",
      ].includes(flag)
      || !argv[index + 1]
    ) {
      throw new Error(`지원하지 않는 인자입니다: ${flag}`);
    }
    const value = argv[index + 1];
    if (flag === "--revision") values.sourceRevision = value;
    else if (flag === "--contracts-output") values.contractsOutput = path.resolve(value);
    else if (flag === "--port-map") values.portMap = path.resolve(value);
    else if (flag === "--source-key-aliases") values.sourceKeyAliases = path.resolve(value);
    else if (flag === "--source-identities") values.sourceIdentities = path.resolve(value);
    else if (flag === "--delta-classifications") {
      values.deltaClassifications = path.resolve(value);
    } else if (flag === "--source-ledger") values.sourceLedger = path.resolve(value);
    else if (flag === "--frozen-source") values.frozenSource = path.resolve(value);
    else values[flag.slice(2)] = path.resolve(value);
    index += 1;
  }
  return values;
}

function contractCatalog(ledger) {
  return {
    schemaVersion: ledger.schemaVersion,
    sourceRevision: ledger.sourceRevision,
    featureCount: ledger.featureCount,
    features: ledger.features.map(
      ({
        contractId,
        sourceKey,
        legacyContractIds,
        identityStatus,
        id,
        section,
        endpoints,
        streaming,
        area,
        releasePhase,
        deliveryStatus,
        backendContract,
        frontendContract,
        desktopContract,
        verification,
        coverage,
      }) => ({
        contractId,
        sourceKey,
        legacyContractIds,
        identityStatus,
        id,
        section,
        endpoints,
        streaming,
        area,
        releasePhase,
        deliveryStatus,
        backendContract,
        frontendContract,
        desktopContract,
        verification,
        coverage,
      }),
    ),
  };
}

export async function writeFeatureLedger({
  source,
  output,
  contractsOutput = DEFAULT_CONTRACTS_OUTPUT,
  portMap = DEFAULT_PORT_MAP,
  sourceKeyAliases = DEFAULT_SOURCE_KEY_ALIASES,
  sourceIdentities = null,
  deltaClassifications = null,
  sourceLedger = null,
  frozenSource = null,
  sourceRevision,
  check = false,
  requireComplete = false,
  releaseSurface = "all",
  releasePhase = "all",
}) {
  const markdown = await readFile(source, "utf8");
  const loadedPortMap =
    typeof portMap === "string"
      ? JSON.parse(await readFile(portMap, "utf8"))
      : portMap;
  const sourceKeyAliasManifest =
    typeof sourceKeyAliases === "string"
      ? validateSourceKeyAliasManifest(JSON.parse(await readFile(sourceKeyAliases, "utf8")))
      : { sourceRevision: null, aliases: sourceKeyAliases };
  const ledger = parseReferenceInventory(markdown, sourceRevision, loadedPortMap, sourceKeyAliasManifest.aliases);
  const authorityInputs = [
    sourceIdentities,
    deltaClassifications,
    sourceLedger,
    frozenSource,
  ];
  if (authorityInputs.some(Boolean) && !authorityInputs.every(Boolean)) {
    throw new Error("feature source authority inputs must be provided together");
  }
  if (authorityInputs.every(Boolean)) {
    const [loadedSourceIdentities, loadedDeltaClassifications, loadedSourceLedger] =
      await Promise.all([
        readFile(sourceIdentities, "utf8").then(JSON.parse),
        readFile(deltaClassifications, "utf8").then(JSON.parse),
        readFile(sourceLedger, "utf8").then(JSON.parse),
      ]);
    await assertFeatureSourceAuthority({
      sourceRevision,
      aliases: sourceKeyAliasManifest,
      deltaClassifications: loadedDeltaClassifications,
      snapshotIdentities: loadedSourceIdentities,
      featureLedger: ledger,
      sourceLedger: loadedSourceLedger,
      frozenSource,
    });
  }
  if (requireComplete) {
    assertSourceKeyAliasManifestRevisionMatchesTarget(sourceKeyAliasManifest, sourceRevision);
    assertFeatureDeliveryComplete(ledger, {
      surface: releaseSurface,
      phase: releasePhase,
    });
  }
  const serialized = `${JSON.stringify(ledger, null, 2)}\n`;
  const serializedContracts = `${JSON.stringify(contractCatalog(ledger), null, 2)}\n`;
  if (check) {
    const current = await readFile(output, "utf8").catch(() => null);
    if (current !== serialized) throw new Error(`기능 ledger가 최신 인벤토리와 일치하지 않습니다: ${output}`);
    const currentContracts = await readFile(contractsOutput, "utf8").catch(() => null);
    if (currentContracts !== serializedContracts) {
      throw new Error(`기능 contract catalog가 최신 인벤토리와 일치하지 않습니다: ${contractsOutput}`);
    }
    return ledger;
  }
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(path.dirname(contractsOutput), { recursive: true });
  await writeFile(output, serialized, "utf8");
  await writeFile(contractsOutput, serializedContracts, "utf8");
  return ledger;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const ledger = await writeFeatureLedger(options);
  process.stdout.write(`기능 ledger 완료: ${ledger.featureCount}개 행, ${ledger.sourceRevision}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
