#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const DEFAULT_REVISION = "cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc";
const DELIVERY_STATUSES = new Set([
  "implemented",
  "in_progress",
  "planned",
  "reference_only",
  "not_applicable",
]);
const NON_PRODUCT_DELIVERY_STATUSES = new Set(["reference_only", "not_applicable"]);

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
  return /^(SSE|WS)\s/.test(endpoint) || /\/stream(?:[/?}]|$)/.test(endpoint);
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

export function parseReferenceInventory(markdown, sourceRevision, portMap) {
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
    const streaming = endpoints.some(isStreamingEndpoint);
    const port = featurePortMap(portMap, section, contractId);
    features.push({
      id: `reference-feature-${number}`,
      contractId,
      section,
      line: index + 1,
      cells,
      endpoints,
      streaming,
      area: port.area,
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
    if (!Number.isInteger(feature.line) || feature.line < 1) errors.push(`${id}: line must be positive`);
    if (!Array.isArray(feature.cells) || feature.cells.length === 0) {
      errors.push(`${id}: cells are required`);
    }
    if (!Array.isArray(feature.endpoints)) errors.push(`${id}: endpoints must be an array`);
    if (typeof feature.streaming !== "boolean") errors.push(`${id}: streaming must be boolean`);
    if (!feature.area) errors.push(`${id}: area is required`);
    if (!DELIVERY_STATUSES.has(feature.deliveryStatus)) {
      errors.push(`${id}: deliveryStatus must be a supported value`);
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

export function assertFeatureDeliveryComplete(ledger) {
  const validationErrors = validateFeatureLedger(ledger);
  if (validationErrors.length > 0) {
    throw new Error(`기능 ledger validation failed:\n${validationErrors.join("\n")}`);
  }
  const incomplete = [];
  for (const feature of ledger.features) {
    if (NON_PRODUCT_DELIVERY_STATUSES.has(feature.deliveryStatus)) continue;
    if (feature.deliveryStatus !== "implemented") {
      incomplete.push(`${feature.contractId}: ${feature.deliveryStatus}`);
      continue;
    }
    const coverage = feature.coverage;
    for (const boundary of ["backend", "frontend"]) {
      if (!coverage[boundary]) incomplete.push(`${feature.contractId}: missing ${boundary} coverage`);
    }
    if (feature.desktopContract && !coverage.desktop) {
      incomplete.push(`${feature.contractId}: missing desktop coverage`);
    }
    if (feature.streaming && !coverage.realtime) {
      incomplete.push(`${feature.contractId}: missing realtime coverage`);
    }
  }
  if (incomplete.length > 0) {
    throw new Error(
      `출하 동등성 미완료 (${incomplete.length}개):\n${incomplete.join("\n")}`,
    );
  }
}

function parseArguments(argv) {
  const values = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    contractsOutput: DEFAULT_CONTRACTS_OUTPUT,
    portMap: DEFAULT_PORT_MAP,
    sourceRevision: DEFAULT_REVISION,
    check: false,
    requireComplete: false,
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
    if (
      !["--source", "--output", "--contracts-output", "--port-map", "--revision"].includes(flag)
      || !argv[index + 1]
    ) {
      throw new Error(`지원하지 않는 인자입니다: ${flag}`);
    }
    const value = argv[index + 1];
    if (flag === "--revision") values.sourceRevision = value;
    else if (flag === "--contracts-output") values.contractsOutput = path.resolve(value);
    else if (flag === "--port-map") values.portMap = path.resolve(value);
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
        id,
        section,
        endpoints,
        streaming,
        area,
        deliveryStatus,
        backendContract,
        frontendContract,
        desktopContract,
        verification,
        coverage,
      }) => ({
        contractId,
        id,
        section,
        endpoints,
        streaming,
        area,
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
  sourceRevision,
  check = false,
  requireComplete = false,
}) {
  const markdown = await readFile(source, "utf8");
  const loadedPortMap =
    typeof portMap === "string"
      ? JSON.parse(await readFile(portMap, "utf8"))
      : portMap;
  const ledger = parseReferenceInventory(markdown, sourceRevision, loadedPortMap);
  if (requireComplete) assertFeatureDeliveryComplete(ledger);
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
